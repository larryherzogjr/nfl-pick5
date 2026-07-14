# NFL Pick 5 — System Design Document (v2)

## Purpose

This document serves as the authoritative design specification for the NFL Pick 5 application. It is intended to be consumed by Claude Code (or any developer) to bootstrap and build the full-stack application from scratch.

**Changes in v2:** Push as a third pick option (double points on whole-number spreads); per-pick spread snapshotting; revised Odds API refresh cadence; separate scheduler container; pick visibility limited to post-kickoff; tiebreaker rules clarified (perfect weeks by count, then co-ranking).

---

## 1. Project Overview

**NFL Pick 5** is a weekly pick'em game where authenticated users select five NFL games against the spread each week. Picks are locked per-game at kickoff. At the end of each week, correct picks are tallied and a season-long leaderboard tracks standings.

### Key Requirements

- Users authenticate via Google OAuth 2.0
- Each NFL week, users pick exactly 5 games against the published spread
- On whole-number spreads, users may pick **push** as a third option, earning **2 points** if the game lands exactly on the spread
- Picks for a given game lock when that game's kickoff time is reached
- The spread used for grading is snapshotted on each pick at submission time and never changes thereafter
- A user's picks become visible to other users only once each respective game has kicked off
- Spreads are sourced from The Odds API (https://the-odds-api.com)
- A leaderboard tracks weekly and season-long standings
- Admin interface for manual score entry/corrections and spread overrides

---

## 2. Technology Stack

| Layer         | Technology                          | Rationale                                      |
|---------------|-------------------------------------|-------------------------------------------------|
| Backend       | Python / Flask                      | Proven stack; aligns with developer experience  |
| Database      | PostgreSQL                          | Relational integrity for picks, scores, users   |
| ORM           | SQLAlchemy + Flask-Migrate (Alembic)| Migration management, model-first development   |
| Auth          | Authlib (OAuth 2.0 client)          | Google OpenID Connect client                    |
| Frontend      | React (Vite)                        | Modern SPA; fast dev iteration                  |
| Styling       | Tailwind CSS                        | Utility-first; rapid UI development             |
| HTTP Client   | Axios                               | Promise-based; interceptors for auth tokens     |
| Scheduling    | APScheduler (separate process)      | Runs in its own container, not in Flask workers |
| Deployment    | Docker Compose                      | Single-command local dev; production-portable   |

---

## 3. Data Model

### 3.1 Entity-Relationship Summary

```
User 1──M Pick M──1 Game M──1 Week M──1 Season
```

### 3.2 Tables

#### `users`
| Column          | Type         | Notes                                      |
|-----------------|--------------|--------------------------------------------|
| id              | UUID (PK)    | Generated server-side                      |
| email           | VARCHAR(255) | Unique; from OAuth profile                 |
| display_name    | VARCHAR(100) | From OAuth profile; editable               |
| avatar_url      | TEXT         | From OAuth profile                         |
| oauth_display_name | VARCHAR(100) | Latest provider name used for reset     |
| oauth_avatar_url | TEXT        | Latest provider avatar used for reset      |
| oauth_provider  | VARCHAR(20)  | `'google'` for active accounts; legacy values may remain |
| oauth_subject   | VARCHAR(255) | Provider's unique user ID                  |
| is_admin        | BOOLEAN      | Default false                              |
| created_at      | TIMESTAMPTZ  | Auto-set                                   |
| last_login      | TIMESTAMPTZ  | Updated each login                         |

Unique constraint on `(oauth_provider, oauth_subject)`.

#### `seasons`
| Column      | Type        | Notes                          |
|-------------|-------------|--------------------------------|
| id          | SERIAL (PK) |                                |
| year        | INTEGER     | e.g., 2026                     |
| label       | VARCHAR(20) | e.g., "2026-2027"              |
| is_active   | BOOLEAN     | Only one active at a time      |

#### `weeks`
| Column      | Type         | Notes                                     |
|-------------|--------------|-------------------------------------------|
| id          | SERIAL (PK)  |                                           |
| season_id   | INTEGER (FK) | References seasons.id                     |
| week_number | INTEGER      | 1-18 (regular season) or 19+ for playoffs |
| label       | VARCHAR(30)  | e.g., "Week 1", "Wild Card"               |
| start_date  | DATE         | First game day of the week (usually Thu)  |
| end_date    | DATE         | Last game day of the week (usually Mon)   |

Unique constraint on `(season_id, week_number)`.

#### `games`
| Column            | Type          | Notes                                                                              |
|-------------------|---------------|------------------------------------------------------------------------------------|
| id                | SERIAL (PK)   |                                                                                    |
| week_id           | INTEGER (FK)  | References weeks.id                                                                |
| external_id       | VARCHAR(100)  | The Odds API event ID for dedup                                                    |
| home_team         | VARCHAR(50)   | Full team name, e.g., "Kansas City Chiefs"                                         |
| away_team         | VARCHAR(50)   |                                                                                    |
| home_abbr         | VARCHAR(5)    | e.g., "KC"                                                                         |
| away_abbr         | VARCHAR(5)    | e.g., "BUF"                                                                        |
| kickoff           | TIMESTAMPTZ   | Game start time (used for pick-lock logic)                                         |
| spread_home       | DECIMAL(4,1)  | **Current** market spread. Snapshotted onto each pick on submission. Not used for grading. |
| spread_source     | VARCHAR(50)   | Sportsbook name from Odds API, e.g., "fanduel"                                     |
| spread_updated_at | TIMESTAMPTZ   | Last time spread was refreshed                                                     |
| score_home        | INTEGER       | NULL until game final                                                              |
| score_away        | INTEGER       | NULL until game final                                                              |
| is_final          | BOOLEAN       | Default false; set true when scores posted                                         |
| admin_override    | BOOLEAN       | True if spread was manually set by admin                                           |

Unique constraint on `(week_id, external_id)`.

#### `picks`
| Column           | Type          | Notes                                                                |
|------------------|---------------|----------------------------------------------------------------------|
| id               | SERIAL (PK)   |                                                                      |
| user_id          | UUID (FK)     | References users.id                                                  |
| game_id          | INTEGER (FK)  | References games.id                                                  |
| picked_side      | VARCHAR(10)   | `'home'`, `'away'`, or `'push'`                                      |
| spread_at_pick   | DECIMAL(4,1)  | The game's `spread_home` snapshotted at the moment of pick. Required.|
| points_awarded   | INTEGER       | NULL until game is final; 0, 1, or 2 after grading                   |
| created_at       | TIMESTAMPTZ   | When the pick was first submitted                                    |
| updated_at       | TIMESTAMPTZ   | Updated whenever the pick is changed before kickoff                  |

Unique constraint on `(user_id, game_id)`.
Check constraint: `picked_side IN ('home', 'away', 'push')`.
Application-layer constraints (with DB backup checks where feasible):
- A user has at most 5 picks per week.
- `picked_side = 'push'` is only valid when `spread_at_pick` is a whole number (no fractional part).

---

## 4. Pick-Lock and Submission Logic

This is the core business rule:

```python
from datetime import datetime, timezone

def can_pick_game(game):
    """A game is pickable if kickoff has not yet occurred."""
    return datetime.now(timezone.utc) < game.kickoff

def submit_pick(user, game, picked_side):
    """Create or update a pick, snapshotting the current spread."""
    if not can_pick_game(game):
        raise PickLockError(f"{game.away_abbr}@{game.home_abbr} has already kicked off.")
    if picked_side not in ('home', 'away', 'push'):
        raise ValidationError("picked_side must be 'home', 'away', or 'push'.")
    if picked_side == 'push' and (float(game.spread_home) % 1) != 0:
        raise ValidationError("Push picks are only allowed on whole-number spreads.")

    pick = Pick.query.filter_by(user_id=user.id, game_id=game.id).first()
    if pick:
        # Updating an existing pick re-snapshots the current spread.
        pick.picked_side = picked_side
        pick.spread_at_pick = game.spread_home
        pick.updated_at = datetime.now(timezone.utc)
    else:
        existing_count = Pick.query.filter_by(user_id=user.id) \
            .join(Game).filter(Game.week_id == game.week_id).count()
        if existing_count >= 5:
            raise ValidationError("You may only pick 5 games per week.")
        pick = Pick(
            user_id=user.id,
            game_id=game.id,
            picked_side=picked_side,
            spread_at_pick=game.spread_home,
        )
        db.session.add(pick)
    db.session.commit()
```

### Lock Behavior on the Frontend

- Display a countdown or "LOCKED" badge per game card once kickoff passes.
- Poll the server or use the game's `kickoff` timestamp client-side to disable the pick toggle.
- The server is the **authority** — always validate server-side regardless of client state.

### Spread Snapshotting Rules

- The spread used for grading is the one stored on each individual pick (`picks.spread_at_pick`), captured at the moment of submission.
- If a user changes their pick before kickoff, the new pick **re-snapshots** the current spread. No exceptions.
- Once a game has kicked off, the pick is locked and the snapshot is final.
- `games.spread_home` continues to update from the Odds API up to kickoff, but only affects *future* new/changed picks. Admin overrides on `games.spread_home` do **not** retroactively re-grade already-submitted picks. The admin panel should make this explicit.

---

## 5. Scoring Logic

After a game is marked final, each pick is graded independently against its own snapshotted spread:

```python
def score_game(game):
    """Evaluate all picks for a game after it's marked final."""
    if not game.is_final or game.score_home is None or game.score_away is None:
        return

    actual_margin = game.score_home - game.score_away  # positive = home won by X

    for pick in Pick.query.filter_by(game_id=game.id).all():
        line = actual_margin + float(pick.spread_at_pick)
        pushed = (line == 0)
        home_covered = (line > 0)

        if pushed and pick.picked_side == 'push':
            pick.points_awarded = 2
        elif not pushed and pick.picked_side == 'home' and home_covered:
            pick.points_awarded = 1
        elif not pushed and pick.picked_side == 'away' and not home_covered:
            pick.points_awarded = 1
        else:
            pick.points_awarded = 0

    db.session.commit()
```

### Push Handling

- `picked_side = 'push'` is a strategic option, available only on whole-number spreads at pick time.
- A correct push pick (game lands exactly on the snapshotted spread) earns **2 points**.
- An incorrect push pick (any non-push outcome) earns **0 points**.
- A `'home'` or `'away'` pick on a game that pushes earns **0 points** — the player had the option to pick push and didn't.
- Because spreads are snapshotted per pick, two players may be graded against different lines on the same game. This is intentional.

---

## 6. API Endpoints

All endpoints return JSON. Auth-required endpoints use the server-side session
identified by the `pick5_session` cookie.

### 6.1 Auth

| Method | Path                  | Description                    |
|--------|-----------------------|--------------------------------|
| GET    | /auth/login/google    | Redirect to Google OAuth       |
| GET    | /auth/callback/google | Google OAuth callback          |
| GET    | /auth/me              | Return current user profile    |
| PATCH  | /auth/me              | Update display name            |
| POST   | /auth/me/avatar       | Upload and normalize avatar    |
| POST   | /auth/me/reset-to-oauth | Restore provider name/avatar |
| POST   | /auth/logout          | Clear session                  |

### 6.2 Weeks & Games

| Method | Path                          | Description                              |
|--------|-------------------------------|------------------------------------------|
| GET    | /api/seasons/active           | Get the active season                    |
| GET    | /api/weeks?season_id=X        | List weeks for a season                  |
| GET    | /api/weeks/current            | Get the active season's current week; look ahead up to two days between seeded week ranges |
| GET    | /api/weeks/:id/games          | List all games for a week with spreads   |

### 6.3 Picks

| Method | Path                          | Description                              |
|--------|-------------------------------|------------------------------------------|
| GET    | /api/weeks/:id/picks          | Get current user's picks for a week      |
| POST   | /api/weeks/:id/picks          | Submit/update picks (array of up to 5)   |
| GET    | /api/users/:user_id/weeks/:id/picks | Get a player's picks, filtered by kickoff visibility |

**POST body:**
```json
{
  "picks": [
    { "game_id": 42, "picked_side": "home" },
    { "game_id": 47, "picked_side": "push" }
  ]
}
```

Server captures `spread_at_pick` automatically from `games.spread_home` at the moment of submission. The endpoint is idempotent: it replaces the user's picks for unlocked games. Picks for locked games are silently preserved. Each pick included in the submission re-snapshots the current spread.

Server validates:
- The pick's game is in the requested week.
- Kickoff has not passed.
- `picked_side` is one of `home | away | push`.
- If `picked_side = 'push'`, the current `spread_home` is a whole number.
- The user's total picks for the week (after this submission) do not exceed 5.

### 6.4 Leaderboard

| Method | Path                              | Description                                  |
|--------|------------------------------------|----------------------------------------------|
| GET    | /api/leaderboard?season_id=X       | Season standings (points + perfect-weeks)    |
| GET    | /api/leaderboard?week_id=X         | Weekly standings                             |

**Response shape:**
```json
[
  {
    "rank": 1,
    "user": { "id": "...", "display_name": "Larry", "avatar_url": "..." },
    "points": 17,
    "perfect_weeks": 2,
    "total_picked": 15,
    "weekly_breakdown": [
      { "week": 1, "points": 6, "picks_scored": 5, "is_perfect": true }
    ]
  }
]
```

Tied players share the same `rank` value (e.g., two players at 17 points and 2 perfect weeks both rank 1; the next player ranks 3).

### Pick visibility rules

When any endpoint exposes another user's picks (leaderboard pick detail, profile pages):
- Only picks whose corresponding game has already kicked off (`game.kickoff <= now()`) are returned.
- A user's own picks are always fully visible to themselves.
- Aggregate counts (points, perfect weeks, total_picked) only reflect final, graded games — so totals cannot leak information about unkicked picks.

```python
def visible_picks(viewer, target_user, week):
    if viewer.id == target_user.id:
        return target_user.picks_for_week(week)
    now = datetime.now(timezone.utc)
    return [p for p in target_user.picks_for_week(week) if p.game.kickoff <= now]
```

### 6.5 Admin

| Method | Path                              | Description                          |
|--------|------------------------------------|--------------------------------------|
| POST   | /api/admin/games/:id/score        | Manually set final score             |
| POST   | /api/admin/games/:id/spread       | Override spread for a game (affects future picks only) |
| POST   | /api/admin/weeks/:id/refresh-odds | Refresh odds for the selected week   |
| POST   | /api/admin/weeks/:id/score-all    | Re-run scoring for all final games   |
| POST   | /api/admin/scores/refresh          | Refresh completed games from the API |
| GET    | /api/admin/users                   | List registered users                |

The spread override endpoint must display a warning that the change affects only new and re-submitted picks — already-locked picks retain their snapshot.

---

## 7. External Data Integration

### 7.1 The Odds API

- **Docs:** https://the-odds-api.com/liveapi/guides/v4/
- **Endpoint:** `GET https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds`
- **Key params:** `regions=us&markets=spreads&oddsFormat=american`
- **Auth:** API key passed as `?apiKey=YOUR_KEY`
- **Free tier:** 500 requests/month

**Refresh strategy:**
- APScheduler job runs **once daily** on non-game days (Tuesday, Wednesday, Friday, Saturday)
- Every 4–6 hours on game days (Thursday, Sunday, Monday) to catch line movement
- Each refresh upserts games by `external_id` and updates `spread_home` / `spread_updated_at`
- Prefer a single bookmaker for consistency (config option, default: `fanduel`)
- The Odds API does not return team abbreviations; the odds service maps full team names → abbreviations via `backend/app/utils/teams.py`

### 7.2 Score Ingestion

- **Endpoint:** `GET https://api.the-odds-api.com/v4/sports/americanfootball_nfl/scores`
- **Params:** `daysFrom=3`
- Poll every 30 minutes **only during active game windows** (roughly Thu 8–11pm, Sun 1–11pm, Mon 8–11pm Eastern Time)
- Run a daily 06:00 ET catch-up so unusual Wednesday/Friday/Saturday games and late finishes are finalized without waiting for the next normal game window
- When a game is marked complete, update `score_home`, `score_away`, set `is_final = True`, and trigger `score_game()`

**Monthly request budget estimate:** roughly 60–70 spread calls plus 180–190 score calls during a four-week month, below the 500/month free-tier limit.

---

## 8. Authentication Flow

### 8.1 Google OAuth 2.0

1. User clicks "Sign in with Google" → redirected to `/auth/login/google`
2. Flask redirects to Google's authorization endpoint
3. User consents → Google redirects to `/auth/callback/google` with auth code
4. Server exchanges code for tokens, fetches user profile (`email`, `name`, `picture`)
5. Upsert `users` row by `(oauth_provider='google', oauth_subject=sub)`
6. Set Flask session with `user_id`

If an email already belongs to another OAuth identity, do not auto-link it.
Redirect to the login screen with a clear instruction to use the Google account
that originally created it.

### 8.2 Session Management

- Use Flask server-side sessions (Flask-Session with PostgreSQL backend)
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`
- Session expiry: 30 days (rolling)
- React frontend checks `/auth/me` on load; if 401, show login screen
- Reject browser mutation requests whose `Origin` does not match `FRONTEND_URL`.
- Production startup rejects the placeholder secret and a non-HTTPS frontend URL.

---

## 9. Frontend Architecture

### 9.1 Pages / Routes

| Route               | Component           | Description                          |
|----------------------|---------------------|--------------------------------------|
| `/`                  | `<Home />`          | Redirect to current week picks       |
| `/login`             | `<Login />`         | Google sign-in                       |
| `/week/:weekId`      | `<WeekView />`      | Game cards with pick toggles         |
| `/leaderboard`       | `<Leaderboard />`   | Season standings table               |
| `/profile`           | `<Profile />`       | User info, pick history              |
| `/admin`             | `<AdminPanel />`    | Score entry, spread overrides        |

### 9.2 Key Components

- **`<GameCard />`** — Displays matchup, current market spread, kickoff time, and pick toggle. The toggle shows three options when the current spread is a whole integer (`home`, `away`, `push (2x)`) or two options on half-point spreads. Shows "LOCKED" state post-kickoff. Highlights the user's current pick and displays the user's snapshotted spread alongside if it differs from the current market line.
- **`<PickBar />`** — Sticky bottom bar showing "3 of 5 picks made" with submit button. Allows partial saves with a warning.
- **`<CountdownTimer />`** — Per-game countdown to kickoff that switches to a locked state when time expires.
- **`<LeaderboardTable />`** — Server-ranked table with rank (tied players share rank), user, points, and perfect-weeks count. Expandable rows show weekly breakdown or post-kickoff pick details.
- **`<WeekSelector />`** — Dropdown on the pick screen for direct week navigation, with a warning before discarding unsaved changes.

### 9.3 State Management

- Use React Context for auth state (`currentUser`)
- Use React Query (TanStack Query) for server state (games, picks, leaderboard), caching, and refetching after mutations.

---

## 10. Project Structure

```
nfl-pick5/
├── DESIGN.md
├── docker-compose.yml           # Postgres + backend + scheduler + frontend
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Flask app factory — MUST NOT import scheduler
│   │   ├── config.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── season.py
│   │   │   ├── week.py
│   │   │   ├── game.py
│   │   │   └── pick.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── weeks.py
│   │   │   ├── picks.py
│   │   │   ├── leaderboard.py
│   │   │   └── admin.py
│   │   ├── services/
│   │   │   ├── odds_service.py   # The Odds API integration
│   │   │   └── score_service.py  # Score fetching + grading
│   │   ├── scheduler/
│   │   │   ├── __init__.py
│   │   │   ├── run.py            # Entry point: python -m app.scheduler.run
│   │   │   └── jobs.py           # APScheduler job definitions
│   │   └── utils/
│   │       ├── auth_helpers.py
│   │       ├── teams.py          # NFL_TEAM_ABBR static map (32 teams)
│   │       └── validators.py
│   ├── migrations/               # Flask-Migrate / Alembic
│   ├── requirements.txt
│   ├── Dockerfile
│   └── wsgi.py
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api/
│   │   │   └── client.js         # Axios instance + interceptors
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── WeekView.jsx
│   │   │   ├── Leaderboard.jsx
│   │   │   ├── Profile.jsx
│   │   │   └── AdminPanel.jsx
│   │   ├── components/
│   │   │   ├── GameCard.jsx
│   │   │   ├── PickBar.jsx
│   │   │   ├── CountdownTimer.jsx
│   │   │   ├── LeaderboardTable.jsx
│   │   │   └── WeekSelector.jsx
│   │   └── styles/
│   │       └── tailwind.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── Dockerfile
└── .env.example
```

**Important:** the scheduler module must not be imported from `app/__init__.py`. It runs only as a standalone process via its own Docker service. The Flask web workers must not instantiate APScheduler under any circumstance.

---

## 11. Environment Variables

```bash
# .env.example

# Flask
FLASK_SECRET_KEY=change-me-to-random-string
POSTGRES_PASSWORD=pick5
DATABASE_URL=postgresql://pick5:pick5@db:5432/pick5

# OAuth — Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# The Odds API
ODDS_API_KEY=
ODDS_PREFERRED_BOOK=fanduel

# Frontend
VITE_API_BASE_URL=http://localhost:5000
SESSION_CLEANUP_N_REQUESTS=100
```

---

## 12. Docker Compose (Development)

```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: pick5
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-pick5}
      POSTGRES_DB: pick5
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    command: gunicorn -w 4 -b 0.0.0.0:5000 wsgi:app
    ports:
      - "5000:5000"
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgresql://pick5:pick5@db:5432/pick5}
    env_file:
      - .env
    depends_on:
      - db
    volumes:
      - ./backend:/app

  scheduler:
    build: ./backend
    command: python -m app.scheduler.run
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgresql://pick5:pick5@db:5432/pick5}
    env_file:
      - .env
    depends_on:
      - db
    volumes:
      - ./backend:/app

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_BASE_URL=http://localhost:5000
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  pgdata:
```

The `scheduler` service runs a single process (no Gunicorn worker fanout), so each APScheduler job fires exactly once across the system.

---

## 13. Deployment Notes

### Target Environment

This application is designed to run on a Docker-capable host. For the developer's environment, this is currently a Hetzner bare-metal Ubuntu 24.04 LTS server. The same docker-compose setup runs cleanly on any Docker-capable Linux host (Proxmox VM, LXC container, generic VPS).

### Production Considerations

- Serve Flask behind Gunicorn (`gunicorn -w 4 wsgi:app`).
- Put Nginx in front as reverse proxy: TLS termination, static file serving for the React build, request forwarding for `/api/*`, `/auth/*`, and `/avatars/*` to the backend on 127.0.0.1:5000.
- Flask **MUST** wrap `app.wsgi_app` with `werkzeug.middleware.proxy_fix.ProxyFix(app.wsgi_app, x_proto=1, x_host=1)` in the app factory. Without this, `url_for(_external=True)` generates `http://` URLs because Flask sees the proxied request as plain HTTP from 127.0.0.1, which breaks Google OAuth redirect URI matching. Nginx already sends `X-Forwarded-Proto: https` — ProxyFix is what makes Flask trust it.
- React production build: use the multi-stage frontend Dockerfile's `dist` target with BuildKit `--output type=local` to export the bundle to the host filesystem. No Node.js needs to be installed on the production server.
- Bare-metal hosts (vs. NAT-protected VMs): Docker port bindings MUST use `127.0.0.1:` prefixes in production compose overlays, because Docker bypasses UFW iptables. Binding to `0.0.0.0:` would publicly expose the backend and database regardless of firewall rules.
- The Nginx `location` for `/avatars/` MUST use the `^~` modifier (`location ^~ /avatars/ { proxy_pass http://127.0.0.1:5000; ... }`). Without it, the generic regex `location` for static asset extensions (`.jpg`, `.png`, etc.) matches first and tries to serve avatars from the React dist directory, returning broken images.
- Persistent user data lives at `/srv/nfl-pick5/data/` on the host, bind-mounted into the backend container at `/app/data/`. Currently `data/avatars/` is the only directory used; create it explicitly as the `pick5` user before the first `docker compose up` so Docker doesn't auto-create it as root.
- Backups must cover both PostgreSQL (via `pg_dump`) and the avatar files (via `tar` of `/srv/nfl-pick5/data/avatars`). 14-day local retention; rsync to offsite storage optional but recommended.
- The OAuth redirect URI must be updated in Google Cloud Console to match the production domain.
- Two-account model: a runtime user (`pick5`) owns the app directory and runs Docker; an admin user (`lherzog`) is the only SSH-reachable account. The runtime user has no SSH access (`sshd_config` AllowUsers restricts to the admin user). All operational commands run via `sudo -iu pick5` from an admin session.

### Scheduling and Time-Range Caveats

- `seed-weeks <year>` computes Week 1 as the Thursday after Labor Day through the following Monday. This is correct in nearly all years, but the NFL occasionally schedules a Wednesday opener (most recently 2026) or an international game on Saturday. After seeding, spot-check Week 1's date range against the published NFL schedule and adjust with a manual `UPDATE` if any game's kickoff falls outside the seeded `start_date`/`end_date`. Games outside the range will silently skip during odds refresh with `skipped_no_week`.
- `/api/weeks/current` uses the current active-season range first, then looks ahead at most two days. This bridges the normal Tuesday/Wednesday gap without redirecting users into a far-future season during the offseason.
- The season created by `seed-weeks` defaults to `is_active = false` (the partial unique index only allows one active season, so auto-activating would risk overwriting in future-year seedings). Mark the season active explicitly: `UPDATE seasons SET is_active = true WHERE year = <year>;`. Without this, the AdminPanel weeks dropdown shows "No weeks available" and `/api/seasons/active` returns 404.
- The built-in seeder creates 18 regular-season weeks. The schema and frontend can represent week 19+, but postseason rows currently require a separate seeding/operations decision.

### Filesystem Permissions for Reverse-Proxied Static Files

When Nginx runs on the host (not in a container) and serves a React bundle out of a directory owned by a different user, the entire path from `/` down to the bundle must be traversable by Nginx's user (`www-data` on Ubuntu):

- `/srv/nfl-pick5` should be mode **755** (not 750). The runtime user owns it, but `www-data` needs `+x` to walk into it.
- The dist output directory created by BuildKit's `--output type=local` is mode **700** by default. After every frontend build, `chmod -R go+rX /srv/nfl-pick5/frontend/dist` to restore group/other read on files and traverse on directories.
---

## 14. Build Order for Claude Code

When implementing this project, follow this sequence:

1. **Scaffold project structure** — Create directories (including `scheduler/` package and `utils/teams.py`), `requirements.txt`, `package.json`, Dockerfiles, `docker-compose.yml`
2. **Database models + migrations** — All SQLAlchemy models. Note: `picks.picked_side` enum includes `'push'`, plus `spread_at_pick` (required) and `points_awarded` (nullable).
3. **Auth flow** — Google OAuth end-to-end (login → callback → session → /auth/me).
4. **Odds service** — Fetch from The Odds API, upsert games using `utils/teams.py` for abbreviation mapping, store spreads. Test with a manual trigger endpoint.
5. **Weeks & games API** — CRUD-read endpoints for the frontend to consume
6. **Picks API** — Submit/update/retrieve with lock validation, spread snapshotting, and push-on-whole-spreads validation
7. **Scoring service** — Score ingestion + per-pick grading logic producing `points_awarded` of 0/1/2
8. **Frontend: Auth + routing** — Login page, AuthContext, protected routes
9. **Frontend: WeekView + GameCard** — Three-state pick toggle (home/away/push), push only shown on whole-number spreads
10. **Frontend: PickBar + submission** — Pick count tracking, submit flow
11. **Frontend: Leaderboard** — Points, perfect-weeks, co-ranking display
12. **Admin panel** — Score entry, spread override (with warning re: retroactive non-effect), manual refresh triggers
13. **Scheduler** — APScheduler jobs in a standalone container, separate from web workers
14. **Polish** — Error handling, loading states, mobile responsiveness, pick-visibility verification, rules page wired up

---

## 15. Rules Page Content (for display in the app)

> **NFL Pick 5 — Rules**
>
> 1. Each week during the NFL season, you pick **5 games against the spread**.
> 2. You may change your picks at any time **before that game's kickoff**.
> 3. Once a game kicks off, your pick for that game is **locked**.
> 4. You do not have to make all 5 picks at once — you can pick games as lines are posted and come back later.
> 5. **The spread is locked when you make your pick.** If you change your pick later, the new pick uses the spread current at that moment. No exceptions.
> 6. After each game is final, your pick is graded against your snapshotted spread:
>    - Picking the side that covers earns **1 point**.
>    - On **whole-number spreads only**, you may pick **PUSH** as a third option. A correct push pick earns **2 points**.
>    - A push outcome on a game where you picked home or away earns **0 points** — you had the option to pick push.
> 7. Other players' picks are visible to you only **after each respective game kicks off**.
> 8. The **season leaderboard** ranks players by **total points** across all weeks.
> 9. **Tiebreaker:** the player with more **perfect weeks** ranks higher. A perfect week is one where all 5 of your picks scored at least 1 point. Push values don't matter for the tiebreaker — five 1-point covers is the same as five 2-point pushes.
> 10. If players are still tied after the perfect-weeks tiebreaker, they share the rank (**co-ranking**).

---

*End of design document, version 2.*
