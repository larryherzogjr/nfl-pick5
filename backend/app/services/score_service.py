import logging
from decimal import Decimal

import requests
from flask import current_app

from app import db
from app.models import Game, Pick

logger = logging.getLogger(__name__)

SCORES_API_URL = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/scores"
REQUEST_TIMEOUT_SECONDS = 30


def _extract_team_score(scores: list[dict] | None, team_name: str) -> int | None:
    if not scores:
        return None
    for entry in scores:
        if entry.get("name") == team_name:
            raw = entry.get("score")
            if raw is None:
                return None
            try:
                return int(raw)
            except (TypeError, ValueError):
                return None
    return None


def score_game(game: Game) -> int:
    """Grade all picks for a final game per DESIGN.md §5. Idempotent.

    Each pick is graded against its own snapshotted spread (pick.spread_at_pick),
    never game.spread_home. Returns the number of picks graded.
    """
    if not game.is_final or game.score_home is None or game.score_away is None:
        return 0

    actual_margin = Decimal(game.score_home) - Decimal(game.score_away)
    graded = 0

    for pick in Pick.query.filter_by(game_id=game.id).all():
        line = actual_margin + Decimal(pick.spread_at_pick)
        pushed = line == 0
        home_covered = line > 0

        if pushed and pick.picked_side == "push":
            pick.points_awarded = 2
        elif not pushed and pick.picked_side == "home" and home_covered:
            pick.points_awarded = 1
        elif not pushed and pick.picked_side == "away" and not home_covered:
            pick.points_awarded = 1
        else:
            pick.points_awarded = 0
        graded += 1

    db.session.commit()
    return graded


def refresh_scores() -> dict:
    api_key = current_app.config.get("ODDS_API_KEY")
    if not api_key:
        raise RuntimeError("ODDS_API_KEY is not configured")

    response = requests.get(
        SCORES_API_URL,
        params={"apiKey": api_key, "daysFrom": 3},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    events = response.json()

    summary = {"finalized": 0, "already_final": 0, "skipped_unknown": 0}

    for event in events:
        if not event.get("completed"):
            continue
        external_id = event.get("id")
        if not external_id:
            continue

        game = Game.query.filter_by(external_id=external_id).first()
        if game is None:
            summary["skipped_unknown"] += 1
            continue

        if game.is_final:
            summary["already_final"] += 1
            continue

        scores = event.get("scores")
        score_home = _extract_team_score(scores, game.home_team)
        score_away = _extract_team_score(scores, game.away_team)
        if score_home is None or score_away is None:
            logger.warning(
                "Skipping completed event %s: could not parse scores from %r",
                external_id,
                scores,
            )
            continue

        game.score_home = score_home
        game.score_away = score_away
        game.is_final = True
        score_game(game)
        summary["finalized"] += 1

    return summary
