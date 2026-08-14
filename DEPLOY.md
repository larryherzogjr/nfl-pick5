# DEPLOY.md — NFL Pick 5 Production Deployment

This runbook takes the feature-complete codebase and walks it onto the Hetzner bare-metal server end-to-end. It assumes:

- The Ubuntu 24.04 server is provisioned and hardened (lherzog + pick5 users, SSH key-only, UFW, Docker, Nginx, Certbot installed).
- The codebase is in a GitHub repo (`larryherzogjr/nfl-pick5`) on the `main` branch.
- You're working from your MacBook with SSH access as `lherzog`.
- The application directory `/srv/nfl-pick5` is owned `pick5:pick5` with mode **755** (not 750). Host nginx runs as `www-data` and must be able to traverse into this directory to serve the React bundle. If you provisioned it 750, fix with `sudo chmod 755 /srv/nfl-pick5` before continuing.
- The Flask app factory wraps `app.wsgi_app` with `werkzeug.middleware.proxy_fix.ProxyFix(app.wsgi_app, x_proto=1, x_host=1)`. Without this, `url_for(_external=True)` generates `http://` URLs (because Flask sees the proxied request from 127.0.0.1 as plain HTTP), which breaks Google OAuth redirect-URI matching. This lives in `backend/app/__init__.py` in the current codebase.

Work through this top to bottom. Each phase has a checklist; tick items as you go. Code blocks in `dev:` boxes run on your MacBook, `srv-lherzog:` runs on the server as `lherzog`, `srv-pick5:` runs as `pick5` (via `sudo -iu pick5`).

---

## Phase 1: Off-server preparation

Everything in this phase happens in browsers / dashboards. Get all of it done before touching the server — once credentials are in hand, the server-side work moves fast.

### 1.1 DNS records

Pick the domain you'll use (e.g. `pick5.yourdomain.com`). At your DNS provider:

- [ ] A record: `pick5.yourdomain.com` → server's IPv4
- [ ] AAAA record: `pick5.yourdomain.com` → server's IPv6

Hetzner gives you both. Find them in the Robot panel under the server's IP details. Set TTL to 5 minutes during initial setup so you can iterate; bump it back to an hour or more after you're stable.

Verify before proceeding:

```
dev: dig +short pick5.yourdomain.com
dev: dig +short AAAA pick5.yourdomain.com
```

Both should return the server's IPs. If they don't, wait a few minutes for propagation.

### 1.2 Hetzner rDNS (reverse DNS)

In the Hetzner Robot panel, find the server → IPs → set the rDNS for both IPv4 and IPv6 to `pick5.yourdomain.com`. This makes log files and outbound mail look clean, and matters if you ever send notification emails from this box.

Verify:

```
dev: dig +short -x <ipv4-address>
dev: dig +short -x <ipv6-address>
```

Both should return `pick5.yourdomain.com.` (note trailing dot).

### 1.3 Google OAuth credentials

At https://console.cloud.google.com:

- [ ] Create a new project (or pick an existing one)
- [ ] Enable the "Google Identity" / OIDC use case (consent screen setup is automatic for "external" user type if you don't want internal-only)
- [ ] Configure the OAuth consent screen — application name, support email, scopes: `openid email profile`
- [ ] Credentials → Create Credentials → OAuth 2.0 Client ID → Web application
- [ ] Authorized redirect URI: `https://pick5.yourdomain.com/auth/callback/google`
- [ ] Save the Client ID and Client Secret somewhere safe — these go into the production `.env`

### 1.4 The Odds API key

At https://the-odds-api.com:

- [ ] Sign up for a free account
- [ ] Verify email, log in
- [ ] Account → API Key — copy it
- [ ] Free tier is 500 requests/month — well above our estimated 208/month usage

### 1.5 Hetzner Storage Box (optional, recommended)

For offsite Postgres backups, order a Storage Box from Hetzner (BX11 is €3.81/month for 1 TB; way more than you need but it's the cheapest plan).

- [ ] Order in Hetzner Robot panel → Storage Box
- [ ] Note the username (looks like `u123456`) and hostname (`u123456.your-storagebox.de`)
- [ ] Set up SSH key authentication for the storage box so rsync runs unattended

Skip this for now if you want — local backups are fine for week 1, and you can add offsite later.

---

## Phase 2: Server-side preparation

### 2.1 Clone the repo

```
dev: ssh lherzog@pick5.yourdomain.com
srv-lherzog: sudo -iu pick5
srv-pick5: cd /srv/nfl-pick5
srv-pick5: git clone https://github.com/larryherzogjr/nfl-pick5.git .
```

If the repo is private and you need to authenticate, set up a deploy key for the pick5 user (GitHub Settings → Deploy keys for the repo), or use a PAT and the HTTPS URL with credentials.

### 2.2 Create the production `.env`

```
srv-pick5: cp .env.example .env
srv-pick5: nano .env
```

Fill in real values:

```bash
# Generate a strong random secret for Flask sessions
FLASK_SECRET_KEY=  # paste output of: python3 -c "import secrets; print(secrets.token_hex(32))"

# Use the same strong password in both values. Compose passes POSTGRES_PASSWORD
# to PostgreSQL and DATABASE_URL to the backend and scheduler.
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgresql://pick5:<strong-random-password>@db:5432/pick5

# From Phase 1.3
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# From Phase 1.4
ODDS_API_KEY=
ODDS_PREFERRED_BOOK=fanduel

# Production URLs
FRONTEND_URL=https://pick5.yourdomain.com
VITE_API_BASE_URL=https://pick5.yourdomain.com
SESSION_COOKIE_SECURE=true
SESSION_CLEANUP_N_REQUESTS=100
```

**Important**: `POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL`
must match. Compose reads both from `.env`; do not edit committed Compose files to
rotate production credentials.

Lock the file down:

```
srv-pick5: chmod 600 .env
```

### 2.3 Build the frontend production bundle

The frontend service in `docker-compose.yml` runs the Vite dev server. In production, Nginx serves a pre-built static bundle instead. The frontend Dockerfile has a `dist` stage that exports the built bundle to the host via BuildKit:

```
srv-pick5: cd /srv/nfl-pick5
srv-pick5: docker build --target dist --output type=local,dest=./frontend/dist \
    --build-arg VITE_API_BASE_URL=https://pick5.yourdomain.com ./frontend
```

This produces `/srv/nfl-pick5/frontend/dist/` with the compiled React app. Nginx will serve it. No Node.js needs to be installed on the host — all build tooling stays inside Docker.

**Important**: BuildKit's `--output type=local` creates the destination directory with mode **700** (owner-only). The files inside have sensible modes (644 for files, 755 for subdirectories), but the parent dist directory itself blocks nginx traversal. Open it up immediately after every build:

```
srv-pick5: chmod -R go+rX /srv/nfl-pick5/frontend/dist
```

The `go+rX` adds group+other read on files and traverse on directories (capital X only adds execute on dirs and already-executable files — won't make plain files executable).

You'll re-run this command on every deploy where frontend code changed (see Phase 6.2).

### 2.4 Nginx site configuration

This is a **two-pass** setup. A single config with `listen 443 ssl` and commented-out `ssl_certificate` directives won't pass `nginx -t` (the directive requires the cert file to exist), and `certbot --nginx` can't run if nginx is broken. So we start with HTTP-only, obtain the cert with `certbot certonly --webroot` (which doesn't touch nginx), then swap in the full HTTPS config.

#### 2.4a HTTP-only initial config

As lherzog:

```
srv-lherzog: sudo nano /etc/nginx/sites-available/pick5
```

Paste:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name pick5.yourdomain.com;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Placeholder until cert is obtained
    location / {
        return 200 "Setup in progress.\n";
        add_header Content-Type text/plain;
    }
}
```

Enable, validate, reload:

```
srv-lherzog: sudo ln -s /etc/nginx/sites-available/pick5 /etc/nginx/sites-enabled/
srv-lherzog: sudo rm /etc/nginx/sites-enabled/default
srv-lherzog: sudo nginx -t
srv-lherzog: sudo systemctl reload nginx
```

Confirm reachability: `curl http://pick5.yourdomain.com` from anywhere should return `Setup in progress.`

#### 2.4b Obtain the cert via certbot certonly

DNS must be resolving correctly first (Phase 1.1). Then:

```
srv-lherzog: sudo certbot certonly --webroot -w /var/www/html -d pick5.yourdomain.com
```

This uses the ACME HTTP-01 challenge against the webroot path we just exposed. Certbot writes cert files to `/etc/letsencrypt/live/pick5.yourdomain.com/` and **does not modify your nginx config**. Auto-renewal is set up via systemd timer (`systemctl list-timers | grep certbot`).

Verify:

```
srv-lherzog: sudo ls /etc/letsencrypt/live/pick5.yourdomain.com/
# Should list: cert.pem  chain.pem  fullchain.pem  privkey.pem
srv-lherzog: sudo certbot renew --dry-run
# Should report success
```

#### 2.4c Full production config

The repository now keeps the live-domain configuration at
`deploy/nginx-pick5.conf`. Copy that file to
`/etc/nginx/sites-available/pick5`, or use the equivalent annotated template
below when deploying a different domain.

```
srv-lherzog: sudo nano /etc/nginx/sites-available/pick5
```

Replace contents with:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name pick5.yourdomain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name pick5.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/pick5.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pick5.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # The application accepts avatars up to 5 MB. Leave room for multipart overhead.
    client_max_body_size 6m;

    # Database-aware health check. Keep this before the SPA fallback so external
    # monitors test Nginx + Flask + PostgreSQL rather than receiving index.html.
    location = /healthz {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # OAuth endpoints
    location /auth/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # User-uploaded avatar files served by Flask out of /srv/nfl-pick5/data/avatars.
    # The ^~ modifier is REQUIRED — without it, the regex location block below
    # for static asset extensions (.jpg, .png, etc.) wins and tries to serve
    # avatars out of the React dist directory, returning 404 / broken images.
    location ^~ /avatars/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Frontend static files + SPA fallback
    root /srv/nfl-pick5/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache JS/CSS/asset bundles aggressively (Vite hashes filenames)
    location ~* \.(?:js|css|woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|webp|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }
}
```

Validate and reload:

```
srv-lherzog: sudo nginx -t
srv-lherzog: sudo systemctl reload nginx
srv-lherzog: curl -I https://pick5.yourdomain.com
```

The curl should return `HTTP/2 200` once the dist directory has been built (Phase 2.3). Before that it'll return `HTTP/2 403` because nginx can find the dist directory but there's no `index.html` yet — that's expected and resolves once Phase 2.3 has produced the bundle.

The `X-Forwarded-Proto: https` header we send from nginx is consumed by the Flask app's ProxyFix middleware (see assumptions at the top) so that `url_for(_external=True)` generates `https://` URLs. This is what makes OAuth redirect URIs match.

---

## Phase 3: First deployment

### 3.1 Build and bring up the stack

Before the first `docker compose up`, create the persistent data directories that the prod compose bind-mounts into the backend container. If you skip this, Docker will auto-create the host paths as root-owned, which makes them awkward to back up and inspect from the `pick5` user account.

```
srv-pick5: mkdir -p /srv/nfl-pick5/data/avatars
```

Currently `data/avatars` is the only persistent data directory. If more get added (uploaded receipts, exports, etc.), create them here too.

As pick5:

```
srv-pick5: cd /srv/nfl-pick5
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml build
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d db
```

Wait ~5 seconds for Postgres to initialize.

### 3.2 Run migrations

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    run --rm backend flask db upgrade
```

Expected: Alembic applies every pending migration through the current head.
Existing installations may already have `flask_sessions`; the session-table
migration detects and adopts that table safely.

### 3.3 Seed the season's weeks

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    run --rm backend flask seed-weeks 2026
```

Expected: `Seeded 18 new weeks for season 2026-2027 (0 already existed)`.

`seed-weeks` creates the Season row with `is_active = false` by default (the partial unique index on `is_active = true` only allows one row, so auto-activating would risk overwriting an existing active season in future-year seedings). You need to flip it on explicitly:

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db psql -U pick5
```

```sql
UPDATE seasons SET is_active = true WHERE year = 2026;

-- Verify
SELECT id, year, label, is_active FROM seasons;
\q
```

Without this, the AdminPanel weeks dropdown shows "No weeks available" and `/api/seasons/active` returns 404.

For the 2026 preseason beta, seed the three verified preseason ranges into the
same season. This command is idempotent and preseason Week 1 can coexist with
regular Week 1 because weeks are phase-scoped:

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    run --rm backend flask seed-preseason-weeks 2026
```

#### Spot-check Week 1 date range

`seed-weeks` computes Week 1 as the Thursday after Labor Day through the following Monday. This is correct in nearly all years, but the NFL occasionally schedules a Wednesday opener (most recently 2026, to accommodate an Australia game on Thursday). If Week 1 has a Wednesday opener that year, the Wednesday game's kickoff will fall outside the seeded date range and the odds refresh will silently skip it with `skipped_no_week: 1`.

After seeding, glance at the NFL's published Week 1 schedule for the season. If any game's date falls outside Thursday through Monday, adjust the range:

```sql
-- Example for 2026 (Wednesday Sept 9 opener):
UPDATE weeks SET start_date = '2026-09-09' WHERE season_id = 1 AND week_number = 1;
```

The same applies if future seasons add Saturday or Tuesday games — extend the range to bracket every kickoff. Thanksgiving week (typically Week 12 or 13) routinely includes Wednesday and Friday games and is also worth spot-checking.

### 3.4 Bring up the backend and scheduler

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The `frontend` service is disabled by the prod override (profile-gated), so only `db`, `backend`, and `scheduler` start.

Verify containers are up:

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

All three should be `running`. Check logs:

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml logs scheduler
```

Scheduler log should show "Scheduler starting" plus the 6 registered jobs with cron triggers.

### 3.5 First odds refresh

Hit the admin trigger to populate games for Week 1. But first you need an admin user — see Phase 4.

---

## Phase 4: Admin user setup

### 4.1 Create your user via OAuth

In a browser, visit `https://pick5.yourdomain.com`. You should redirect to `/login`. Click "Sign in with Google" → consent → redirect back to `/`. This creates your User row.

If anything fails here, check:
- `docker compose logs backend` for OAuth errors
- Browser network tab for the `/auth/callback/google` response

### 4.2 Promote yourself to admin

As pick5, open psql:

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    exec db psql -U pick5
```

In psql:

```sql
SELECT id, email, display_name, is_admin FROM users;
-- find your row, copy the id

UPDATE users SET is_admin = true WHERE email = 'your-email@gmail.com';

-- verify
SELECT id, email, is_admin FROM users;
\q
```

### 4.3 Verify admin access + trigger first odds refresh

Back in the browser, navigate to `/admin`. You should see the AdminPanel page (the route checks `user.is_admin`; if it redirects you back to `/`, the update didn't take or session caching is stale — log out and back in).

In the AdminPanel:
- Select the current preseason or regular week in the "Odds & Scoring" section
- Click "Refresh odds for this week"
- The summary panel should show `{created: N, updated: 0, ...}` with N being the number of games found for the current upcoming week

Navigate to `/week/<the-week-id>` to see the games rendered with spreads.

---

## Phase 5: Verification checklist

Walk through these to confirm production is healthy:

- [ ] `https://pick5.yourdomain.com` redirects unauthenticated users to `/login`
- [ ] Google OAuth login works
- [ ] After login, `/` redirects to the current week (`/week/<id>`)
- [ ] Games render on the week view with spreads
- [ ] During preseason, the beta banner is visible and the aggregate leaderboard is labeled "Preseason"
- [ ] Preseason points do not appear in the official season leaderboard
- [ ] You can make picks and submit (test with 1-2 picks first)
- [ ] Picks persist across page reload
- [ ] `/leaderboard` loads (empty until games are graded)
- [ ] `/rules` loads (public, no auth required)
- [ ] `/admin` works (visible to admin users only)
- [ ] Scheduler container is running: `docker compose ... ps`
- [ ] Scheduler logs show cron jobs registered
- [ ] No CORS errors in browser console
- [ ] HTTPS works without certificate warnings
- [ ] HTTP → HTTPS redirect works
- [ ] Service ports are not publicly exposed: from your MacBook, `nc -zv pick5.yourdomain.com 5000` and `5432` should both refuse (only 80 and 443 should be open)

---

## Phase 6: Ongoing operations

### 6.1 Backups

Drop this script at `/usr/local/bin/pick5-backup.sh` (as lherzog with sudo). It dumps the Postgres database AND tars the user-uploaded avatar files — both need to be backed up to fully restore.

```bash
#!/bin/bash
set -euo pipefail

TS=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/var/backups/pick5
mkdir -p "$DEST"

# Postgres dump from inside the container
docker exec nfl-pick5-db-1 pg_dump -U pick5 pick5 | gzip > "$DEST/pick5-db-$TS.sql.gz"

# Avatar files — small but they're irreplaceable for users who uploaded
# custom photos. Empty tar is fine if no one's uploaded anything yet.
if [ -d /srv/nfl-pick5/data/avatars ]; then
    tar -czf "$DEST/pick5-avatars-$TS.tar.gz" \
        -C /srv/nfl-pick5/data avatars
fi

# Keep 14 days of local copies for both
find "$DEST" -name 'pick5-db-*.sql.gz' -mtime +14 -delete
find "$DEST" -name 'pick5-avatars-*.tar.gz' -mtime +14 -delete

# Optional: rsync everything to Hetzner Storage Box
if [ -n "${STORAGE_BOX_USER:-}" ]; then
    rsync -az "$DEST/" "$STORAGE_BOX_USER@$STORAGE_BOX_USER.your-storagebox.de:./pick5-backups/"
fi
```

(Note: the container name will be different — run `docker ps --format '{{.Names}}'` to find it; it's typically `<project>-db-1`.)

Make executable, install cron entry:

```
srv-lherzog: sudo chmod +x /usr/local/bin/pick5-backup.sh
srv-lherzog: sudo crontab -e
```

Add:

```
0 3 * * * /usr/local/bin/pick5-backup.sh > /var/log/pick5-backup.log 2>&1
```

Test it once manually:

```
srv-lherzog: sudo /usr/local/bin/pick5-backup.sh
srv-lherzog: ls -lah /var/backups/pick5/
```

**Verify restore works** before you actually need it. Spin up a throwaway Postgres in Docker, restore the dump, count tables. A backup that's never been restored is wishful thinking.

### 6.2 Code updates / redeploys

When you ship a change:

```
dev: # commit, push to GitHub
srv-lherzog: sudo -iu pick5
srv-pick5: cd /srv/nfl-pick5
srv-pick5: git pull

# Rebuild frontend dist (only if frontend code changed)
srv-pick5: docker build --target dist --output type=local,dest=./frontend/dist \
    --build-arg VITE_API_BASE_URL=https://pick5.yourdomain.com ./frontend
srv-pick5: chmod -R go+rX /srv/nfl-pick5/frontend/dist

# Rebuild backend/scheduler image (if backend code changed)
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml build backend scheduler

# Apply any new migrations (cheap to run unconditionally)
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    run --rm backend flask db upgrade

# Restart services
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Backend and scheduler restart cleanly via Docker. Frontend changes are visible the moment the new `dist/` is in place — no service restart needed because Nginx serves static files directly off disk.

### 6.3 Log inspection

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f scheduler
srv-lherzog: sudo tail -f /var/log/nginx/access.log
srv-lherzog: sudo tail -f /var/log/nginx/error.log
```

### 6.4 Scheduler verification

The scheduler runs unattended. Spot-check it weekly:

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml logs scheduler --tail 200
```

You should see entries like "refresh_odds_job complete: created=N updated=N ..." at the cron-scheduled times. If those stop appearing, the scheduler died — restart it:

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml restart scheduler
```

### 6.5 Process supervision & health

Every compose service has `restart: unless-stopped`, and the Docker daemon starts on boot (`systemctl is-enabled docker` should be `enabled` — the default on Ubuntu). Together this means:

- **Host reboots** — Docker starts on boot; Docker restarts each container that wasn't explicitly stopped.
- **Container crashes** (OOM, gunicorn worker deadlock, uncaught exception in the scheduler) — Docker restarts the container. Backoff is exponential.
- **Explicit `docker compose down`** — containers stay down. The "unless-stopped" policy respects manual stops so you're not fighting Docker during maintenance.

The backend has a `/healthz` endpoint that pings the DB with `SELECT 1`. Docker uses it as a healthcheck (30s interval) and gates the scheduler's startup on the db being healthy. To spot-check:

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Column `STATUS` should read `Up X minutes (healthy)` for `db` and `backend`. `scheduler` shows only `Up X minutes` (no healthcheck).

For external monitoring (recommended — Docker's restart policy won't help if the whole box is down or if Nginx is misconfigured), point uptimerobot.com or healthchecks.io at `https://pick5.yourdomain.com/healthz`. A 200 response means Nginx + backend + DB are all reachable.

If a container is crash-looping (restart policy masking a real config error), watch it:

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml ps    # look for "Restarting"
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend --tail 100
```

---

## Troubleshooting

**nginx returns 502 Bad Gateway on `/auth/*` or `/api/*` after the site was previously working:**
The backend container isn't running. Likely causes: (1) host was rebooted before `restart: unless-stopped` was in place, (2) `docker compose down` was run and never brought back up, (3) the backend is crash-looping. Check `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps` — if backend is missing, `docker compose ... up -d`; if it's `Restarting`, tail `docker compose ... logs backend` for the underlying error (often a missing env var or DB connectivity issue). Once the compose file includes the restart policies (see §6.5), a reboot will bring things back automatically.

**nginx returns 500 Internal Server Error on `/`:**
Most likely `/srv/nfl-pick5` has mode 750 instead of 755. Host nginx runs as `www-data` and needs `+x` (traverse) on the directory chain. Fix: `sudo chmod 755 /srv/nfl-pick5`. Check the nginx error log to confirm: `sudo tail /var/log/nginx/error.log` — you'll see "Permission denied" referencing the dist path.

**nginx returns 403 Forbidden on `/` (even after fixing the 500):**
The `/srv/nfl-pick5/frontend/dist` directory itself has mode 700 — BuildKit's `--output type=local` creates the destination directory restrictively even though the files inside have sensible modes. Fix: `chmod -R go+rX /srv/nfl-pick5/frontend/dist`. Confirm with `ls -la /srv/nfl-pick5/frontend/dist` — the `.` line should show `drwxr-xr-x`, not `drwx------`.

**Google OAuth returns 400 redirect_uri_mismatch — error message shows `http://` instead of `https://`:**
The Flask app isn't trusting the `X-Forwarded-Proto: https` header from nginx, so `url_for(_external=True)` generates `http://` URLs. Confirm `backend/app/__init__.py` includes `app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)` immediately after `app = Flask(__name__)`. Without it, the redirect URI sent to Google will never match what's registered in Google Cloud Console.

**AdminPanel shows "No weeks available" in the week dropdown:**
The Season row exists but `is_active` is `false`. The AdminPanel queries weeks via `/api/weeks?season_id=<active>`, and with no active season the dropdown stays empty. Fix in psql: `UPDATE seasons SET is_active = true WHERE year = <year>;`. Verify `SELECT id, year, is_active FROM seasons` returns one row with `is_active = t`.

**Odds refresh response shows `skipped_no_week: N` for a non-zero N:**
N games have kickoff times outside the week's `start_date`/`end_date` range. Most common cause is a Wednesday opener (most recently 2026) where `seed-weeks`' Thursday-start assumption misses the Wednesday game. Find the offending week and broaden its range — see "Spot-check Week 1 date range" in Phase 3.3. If `skipped_no_team: N` appears instead, the API returned a team name not in `backend/app/utils/teams.py`; check backend logs for the unmapped name.

**OAuth callback returns "missing_profile_fields" 400:**
The user's Google profile didn't include email. This is rare and usually indicates the consent screen wasn't set up with the right scopes. Re-check Phase 1.3.

**`docker compose` says ports already in use:**
Something on the host is bound to 5000 (Flask) or 3000 (Vite). On the server this shouldn't happen since the prod overlay binds to `127.0.0.1:` instead of `0.0.0.0:`. If you see this, you've forgotten the `-f docker-compose.prod.yml` overlay.

**Browser console: "blocked by CORS policy":**
The `FRONTEND_URL` env var doesn't match the actual origin you're loading from, or Flask-CORS isn't configured for the right paths. Check `docker compose logs backend` for the configured allowed origin on startup.

**Scheduler not running scheduled jobs:**
Confirm the timezone. Cron triggers use `America/New_York` per the design. If you see jobs running at the wrong times (offset by your local TZ), the container's TZ might be overriding. Verify with `docker compose ... exec scheduler date` — should be the container's UTC, with APScheduler internally converting to ET.

**Uploaded avatar shows as a broken image / question mark in the browser (but reset-to-OAuth avatar works fine):**
nginx is intercepting `/avatars/<uuid>.jpg` requests with the regex location block for static asset extensions and trying to serve them out of the React `dist/` directory, where they don't exist. The fix is to add a `location ^~ /avatars/ { proxy_pass http://127.0.0.1:5000; ... }` block to the nginx server config. The `^~` modifier is essential — without it, the regex still wins regardless of placement. See Phase 2.4c for the correct block. After editing: `sudo nginx -t && sudo systemctl reload nginx`. Reset-to-OAuth works because the OAuth avatar URL is on a different domain (e.g., `lh3.googleusercontent.com`), bypassing nginx entirely.

**HTTPS works but `/auth/me` returns 401 and the session cookie isn't being set:**
`SESSION_COOKIE_SECURE=true` requires HTTPS. If you somehow access via plain HTTP (e.g., a stale browser tab on port 80 that didn't redirect), the cookie won't be set. Hard-refresh on HTTPS.

---

*End of deployment runbook.*
