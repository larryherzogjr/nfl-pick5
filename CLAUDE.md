# NFL Pick 5 — Claude Code Context

Authoritative spec: **`DESIGN.md`** in this directory. Read it before making any changes.

## Stack
- Backend: Python 3.12 + Flask + SQLAlchemy + APScheduler
- Database: PostgreSQL 16
- Frontend: React (Vite) + Tailwind CSS
- Auth: Authlib (Google OAuth 2.0)
- Deployment: Docker Compose (4 services: db, backend, scheduler, frontend)

## Build order
Follow DESIGN.md §14 strictly. Do not skip ahead — auth before picks, picks before scoring, scheduler last.

## Conventions
- Python: ruff (lint) + black (format), PEP 8
- Frontend: ESLint + Prettier
- All timestamps are TIMESTAMPTZ — never naive datetimes
- Server is the authority for pick-lock; client-side checks are UX only
- Pick submissions replace all unlocked picks for the week; locked picks are preserved
- Other users' picks must never be exposed before the corresponding kickoff
- `picks.spread_at_pick` is captured server-side at submission, never re-derived
- The scheduler module (`app/scheduler/`) MUST NOT be imported from the Flask app factory — it runs standalone via `python -m app.scheduler.run` in its own container

## Local dev commands
- `docker compose up -d` — start full stack
- `docker compose logs -f backend` — tail backend logs
- `docker compose exec backend flask db upgrade` — run migrations
- `docker compose exec backend flask db migrate -m "..."` — create migration
- `docker compose exec db psql -U pick5` — open psql

## Production target
Hetzner bare-metal Ubuntu 24.04 LTS. App runs as user `pick5` at `/srv/nfl-pick5`, fronted by host Nginx + Let's Encrypt. In production compose, non-public services (backend, db) MUST bind to `127.0.0.1:` not `0.0.0.0:`.

## Production frontend build
The frontend Dockerfile is multi-stage with a `dist` target that exports the built bundle to the host via BuildKit. No npm/node needs to be installed on the host. Local dev (`docker compose up`) is unchanged — `dev` is the default stage.

```
docker build --target dist --output type=local,dest=./frontend/dist \
    --build-arg VITE_API_BASE_URL=https://pick5.yourdomain.com ./frontend
```

This produces `./frontend/dist/` for Nginx to serve.

## Deferred env vars
Code may reference these but they're not yet provisioned:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `ODDS_API_KEY`

## Local dev setup in worktrees
At the start of any session that runs `docker compose`, copy `.env.example` to `.env` if `.env` doesn't exist (it's gitignored and doesn't carry over between worktrees).

Before running `git worktree remove`, run `docker compose down` from inside the worktree. Otherwise the containers from that worktree's compose stack stick around as orphans — they're isolated by project name (derived from the worktree directory) so they don't conflict with the main project's containers, but they hold ports (most commonly 5432 for the worktree's db service) and consume resources until manually `docker stop`'d.

## Production deployment knowledge

The codebase deploys to a Hetzner bare-metal Ubuntu host fronted by host-level Nginx + Let's Encrypt. The full runbook lives in `DEPLOY.md`; key code-level requirements that affect implementation:

- **Flask MUST use ProxyFix middleware.** In `backend/app/__init__.py`, immediately after `app = Flask(__name__)`:
  ```python
  from werkzeug.middleware.proxy_fix import ProxyFix
  app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
  ```
  This makes Flask trust the `X-Forwarded-Proto: https` header sent by Nginx. Without it, `url_for(_external=True)` generates `http://` URLs and OAuth redirect-URI matching fails.

- **Production compose binds to localhost only.** In `docker-compose.prod.yml`, backend and db port mappings use `127.0.0.1:` prefixes. Docker bypasses UFW iptables on bare-metal hosts; binding to `0.0.0.0:` would publicly expose internal services.

- **Frontend builds via multi-stage Dockerfile.** The `dist` stage is `FROM scratch` and exports `/app/dist` via BuildKit `--output type=local`. No Node.js on the production host. After every export, `chmod -R go+rX` the dist directory so host Nginx (running as `www-data`) can read it — BuildKit creates the output directory with mode 700.

- **`/srv/nfl-pick5` is mode 755**, not 750. Host Nginx needs `+x` to traverse into it.

- **`seed-weeks` does not activate seasons.** It creates the Season row with `is_active = false` so future-year seedings don't accidentally overwrite the current active season. An explicit `UPDATE seasons SET is_active = true WHERE year = <year>` is required after seeding.

- **Week 1 date range may need manual adjustment.** `seed-weeks` assumes Thursday-after-Labor-Day through the following Monday. NFL occasionally schedules Wednesday openers or international Saturday games that fall outside this range. After seeding, glance at the published schedule and `UPDATE weeks SET start_date = ...` if needed; otherwise odds refresh will silently skip out-of-range games with `skipped_no_week`.
- **Score refresh includes a daily 06:00 ET catch-up.** Keep this job when adjusting the scheduler; it covers unusual Friday/Saturday games and late Monday finishes.

## Production deployment knowledge

The codebase deploys to a Hetzner bare-metal Ubuntu host fronted by host-level Nginx + Let's Encrypt. The full runbook lives in `DEPLOY.md`; key code-level requirements that affect implementation:

- **Flask MUST use ProxyFix middleware.** In `backend/app/__init__.py`, immediately after `app = Flask(__name__)`:
  ```python
  from werkzeug.middleware.proxy_fix import ProxyFix
  app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
  ```
  This makes Flask trust the `X-Forwarded-Proto: https` header sent by Nginx. Without it, `url_for(_external=True)` generates `http://` URLs and OAuth redirect-URI matching fails.

- **Production compose binds to localhost only.** In `docker-compose.prod.yml`, backend and db port mappings use `127.0.0.1:` prefixes. Docker bypasses UFW iptables on bare-metal hosts; binding to `0.0.0.0:` would publicly expose internal services.

- **Frontend builds via multi-stage Dockerfile.** The `dist` stage is `FROM scratch` and exports `/app/dist` via BuildKit `--output type=local`. No Node.js on the production host. After every export, `chmod -R go+rX` the dist directory so host Nginx (running as `www-data`) can read it — BuildKit creates the output directory with mode 700.

- **`/srv/nfl-pick5` is mode 755**, not 750. Host Nginx needs `+x` to traverse into it.

- **Persistent user data** (currently just avatars) lives at `/srv/nfl-pick5/data/`, bind-mounted into the backend container at `/app/data/`. Create the host path as `pick5` before the first `docker compose up` to avoid Docker auto-creating it as root.

- **Nginx `/avatars/` must use the `^~` modifier.** Without it, the regex location for `.jpg`/`.png`/etc. wins and tries to serve uploaded avatars out of the React dist directory, returning broken images. The correct block:
  ```nginx
  location ^~ /avatars/ {
      proxy_pass http://127.0.0.1:5000;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
  }
  ```

- **OAuth callbacks must NOT overwrite user-facing `display_name` or `avatar_url`** on subsequent logins. They should only update the shadow fields `oauth_display_name` and `oauth_avatar_url` (plus `email` and `last_login`). User-facing fields are user-editable via `PATCH /auth/me` (name) and `POST /auth/me/avatar` (avatar upload); the OAuth shadows preserve the provider's current values so `POST /auth/me/reset-to-oauth` has somewhere to copy from.

- **`seed-weeks` does not activate seasons.** It creates the Season row with `is_active = false` so future-year seedings don't accidentally overwrite the current active season. An explicit `UPDATE seasons SET is_active = true WHERE year = <year>` is required after seeding.

- **Week 1 date range may need manual adjustment.** `seed-weeks` assumes Thursday-after-Labor-Day through the following Monday. NFL occasionally schedules Wednesday openers or international Saturday games that fall outside this range. After seeding, glance at the published schedule and `UPDATE weeks SET start_date = ...` if needed; otherwise odds refresh will silently skip out-of-range games with `skipped_no_week`.
