# NFL Pick 5

NFL Pick 5 is a weekly NFL against-the-spread pick'em application. Players
submit up to five picks, each pick snapshots the line available when it is
saved, and the server locks that pick at kickoff. Whole-number spreads also
allow a two-point push prediction.

## Architecture

- **Frontend:** React 18, Vite, Tailwind CSS, React Router, React Query, Axios
- **Backend:** Python 3.12, Flask, SQLAlchemy, Flask-Migrate, Flask-Session
- **Database:** PostgreSQL 16
- **Integrations:** Google OpenID Connect and The Odds API
- **Background work:** APScheduler in a standalone scheduler service
- **Production:** Docker Compose behind host Nginx and Let's Encrypt

The Flask server owns all lock, visibility, spread-snapshot, and scoring
decisions. The browser's countdowns and disabled controls are presentation
only. `DESIGN.md` is the business-behavior specification; `DEPLOY.md` is the
production runbook.

## Local development

Requirements:

- Docker with Compose v2.24 or newer
- Node.js 20.19 or newer for host-side frontend checks

Create the local environment and start the stack:

```bash
cp .env.example .env
docker compose up -d
docker compose exec backend flask db upgrade
docker compose exec backend flask seed-weeks 2026
```

`seed-weeks` creates an inactive regular season. Activate it explicitly after
checking the date ranges:

```sql
UPDATE seasons SET is_active = true WHERE year = 2026;
```

The development frontend is at `http://localhost:3000`; the backend is at
`http://localhost:5000`. Google login and live odds require credentials in
`.env`.

## Validation

Backend:

```bash
cd backend
ruff check app tests
black --check app tests
python -m unittest discover -s tests -v
```

Frontend:

```bash
cd frontend
npm ci
npm test
npm run lint
npm run format:check
npm run build
```

Production Compose:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
```

CI additionally applies the full Alembic chain to PostgreSQL, checks for model
drift, and runs the backend tests against PostgreSQL rather than SQLite.

## Key behavior

- Submissions replace unlocked picks for that week and preserve locked picks.
- A pick is graded only against its own `spread_at_pick`.
- Other users' choices remain hidden until each corresponding kickoff.
- A perfect week requires five graded picks and a positive result on all five;
  the number of points alone is not sufficient because push picks are worth two.
- The Home route uses the active season's current week, falling forward at most
  two days so Tuesday and Wednesday lead into the next Thursday-starting week.
- Manual week-scoped odds refreshes update only the selected week. Scheduled
  refreshes remain global.

## Production notes

Production serves the Vite bundle directly from host Nginx. Backend and
PostgreSQL ports must remain bound to `127.0.0.1`, `/healthz` must proxy to
Flask, and avatar uploads require a 6 MB Nginx body limit. See `DEPLOY.md` for
the full build, migration, backup, permissions, and recovery procedure.

The included seeder creates 18 regular-season weeks. Postseason week rows can
be represented by the schema and displayed by the frontend, but automated
postseason seeding is not currently included.
