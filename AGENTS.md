# NFL Pick 5 contributor guide

Read `DESIGN.md` before changing business behavior and `DEPLOY.md` before
changing production configuration.

## Stack and checks

- Backend: Python 3.12, Flask, SQLAlchemy, PostgreSQL, APScheduler
- Frontend: React, Vite, Tailwind CSS
- `cd frontend && npm run lint && npm run build`
- `cd backend && ruff check app tests && black --check app tests`
- `cd backend && python -m unittest discover -s tests -v`
- `docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet`

## Invariants

- The server is authoritative for kickoff locking.
- A pick always uses `spread_at_pick`; never re-grade from the current game line.
- A submission replaces unlocked picks for that week and preserves locked picks.
- Never expose another user's pick before that game's kickoff.
- APScheduler runs only in the standalone scheduler service.
- Preserve the daily 06:00 ET score catch-up job for unusual game days.
- Production database and backend ports bind only to `127.0.0.1`.
- Production Nginx must proxy `/healthz` to Flask and allow 6 MB request bodies.
