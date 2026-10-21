#!/usr/bin/env bash
# Called as pick5 by production.sh; keep shell commands out of child stdin.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$repo"
if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
    echo 'Production checkout has tracked changes; stopping.' >&2
    exit 1
fi
git log -1 --oneline
compose=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
"${compose[@]}" config --quiet
staging=$(mktemp -d /tmp/pick5-dist.XXXXXX)
trap 'rm -rf -- "$staging"' EXIT
docker build --target dist --output "type=local,dest=$staging" \
    --build-arg VITE_API_BASE_URL=https://pick5.ospdy.com ./frontend
"${compose[@]}" build backend scheduler
"${compose[@]}" run --rm -T backend flask db upgrade < /dev/null
"${compose[@]}" up -d --wait --wait-timeout 120 db backend scheduler
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:5000/healthz
mkdir -p frontend/dist
cp -a "$staging"/. frontend/dist/
chmod -R go+rX frontend/dist
"${compose[@]}" ps
