# NFL Pick 5 — Claude Code Context

Authoritative spec: **`DESIGN.md`** in this directory. Read it before making any changes.

## Stack
- Backend: Python 3.12 + Flask + SQLAlchemy + APScheduler
- Database: PostgreSQL 16
- Frontend: React (Vite) + Tailwind CSS
- Auth: Authlib (Google + Meta OAuth 2.0)
- Deployment: Docker Compose (4 services: db, backend, scheduler, frontend)

## Build order
Follow DESIGN.md §14 strictly. Do not skip ahead — auth before picks, picks before scoring, scheduler last.

## Conventions
- Python: ruff (lint) + black (format), PEP 8
- Frontend: ESLint + Prettier
- All timestamps are TIMESTAMPTZ — never naive datetimes
- Server is the authority for pick-lock; client-side checks are UX only
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

## Deferred env vars
Code may reference these but they're not yet provisioned:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `META_APP_ID`, `META_APP_SECRET`
- `ODDS_API_KEY`
