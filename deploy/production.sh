#!/usr/bin/env bash
# Run after pulling the desired revision, as lherzog: sudo bash deploy/production.sh
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ $EUID -ne 0 || $repo != /srv/nfl-pick5 ]]; then
    echo 'Run with sudo from the production checkout at /srv/nfl-pick5.' >&2
    exit 1
fi

# Git, Docker builds, and app files stay owned by the application account.
runuser -u pick5 -- bash "$repo/deploy/build_app.sh" < /dev/null

# Host Nginx changes require root and are part of every deployment.
python3 "$repo/deploy/sync_nginx.py"
