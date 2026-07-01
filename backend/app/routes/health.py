from flask import Blueprint, jsonify
from sqlalchemy import text

from app import db

health_bp = Blueprint("health", __name__)


@health_bp.get("/healthz")
def healthz():
    try:
        db.session.execute(text("SELECT 1"))
    except Exception:
        return jsonify({"status": "db_unreachable"}), 503
    return jsonify({"status": "ok"}), 200
