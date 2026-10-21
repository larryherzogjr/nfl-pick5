#!/usr/bin/env python3
"""Install the versioned production site, reload Nginx, and verify health."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
SITE = Path("/etc/nginx/sites-available/pick5")
HEALTH_URL = "https://pick5.ospdy.com/healthz"


def check_health(url=HEALTH_URL):
    for attempt in range(5):
        try:
            with urlopen(url, timeout=5) as response:
                if (
                    response.status != 200
                    or response.headers.get_content_type() != "application/json"
                    or json.load(response) != {"status": "ok"}
                ):
                    raise ValueError("Expected HTTP 200 application/json: status ok")
            print(f"Healthy: {url}")
            return
        except (OSError, ValueError):
            if attempt == 4:
                raise
            time.sleep(1)


def install_site(contents, target):
    # Replace atomically so nginx never reads a partially written site.
    fd, name = tempfile.mkstemp(prefix=".pick5-", dir=target.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(contents)
        temporary.chmod(0o644)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def sync_nginx(source, target):
    if target.is_symlink() or not target.is_file():
        raise RuntimeError(f"Expected an existing regular site file: {target}")
    original = target.read_bytes()
    desired = source.read_bytes()
    changed = original != desired
    if changed:
        fd, name = tempfile.mkstemp(prefix="pick5.backup-", dir=target.parent)
        os.close(fd)
        shutil.copy2(target, name)
        print(f"Nginx backup: {name}")
        install_site(desired, target)
    try:
        subprocess.run(["nginx", "-t"], check=True)
        # Reload even if disk already matches, so active workers match it too.
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
        check_health()
    except Exception:
        if changed:
            install_site(original, target)
            subprocess.run(["nginx", "-t"], check=True)
            subprocess.run(["systemctl", "reload", "nginx"], check=True)
            print("Restored the previous Nginx configuration.")
        raise
    print("Live Nginx configuration matches the repository.")


if __name__ == "__main__":
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo: python3 deploy/sync_nginx.py")
    enabled = Path("/etc/nginx/sites-enabled/pick5")
    if not enabled.is_symlink() or enabled.resolve() != SITE.resolve():
        raise SystemExit(f"Expected {enabled} to link to {SITE}")
    sync_nginx(ROOT / "deploy/nginx-pick5.conf", SITE)
