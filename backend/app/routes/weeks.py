from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, request

from app import db
from app.models import Game, Season, Week
from app.utils.auth_helpers import login_required

weeks_bp = Blueprint("weeks", __name__, url_prefix="/api")

NFL_TZ = ZoneInfo("America/New_York")
UPCOMING_WEEK_LOOKAHEAD_DAYS = 2


def _serialize_season(season: Season) -> dict:
    return {
        "id": season.id,
        "year": season.year,
        "label": season.label,
        "is_active": season.is_active,
    }


def _serialize_week(week: Week) -> dict:
    return {
        "id": week.id,
        "season_id": week.season_id,
        "week_number": week.week_number,
        "label": week.label,
        "start_date": week.start_date.isoformat(),
        "end_date": week.end_date.isoformat(),
    }


def _serialize_game(game: Game, now: datetime) -> dict:
    return {
        "id": game.id,
        "week_id": game.week_id,
        "external_id": game.external_id,
        "home_team": game.home_team,
        "away_team": game.away_team,
        "home_abbr": game.home_abbr,
        "away_abbr": game.away_abbr,
        "kickoff": game.kickoff.isoformat(),
        "spread_home": (
            float(game.spread_home) if game.spread_home is not None else None
        ),
        "spread_source": game.spread_source,
        "spread_updated_at": (
            game.spread_updated_at.isoformat()
            if game.spread_updated_at is not None
            else None
        ),
        "score_home": game.score_home,
        "score_away": game.score_away,
        "is_final": game.is_final,
        "admin_override": game.admin_override,
        "is_locked": game.kickoff <= now,
    }


def _current_or_upcoming_week(today: date) -> Week | None:
    """Return the active season's current week, or the next week in a short gap.

    Seeded week ranges normally run Thursday through Monday. The two-day
    lookahead keeps the home page useful on Tuesday and Wednesday without
    treating a far-future season as current during the offseason.
    """
    season = Season.query.filter_by(is_active=True).one_or_none()
    if season is None:
        return None

    season_weeks = Week.query.filter_by(season_id=season.id)
    current = (
        season_weeks.filter(Week.start_date <= today, Week.end_date >= today)
        .order_by(Week.start_date.asc())
        .first()
    )
    if current is not None:
        return current

    lookahead_end = today + timedelta(days=UPCOMING_WEEK_LOOKAHEAD_DAYS)
    return (
        season_weeks.filter(
            Week.start_date > today,
            Week.start_date <= lookahead_end,
        )
        .order_by(Week.start_date.asc())
        .first()
    )


@weeks_bp.get("/seasons/active")
@login_required
def get_active_season():
    season = Season.query.filter_by(is_active=True).one_or_none()
    if season is None:
        return jsonify({"error": "no_active_season"}), 404
    return jsonify(_serialize_season(season))


@weeks_bp.get("/weeks")
@login_required
def list_weeks():
    season_id_raw = request.args.get("season_id")
    if season_id_raw is None:
        return jsonify({"error": "season_id_required"}), 400
    try:
        season_id = int(season_id_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "season_id_invalid"}), 400

    weeks = (
        Week.query.filter_by(season_id=season_id).order_by(Week.week_number.asc()).all()
    )
    return jsonify([_serialize_week(w) for w in weeks])


@weeks_bp.get("/weeks/current")
@login_required
def get_current_week():
    today = datetime.now(NFL_TZ).date()
    week = _current_or_upcoming_week(today)
    if week is None:
        return jsonify({"error": "no_current_week"}), 404
    return jsonify(_serialize_week(week))


@weeks_bp.get("/weeks/<int:week_id>/games")
@login_required
def list_games_for_week(week_id: int):
    week = db.session.get(Week, week_id)
    if week is None:
        return jsonify({"error": "week_not_found"}), 404
    now = datetime.now(timezone.utc)
    games = Game.query.filter_by(week_id=week_id).order_by(Game.kickoff.asc()).all()
    return jsonify([_serialize_game(g, now) for g in games])
