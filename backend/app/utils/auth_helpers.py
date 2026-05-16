import uuid
from functools import wraps

from flask import g, jsonify, session

from app import db
from app.models import User


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
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
        g.current_user = user
        return view(*args, **kwargs)

    return wrapper


def admin_required(view):
    @wraps(view)
    @login_required
    def wrapper(*args, **kwargs):
        if not g.current_user.is_admin:
            return jsonify({"error": "forbidden"}), 403
        return view(*args, **kwargs)

    return wrapper
