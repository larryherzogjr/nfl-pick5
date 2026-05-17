# DEPLOY.md — NFL Pick 5 Production Deployment

This runbook takes the feature-complete codebase and walks it onto the Hetzner bare-metal server end-to-end. It assumes:

- The Ubuntu 24.04 server is provisioned and hardened (lherzog + pick5 users, SSH key-only, UFW, Docker, Nginx, Certbot installed).
- The codebase is in a GitHub repo (`larryherzogjr/nfl-pick5`) on the `main` branch.
- You're working from your MacBook with SSH access as `lherzog`.

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

### 1.4 Meta (Facebook) OAuth credentials

At https://developers.facebook.com:

- [ ] Create an app (consumer type, "Authenticate users with Facebook Login")
- [ ] Add the Facebook Login product
- [ ] Settings → Basic — note the App ID and App Secret
- [ ] Facebook Login → Settings → Valid OAuth Redirect URIs: `https://pick5.yourdomain.com/auth/callback/meta`
- [ ] Permissions and Features → request `email` and `public_profile` (these are usually granted by default in standard mode)
- [ ] If the app needs to leave dev mode to accept any user, you'll need to submit it for review. For a private home-lab pool of friends, leaving it in dev mode and adding each person as a test user is simpler.

### 1.5 The Odds API key

At https://the-odds-api.com:

- [ ] Sign up for a free account
- [ ] Verify email, log in
- [ ] Account → API Key — copy it
- [ ] Free tier is 500 requests/month — well above our estimated 208/month usage

### 1.6 Hetzner Storage Box (optional, recommended)

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

# The DB password lives only in compose's internal network, but rotate it from "pick5" in production
DATABASE_URL=postgresql://pick5:<strong-random-password>@db:5432/pick5

# From Phase 1.3
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# From Phase 1.4
META_APP_ID=
META_APP_SECRET=

# From Phase 1.5
ODDS_API_KEY=
ODDS_PREFERRED_BOOK=fanduel

# Production URLs
FRONTEND_URL=https://pick5.yourdomain.com
VITE_API_BASE_URL=https://pick5.yourdomain.com
SESSION_COOKIE_SECURE=true
```

**Important** about `DATABASE_URL`: if you change the Postgres password from the default `pick5`, you also need to update `docker-compose.yml`'s db service `POSTGRES_PASSWORD` env var to match (or override it in `docker-compose.prod.yml`). The cleanest approach is to add a `POSTGRES_PASSWORD` env var to `.env` and reference it via `${POSTGRES_PASSWORD}` in compose.

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

You'll re-run this command on every deploy where frontend code changed (see Phase 6.2).

### 2.4 Nginx site configuration

As lherzog:

```
srv-lherzog: sudo nano /etc/nginx/sites-available/pick5
```

Paste this template (replace `pick5.yourdomain.com` throughout):

```nginx
# HTTP → HTTPS redirect (Certbot will fill this in too, but having it explicit is clearer)
server {
    listen 80;
    listen [::]:80;
    server_name pick5.yourdomain.com;

    # Let's Encrypt ACME challenge
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

    # TLS certs (Certbot will fill these in)
    # ssl_certificate /etc/letsencrypt/live/pick5.yourdomain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/pick5.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Reasonable upload limits
    client_max_body_size 1m;

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

Enable and validate:

```
srv-lherzog: sudo ln -s /etc/nginx/sites-available/pick5 /etc/nginx/sites-enabled/
srv-lherzog: sudo rm /etc/nginx/sites-enabled/default
srv-lherzog: sudo nginx -t
srv-lherzog: sudo systemctl reload nginx
```

### 2.5 TLS certificate via Certbot

DNS must be resolving correctly first (Phase 1.1).

```
srv-lherzog: sudo certbot --nginx -d pick5.yourdomain.com
```

Certbot will:
1. Verify domain ownership via HTTP-01 challenge
2. Get a Let's Encrypt cert
3. Uncomment the `ssl_certificate` lines in your nginx config
4. Set up auto-renewal via systemd timer

Verify:

```
srv-lherzog: curl -I https://pick5.yourdomain.com
# Should return HTTP/2 200 (the default React 404 page, but TLS works)
srv-lherzog: sudo certbot renew --dry-run
# Should report success
```

---

## Phase 3: First deployment

### 3.1 Build and bring up the stack

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

Expected: `Running upgrade  -> 4a14278b1a51, initial schema`.

### 3.3 Seed the season's weeks

```
srv-pick5: docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    run --rm backend flask seed-weeks 2026
```

Expected: `Seeded 18 new weeks for season 2026-2027 (0 already existed)`.

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

Scheduler log should show "Scheduler starting" plus the 5 registered jobs with cron triggers.

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
- Select Week 1 in the "Odds & Scoring" section
- Click "Refresh odds for this week"
- The summary panel should show `{created: N, updated: 0, ...}` with N being the number of games found for the current upcoming week

Navigate to `/week/<the-week-id>` to see the games rendered with spreads.

---

## Phase 5: Verification checklist

Walk through these to confirm production is healthy:

- [ ] `https://pick5.yourdomain.com` redirects unauthenticated users to `/login`
- [ ] OAuth login works for both Google and Meta
- [ ] After login, `/` redirects to the current week (`/week/<id>`)
- [ ] Games render on the week view with spreads
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

### 6.1 Database backups

Drop this script at `/usr/local/bin/pick5-backup.sh` (as lherzog with sudo):

```bash
#!/bin/bash
set -euo pipefail

TS=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/var/backups/pick5
mkdir -p "$DEST"

# Dump from inside the Postgres container
docker exec nfl-pick5-db-1 pg_dump -U pick5 pick5 | gzip > "$DEST/pick5-$TS.sql.gz"

# Keep 14 days of local copies
find "$DEST" -name 'pick5-*.sql.gz' -mtime +14 -delete

# Optional: rsync to Hetzner Storage Box
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

---

## Troubleshooting

**OAuth callback returns "missing_profile_fields" 400:**
The user's OAuth profile didn't include email. For Meta this is common — the user has an unverified email or declined the email scope. For Google it's rare and usually indicates the consent screen wasn't set up with the right scopes. Re-check Phase 1.3/1.4.

**`docker compose` says ports already in use:**
Something on the host is bound to 5000 (Flask) or 3000 (Vite). On the server this shouldn't happen since the prod overlay binds to `127.0.0.1:` instead of `0.0.0.0:`. If you see this, you've forgotten the `-f docker-compose.prod.yml` overlay.

**`/api/admin/weeks/X/refresh-odds` returns 0 created, 0 updated, lots of skipped_no_week:**
The week's date range doesn't bracket the games' kickoffs. Check `flask seed-weeks 2026` ran cleanly and the week dates look right (`SELECT * FROM weeks`). The most common cause is running this in the preseason when the Odds API is already returning Week 1 games, but you haven't seeded that season's weeks yet.

**Browser console: "blocked by CORS policy":**
The `FRONTEND_URL` env var doesn't match the actual origin you're loading from, or Flask-CORS isn't configured for the right paths. Check `docker compose logs backend` for the configured allowed origin on startup.

**Scheduler not running scheduled jobs:**
Confirm the timezone. Cron triggers use `America/New_York` per the design. If you see jobs running at the wrong times (offset by your local TZ), the container's TZ might be overriding. Verify with `docker compose ... exec scheduler date` — should be the container's UTC, with APScheduler internally converting to ET.

**HTTPS works but `/auth/me` returns 401 and the session cookie isn't being set:**
`SESSION_COOKIE_SECURE=true` requires HTTPS. If you somehow access via plain HTTP (e.g., a stale browser tab on port 80 that didn't redirect), the cookie won't be set. Hard-refresh on HTTPS.

---

*End of deployment runbook.*
