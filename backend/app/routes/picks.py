from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from app import db
from app.models import Game, Pick, Week
from app.utils.auth_helpers import login_required

picks_bp = Blueprint("picks", __name__, url_prefix="/api")

VALID_SIDES = ("home", "away", "push")


def _serialize_pick(pick: Pick) -> dict:
    return {
        "id": pick.id,
        "game_id": pick.game_id,
        "picked_side": pick.picked_side,
        "spread_at_pick": float(pick.spread_at_pick),
        "points_awarded": pick.points_awarded,
        "created_at": pick.created_at.isoformat(),
        "updated_at": pick.updated_at.isoformat(),
    }


def _user_picks_for_week(user_id, week_id: int) -> list[Pick]:
    return (
        Pick.query.join(Game, Pick.game_id == Game.id)
        .filter(Pick.user_id == user_id, Game.week_id == week_id)
        .order_by(Game.kickoff.asc(), Pick.id.asc())
        .all()
    )


@picks_bp.get("/weeks/<int:week_id>/picks")
@login_required
def get_picks_for_week(week_id: int):
    week = Week.query.get(week_id)
    if week is None:
        return jsonify({"error": "week_not_found"}), 404
    picks = _user_picks_for_week(g.current_user.id, week_id)
    return jsonify([_serialize_pick(p) for p in picks])


@picks_bp.post("/weeks/<int:week_id>/picks")
@login_required
def submit_picks_for_week(week_id: int):
    week = Week.query.get(week_id)
    if week is None:
        return jsonify({"error": "week_not_found"}), 404

    body = request.get_json(silent=True)
    if (
        not isinstance(body, dict)
        or "picks" not in body
        or not isinstance(body["picks"], list)
    ):
        return jsonify({"errors": [{"game_id": None, "error": "malformed_body"}]}), 400

    raw_items = body["picks"]
    errors: list[dict] = []
    parsed_items: list[tuple[int, str]] = []

    for raw in raw_items:
        if not isinstance(raw, dict):
            errors.append({"game_id": None, "error": "invalid_pick_item"})
            continue
        gid = raw.get("game_id")
        side = raw.get("picked_side")
        if not isinstance(gid, int) or isinstance(gid, bool):
            errors.append({"game_id": None, "error": "invalid_pick_item"})
            continue
        if not isinstance(side, str):
            errors.append({"game_id": gid, "error": "invalid_picked_side"})
            continue
        parsed_items.append((gid, side))

    now = datetime.now(timezone.utc)
    locked_skipped = 0
    to_apply: list[tuple[Game, str]] = []

    if parsed_items:
        referenced_ids = list({gid for gid, _ in parsed_items})
        games_by_id = {
            game.id: game
            for game in Game.query.filter(Game.id.in_(referenced_ids)).all()
        }

        for gid, side in parsed_items:
            game = games_by_id.get(gid)
            if game is None or game.week_id != week_id:
                errors.append({"game_id": gid, "error": "game_not_in_week"})
                continue
            if game.kickoff <= now:
                locked_skipped += 1
                continue
            if side not in VALID_SIDES:
                errors.append({"game_id": gid, "error": "invalid_picked_side"})
                continue
            if side == "push":
                spread = game.spread_home
                if spread is None or spread != spread.to_integral_value():
                    errors.append({"game_id": gid, "error": "push_requires_whole_spread"})
                    continue
            to_apply.append((game, side))

    if errors:
        return jsonify({"errors": errors}), 400

    existing_picks = _user_picks_for_week(g.current_user.id, week_id)
    existing_by_game = {p.game_id: p for p in existing_picks}
    to_apply_game_ids = {game.id for game, _ in to_apply}
    final_game_ids = set(existing_by_game.keys()) | to_apply_game_ids
    if len(final_game_ids) > 5:
        return (
            jsonify({"errors": [{"game_id": None, "error": "weekly_limit_exceeded"}]}),
            400,
        )

    for game, side in to_apply:
        pick = existing_by_game.get(game.id)
        if pick is None:
            pick = Pick(
                user_id=g.current_user.id,
                game_id=game.id,
                picked_side=side,
                spread_at_pick=game.spread_home,
            )
            db.session.add(pick)
            existing_by_game[game.id] = pick
        else:
            pick.picked_side = side
            pick.spread_at_pick = game.spread_home
            pick.updated_at = now

    db.session.commit()

    picks = _user_picks_for_week(g.current_user.id, week_id)
    return jsonify(
        {
            "picks": [_serialize_pick(p) for p in picks],
            "locked_skipped": locked_skipped,
        }
    )
