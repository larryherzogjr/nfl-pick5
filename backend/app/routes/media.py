import re

from flask import Blueprint, abort, send_from_directory

from app.routes.auth import AVATAR_DIR

media_bp = Blueprint("media", __name__)

_AVATAR_FILENAME_RE = re.compile(r"^[a-f0-9-]+\.jpg$")


@media_bp.get("/avatars/<filename>")
def serve_avatar(filename):
    if not _AVATAR_FILENAME_RE.match(filename):
        abort(404)
    response = send_from_directory(AVATAR_DIR, filename)
    response.cache_control.no_cache = False
    response.cache_control.public = True
    response.cache_control.max_age = 3600
    return response
