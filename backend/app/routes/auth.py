import uuid
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, redirect, session, url_for

from app import db, oauth
from app.models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


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
            avatar_url=avatar_url,
            oauth_provider="google",
            oauth_subject=sub,
            last_login=now,
        )
        db.session.add(user)
    else:
        user.email = email
        user.display_name = display_name
        user.avatar_url = avatar_url
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

    user = User.query.filter_by(
        oauth_provider="meta", oauth_subject=sub
    ).one_or_none()
    if user is None:
        user = User(
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
            oauth_provider="meta",
            oauth_subject=sub,
            last_login=now,
        )
        db.session.add(user)
    else:
        user.email = email
        user.display_name = display_name
        user.avatar_url = avatar_url
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
    return jsonify(
        {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "is_admin": user.is_admin,
            "oauth_provider": user.oauth_provider,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
    )


@auth_bp.post("/logout")
def logout():
    session.clear()
    return "", 204
