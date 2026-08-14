from collections import defaultdict
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request
from sqlalchemy import case, func, or_

from app import db
from app.models import Game, Pick, Season, User, Week
from app.utils.auth_helpers import login_required
from app.utils.season_phases import PRESEASON_PHASE, VALID_PHASES

leaderboard_bp = Blueprint("leaderboard", __name__, url_prefix="/api")


@leaderboard_bp.get("/leaderboard")
@login_required
def get_leaderboard():
    season_id_raw = request.args.get("season_id")
    week_id_raw = request.args.get("week_id")
    phase = request.args.get("phase")

    if season_id_raw is None and week_id_raw is None:
        return jsonify({"error": "missing_scope"}), 400
    if season_id_raw is not None and week_id_raw is not None:
        return jsonify({"error": "ambiguous_scope"}), 400
    if phase is not None and phase not in VALID_PHASES:
        return jsonify({"error": "phase_invalid"}), 400
    if phase is not None and season_id_raw is None:
        return jsonify({"error": "phase_requires_season_scope"}), 400

    scoped_week_id = None
    if season_id_raw is not None:
        try:
            season_id = int(season_id_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "season_id_invalid"}), 400
        season = db.session.get(Season, season_id)
        if season is None:
            return jsonify({"error": "season_not_found"}), 404
        weeks_query = Week.query.filter_by(season_id=season_id)
        if phase is not None:
            weeks_query = weeks_query.filter(Week.phase == phase)
        else:
            # Preseason is a test competition and never contributes to the
            # official season standings. Regular and postseason weeks retain
            # the existing season-long behavior.
            weeks_query = weeks_query.filter(Week.phase != PRESEASON_PHASE)
        weeks = weeks_query.order_by(Week.start_date.asc()).all()
    else:
        try:
            week_id = int(week_id_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "week_id_invalid"}), 400
        week = db.session.get(Week, week_id)
        if week is None:
            return jsonify({"error": "week_not_found"}), 404
        weeks = [week]
        scoped_week_id = week.id

    week_ids = [w.id for w in weeks]
    if not week_ids:
        return jsonify([])

    week_by_id = {w.id: w for w in weeks}

    non_zero_sum = func.sum(case((Pick.points_awarded > 0, 1), else_=0))

    rows = (
        db.session.query(
            Pick.user_id.label("user_id"),
            Game.week_id.label("week_id"),
            func.coalesce(func.sum(Pick.points_awarded), 0).label("points"),
            func.count(Pick.id).label("picks_scored"),
            non_zero_sum.label("non_zero_count"),
        )
        .join(Game, Pick.game_id == Game.id)
        .filter(Pick.points_awarded.isnot(None))
        .filter(Game.week_id.in_(week_ids))
        .group_by(Pick.user_id, Game.week_id)
        .all()
    )

    user_breakdown: dict = defaultdict(list)
    user_points: dict = defaultdict(int)
    user_perfect_weeks: dict = defaultdict(int)
    user_total_picked: dict = defaultdict(int)
    user_ids: set = set()

    for row in rows:
        picks_scored = int(row.picks_scored or 0)
        non_zero_count = int(row.non_zero_count or 0)
        points = int(row.points or 0)
        is_perfect = picks_scored == 5 and non_zero_count == 5

        user_ids.add(row.user_id)
        user_points[row.user_id] += points
        user_total_picked[row.user_id] += picks_scored
        if is_perfect:
            user_perfect_weeks[row.user_id] += 1
        user_breakdown[row.user_id].append(
            {
                "week": week_by_id[row.week_id].week_number,
                "week_id": row.week_id,
                "label": week_by_id[row.week_id].label,
                "phase": week_by_id[row.week_id].phase,
                "points": points,
                "picks_scored": picks_scored,
                "is_perfect": is_perfect,
            }
        )

    # A weekly leaderboard must expose a row as soon as at least one of that
    # player's games has kicked off, even if no pick has been graded yet.
    # Otherwise there is no UI path to the post-kickoff pick details promised
    # by the rules. A viewer's own row is also available before kickoff.
    if scoped_week_id is not None:
        visible_user_rows = (
            db.session.query(Pick.user_id)
            .join(Game, Pick.game_id == Game.id)
            .filter(Game.week_id == scoped_week_id)
            .filter(
                or_(
                    Game.kickoff <= datetime.now(timezone.utc),
                    Pick.user_id == g.current_user.id,
                )
            )
            .distinct()
            .all()
        )
        user_ids.update(row.user_id for row in visible_user_rows)

    if not user_ids:
        return jsonify([])

    users_by_id = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()}

    entries = []
    for uid in user_ids:
        u = users_by_id.get(uid)
        if u is None:
            continue
        breakdown = sorted(
            user_breakdown[uid],
            key=lambda b: week_by_id[b["week_id"]].start_date,
        )
        entries.append(
            {
                "user": {
                    "id": str(u.id),
                    "display_name": u.display_name,
                    "avatar_url": u.avatar_url,
                },
                "points": user_points[uid],
                "perfect_weeks": user_perfect_weeks[uid],
                "total_picked": user_total_picked[uid],
                "weekly_breakdown": breakdown,
            }
        )

    entries.sort(
        key=lambda e: (
            -e["points"],
            -e["perfect_weeks"],
            (e["user"]["display_name"] or "").lower(),
            e["user"]["id"],
        )
    )

    result = []
    last_key = None
    last_rank = 0
    for idx, entry in enumerate(entries, start=1):
        key = (entry["points"], entry["perfect_weeks"])
        if key != last_key:
            last_rank = idx
            last_key = key
        result.append(
            {
                "rank": last_rank,
                "user": entry["user"],
                "points": entry["points"],
                "perfect_weeks": entry["perfect_weeks"],
                "total_picked": entry["total_picked"],
                "weekly_breakdown": entry["weekly_breakdown"],
            }
        )

    return jsonify(result)
