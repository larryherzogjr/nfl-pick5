from collections import defaultdict

from flask import Blueprint, g, jsonify, request
from sqlalchemy.orm import joinedload

from app import db
from app.models import Game, Pick, Season, Week
from app.utils.auth_helpers import login_required

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


def _serialize_pick(pick: Pick) -> dict:
    game = pick.game
    return {
        "pick_id": pick.id,
        "game_id": game.id,
        "away_abbr": game.away_abbr,
        "home_abbr": game.home_abbr,
        "away_team": game.away_team,
        "home_team": game.home_team,
        "kickoff": game.kickoff.isoformat(),
        "spread_home": float(game.spread_home) if game.spread_home is not None else None,
        "spread_at_pick": float(pick.spread_at_pick),
        "picked_side": pick.picked_side,
        "score_home": game.score_home,
        "score_away": game.score_away,
        "is_final": game.is_final,
        "points_awarded": pick.points_awarded,
    }


@users_bp.get("/me/picks")
@login_required
def get_my_picks():
    season_id_raw = request.args.get("season_id")
    if season_id_raw is None:
        return jsonify({"error": "season_id_required"}), 400
    try:
        season_id = int(season_id_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "season_id_invalid"}), 400

    season = db.session.get(Season, season_id)
    if season is None:
        return jsonify({"error": "season_not_found"}), 404

    picks = (
        Pick.query.options(joinedload(Pick.game).joinedload(Game.week))
        .join(Game, Pick.game_id == Game.id)
        .join(Week, Game.week_id == Week.id)
        .filter(Pick.user_id == g.current_user.id, Week.season_id == season_id)
        .order_by(Week.week_number.desc(), Game.kickoff.asc(), Pick.id.asc())
        .all()
    )

    picks_by_week: dict = defaultdict(list)
    week_by_id: dict = {}
    for pick in picks:
        week = pick.game.week
        week_by_id[week.id] = week
        picks_by_week[week.id].append(pick)

    weeks_payload = []
    for week_id in sorted(
        week_by_id.keys(), key=lambda wid: week_by_id[wid].week_number, reverse=True
    ):
        week = week_by_id[week_id]
        weeks_payload.append(
            {
                "week_id": week.id,
                "week_number": week.week_number,
                "week_label": week.label,
                "picks": [_serialize_pick(p) for p in picks_by_week[week_id]],
            }
        )

    return jsonify(
        {
            "season_id": season.id,
            "season_label": season.label,
            "weeks": weeks_payload,
        }
    )
