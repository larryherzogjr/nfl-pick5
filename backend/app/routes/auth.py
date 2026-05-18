import io
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import (
    Blueprint,
    current_app,
    g,
    jsonify,
    redirect,
    request,
    session,
    url_for,
)
from PIL import Image

from app import db, oauth
from app.models import User
from app.utils.auth_helpers import login_required

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 MB
AVATAR_DIR = Path("/app/data/avatars")
AVATAR_SIZE = 256  # final pixel size, square


def _serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "is_admin": user.is_admin,
        "oauth_provider": user.oauth_provider,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "oauth_display_name": user.oauth_display_name,
        "oauth_avatar_url": user.oauth_avatar_url,
    }


@auth_bp.get("/login/google")
def login_google():
    redirect_uri = url_for("auth.callback_google", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@auth_bp.get("/callback/google")
def callback_google():
    token = oauth.google.authorize_access_token()
    userinfo = token.get("userinfo")
    if userinfo is None:
        userinfo = oauth.google.userinfo(token=token)

    sub = userinfo.get("sub")
    email = userinfo.get("email")
    if not sub or not email:
        return jsonify({"error": "missing_profile_fields"}), 400

    display_name = (userinfo.get("name") or email.split("@")[0])[:100]
    avatar_url = userinfo.get("picture")
    now = datetime.now(timezone.utc)

    user = User.query.filter_by(
        oauth_provider="google", oauth_subject=sub
    ).one_or_none()
    if user is None:
        user = User(
            email=email,
            display_name=display_name,
            oauth_display_name=display_name,
            avatar_url=avatar_url,
            oauth_avatar_url=avatar_url,
            oauth_provider="google",
            oauth_subject=sub,
            last_login=now,
        )
        db.session.add(user)
    else:
        user.email = email
        user.oauth_display_name = display_name
        user.oauth_avatar_url = avatar_url
        user.last_login = now
    db.session.commit()

    session.clear()
    session["user_id"] = str(user.id)
    session.permanent = True

    return redirect(current_app.config["FRONTEND_URL"])


@auth_bp.get("/login/meta")
def login_meta():
    redirect_uri = url_for("auth.callback_meta", _external=True)
    return oauth.meta.authorize_redirect(redirect_uri)


@auth_bp.get("/callback/meta")
def callback_meta():
    token = oauth.meta.authorize_access_token()
    resp = oauth.meta.get("me?fields=id,name,email,picture", token=token)
    resp.raise_for_status()
    profile = resp.json()

    sub = profile.get("id")
    email = profile.get("email")
    if not sub or not email:
        return jsonify({"error": "missing_profile_fields"}), 400

    display_name = (profile.get("name") or email.split("@")[0])[:100]
    picture = profile.get("picture") or {}
    avatar_url = (picture.get("data") or {}).get("url")
    now = datetime.now(timezone.utc)

    user = User.query.filter_by(oauth_provider="meta", oauth_subject=sub).one_or_none()
    if user is None:
        user = User(
            email=email,
            display_name=display_name,
            oauth_display_name=display_name,
            avatar_url=avatar_url,
            oauth_avatar_url=avatar_url,
            oauth_provider="meta",
            oauth_subject=sub,
            last_login=now,
        )
        db.session.add(user)
    else:
        user.email = email
        user.oauth_display_name = display_name
        user.oauth_avatar_url = avatar_url
        user.last_login = now
    db.session.commit()

    session.clear()
    session["user_id"] = str(user.id)
    session.permanent = True

    return redirect(current_app.config["FRONTEND_URL"])


@auth_bp.get("/me")
def me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "unauthenticated"}), 401
    try:
        user = db.session.get(User, uuid.UUID(user_id))
    except (ValueError, TypeError):
        session.clear()
        return jsonify({"error": "unauthenticated"}), 401
    if user is None:
        session.clear()
        return jsonify({"error": "unauthenticated"}), 401
    return jsonify(_serialize_user(user))


@auth_bp.patch("/me")
@login_required
def update_me():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or "display_name" not in body:
        return jsonify({"error": "display_name_required"}), 400
    raw = body["display_name"]
    if not isinstance(raw, str):
        return jsonify({"error": "display_name_invalid_type"}), 400
    trimmed = raw.strip()
    if not trimmed:
        return jsonify({"error": "display_name_empty"}), 400
    if len(trimmed) > 100:
        return jsonify({"error": "display_name_too_long"}), 400

    user = g.current_user
    user.display_name = trimmed
    db.session.commit()
    return jsonify(_serialize_user(user))


@auth_bp.post("/me/avatar")
@login_required
def upload_avatar():
    if "file" not in request.files:
        return jsonify({"error": "no_file"}), 400
    file = request.files["file"]

    file.stream.seek(0, io.SEEK_END)
    size = file.stream.tell()
    file.stream.seek(0)
    if size > MAX_AVATAR_SIZE:
        return jsonify({"error": "file_too_large"}), 413

    if file.mimetype not in ALLOWED_MIME_TYPES:
        return jsonify({"error": "invalid_type"}), 400

    try:
        with Image.open(file.stream) as probe:
            probe.verify()
    except Exception:
        return jsonify({"error": "invalid_image"}), 400

    file.stream.seek(0)
    img = Image.open(file.stream)

    if img.mode == "RGBA":
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    img.thumbnail((1024, 1024), Image.LANCZOS)

    width, height = img.size
    short_side = min(width, height)
    left = (width - short_side) // 2
    top = (height - short_side) // 2
    img = img.crop((left, top, left + short_side, top + short_side))

    img = img.resize((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{str(g.current_user.id)}.jpg"
    img.save(AVATAR_DIR / filename, format="JPEG", quality=85, optimize=True)

    cache_buster = int(datetime.now(timezone.utc).timestamp())
    g.current_user.avatar_url = f"/avatars/{filename}?v={cache_buster}"
    db.session.commit()
    return jsonify(_serialize_user(g.current_user))


@auth_bp.post("/me/reset-to-oauth")
@login_required
def reset_to_oauth():
    user = g.current_user
    custom_path = AVATAR_DIR / f"{user.id}.jpg"
    if custom_path.exists():
        custom_path.unlink()
    user.display_name = user.oauth_display_name
    user.avatar_url = user.oauth_avatar_url
    db.session.commit()
    return jsonify(_serialize_user(user))


@auth_bp.post("/logout")
def logout():
    session.clear()
    return "", 204
