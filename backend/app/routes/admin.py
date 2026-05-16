from flask import Blueprint, jsonify

from app.models import Week
from app.services.odds_service import refresh_odds
from app.utils.auth_helpers import admin_required

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.post("/weeks/<int:week_id>/refresh-odds")
@admin_required
def refresh_odds_for_week(week_id: int):
    week = Week.query.get(week_id)
    if week is None:
        return jsonify({"error": "week_not_found"}), 404
    summary = refresh_odds()
    return jsonify(summary)
