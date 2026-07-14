from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from app import db
from app.models import Game, User, Week
from app.services.odds_service import refresh_odds
from app.services.score_service import refresh_scores, score_game
from app.utils.auth_helpers import admin_required

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.get("/users")
@admin_required
def list_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify(
        [
            {
                "id": str(u.id),
                "email": u.email,
                "display_name": u.display_name,
                "avatar_url": u.avatar_url,
                "oauth_provider": u.oauth_provider,
                "is_admin": u.is_admin,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_login": u.last_login.isoformat() if u.last_login else None,
            }
            for u in users
        ]
    )


@admin_bp.post("/weeks/<int:week_id>/refresh-odds")
@admin_required
def refresh_odds_for_week(week_id: int):
    week = db.session.get(Week, week_id)
    if week is None:
        return jsonify({"error": "week_not_found"}), 404
    summary = refresh_odds(week_id=week_id)
    return jsonify(summary)


@admin_bp.post("/scores/refresh")
@admin_required
def refresh_scores_endpoint():
    summary = refresh_scores()
    return jsonify(summary)


@admin_bp.post("/games/<int:game_id>/score")
@admin_required
def set_game_score(game_id: int):
    game = db.session.get(Game, game_id)
    if game is None:
        return jsonify({"error": "game_not_found"}), 404

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "malformed_body"}), 400

    score_home = body.get("score_home")
    score_away = body.get("score_away")
    if (
        not isinstance(score_home, int)
        or isinstance(score_home, bool)
        or not isinstance(score_away, int)
        or isinstance(score_away, bool)
        or score_home < 0
        or score_away < 0
    ):
        return jsonify({"error": "invalid_scores"}), 400

    game.score_home = score_home
    game.score_away = score_away
    game.is_final = True
    picks_graded = score_game(game)

    return jsonify(
        {
            "game": {
                "id": game.id,
                "score_home": game.score_home,
                "score_away": game.score_away,
                "is_final": game.is_final,
            },
            "picks_graded": picks_graded,
        }
    )


@admin_bp.post("/weeks/<int:week_id>/score-all")
@admin_required
def score_all_games_for_week(week_id: int):
    week = db.session.get(Week, week_id)
    if week is None:
        return jsonify({"error": "week_not_found"}), 404

    games = Game.query.filter_by(week_id=week_id, is_final=True).all()
    for game in games:
        score_game(game)
    return jsonify({"games_graded": len(games)})


@admin_bp.post("/games/<int:game_id>/spread")
@admin_required
def set_game_spread(game_id: int):
    game = db.session.get(Game, game_id)
    if game is None:
        return jsonify({"error": "game_not_found"}), 404

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "malformed_body"}), 400

    raw = body.get("spread_home")
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return jsonify({"error": "invalid_spread"}), 400
    if isinstance(raw, float) and raw != raw:  # NaN
        return jsonify({"error": "invalid_spread"}), 400

    try:
        spread = Decimal(str(raw)).quantize(Decimal("0.1"))
    except (InvalidOperation, ValueError):
        return jsonify({"error": "invalid_spread"}), 400

    game.spread_home = spread
    game.spread_source = "admin"
    game.spread_updated_at = datetime.now(timezone.utc)
    game.admin_override = True
    db.session.commit()

    return jsonify(
        {
            "game": {
                "id": game.id,
                "spread_home": float(game.spread_home),
                "spread_source": game.spread_source,
                "spread_updated_at": game.spread_updated_at.isoformat(),
                "admin_override": game.admin_override,
            }
        }
    )
