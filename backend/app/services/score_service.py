import logging
from decimal import Decimal

import requests
from flask import current_app

from app import db
from app.models import Game, Pick

logger = logging.getLogger(__name__)

SCORES_API_URL = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/scores"
REQUEST_TIMEOUT_SECONDS = 30


def points_for_pick(
    score_home: int, score_away: int, spread_at_pick: Decimal, picked_side: str
) -> int:
    """Return the points earned by one pick against its snapshotted spread."""
    actual_margin = Decimal(score_home) - Decimal(score_away)
    line = actual_margin + Decimal(spread_at_pick)
    pushed = line == 0

    if pushed and picked_side == "push":
        return 2
    if not pushed and picked_side == "home" and line > 0:
        return 1
    if not pushed and picked_side == "away" and line < 0:
        return 1
    return 0


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

    graded = 0

    for pick in Pick.query.filter_by(game_id=game.id).all():
        pick.points_awarded = points_for_pick(
            game.score_home,
            game.score_away,
            pick.spread_at_pick,
            pick.picked_side,
        )
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
