import logging
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import requests
from flask import current_app

from app import db
from app.models import Game, Week
from app.utils.teams import NFL_TEAM_ABBR

logger = logging.getLogger(__name__)

ODDS_API_URL = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds"
REQUEST_TIMEOUT_SECONDS = 30
NFL_GAME_TZ = ZoneInfo("America/New_York")


def _select_spread(bookmakers: list[dict], preferred: str) -> tuple[dict, dict] | None:
    """Return (bookmaker, spreads_market) for the preferred book, else the first available."""
    if not bookmakers:
        return None

    def _spreads_market(bk: dict) -> dict | None:
        for market in bk.get("markets", []) or []:
            if market.get("key") == "spreads":
                return market
        return None

    preferred_bk = next((bk for bk in bookmakers if bk.get("key") == preferred), None)
    if preferred_bk is not None:
        market = _spreads_market(preferred_bk)
        if market is not None:
            return preferred_bk, market

    for bk in bookmakers:
        market = _spreads_market(bk)
        if market is not None:
            return bk, market
    return None


def _home_point(market: dict, home_team: str) -> Decimal | None:
    for outcome in market.get("outcomes", []) or []:
        if outcome.get("name") == home_team:
            point = outcome.get("point")
            if point is None:
                return None
            return Decimal(str(point))
    return None


def _find_week_for_kickoff(kickoff: datetime) -> Week | None:
    kickoff_date = kickoff.astimezone(NFL_GAME_TZ).date()
    return (
        Week.query.filter(
            Week.start_date <= kickoff_date, Week.end_date >= kickoff_date
        )
        .order_by(Week.start_date.desc())
        .first()
    )


def refresh_odds(week_id: int | None = None) -> dict:
    """Refresh market odds, optionally applying changes to one week only."""
    api_key = current_app.config.get("ODDS_API_KEY")
    if not api_key:
        raise RuntimeError("ODDS_API_KEY is not configured")

    preferred_book = current_app.config.get("ODDS_PREFERRED_BOOK") or "fanduel"

    response = requests.get(
        ODDS_API_URL,
        params={
            "apiKey": api_key,
            "regions": "us",
            "markets": "spreads",
            "oddsFormat": "american",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    events = response.json()

    summary = {
        "created": 0,
        "updated": 0,
        "skipped_no_week": 0,
        "skipped_other_week": 0,
        "skipped_override": 0,
        "skipped_no_team": 0,
        "skipped_no_spread": 0,
    }
    now = datetime.now(timezone.utc)

    for event in events:
        external_id = event.get("id")
        home_team = event.get("home_team")
        away_team = event.get("away_team")
        commence_iso = event.get("commence_time")
        if not (external_id and home_team and away_team and commence_iso):
            continue

        try:
            kickoff = datetime.fromisoformat(commence_iso.replace("Z", "+00:00"))
        except ValueError:
            logger.warning(
                "Skipping event %s: unparseable commence_time %r",
                external_id,
                commence_iso,
            )
            continue
        if kickoff.tzinfo is None:
            kickoff = kickoff.replace(tzinfo=timezone.utc)

        home_abbr = NFL_TEAM_ABBR.get(home_team)
        away_abbr = NFL_TEAM_ABBR.get(away_team)
        if not home_abbr or not away_abbr:
            logger.warning(
                "Skipping event %s: unknown team(s) home=%r away=%r",
                external_id,
                home_team,
                away_team,
            )
            summary["skipped_no_team"] += 1
            continue

        week = _find_week_for_kickoff(kickoff)
        if week is None:
            logger.info(
                "Skipping event %s (%s @ %s, kickoff %s): no week matches kickoff date",
                external_id,
                away_abbr,
                home_abbr,
                kickoff.isoformat(),
            )
            summary["skipped_no_week"] += 1
            continue
        if week_id is not None and week.id != week_id:
            summary["skipped_other_week"] += 1
            continue

        selected = _select_spread(event.get("bookmakers") or [], preferred_book)
        if selected is None:
            logger.info("Skipping event %s: no bookmaker offered spreads", external_id)
            summary["skipped_no_spread"] += 1
            continue
        bookmaker, market = selected
        spread_home = _home_point(market, home_team)
        if spread_home is None:
            logger.info(
                "Skipping event %s: bookmaker %s missing home spread outcome",
                external_id,
                bookmaker.get("key"),
            )
            summary["skipped_no_spread"] += 1
            continue

        existing = Game.query.filter_by(
            week_id=week.id, external_id=external_id
        ).one_or_none()
        if existing is None:
            game = Game(
                week_id=week.id,
                external_id=external_id,
                home_team=home_team,
                away_team=away_team,
                home_abbr=home_abbr,
                away_abbr=away_abbr,
                kickoff=kickoff,
                spread_home=spread_home,
                spread_source=bookmaker.get("key"),
                spread_updated_at=now,
            )
            db.session.add(game)
            summary["created"] += 1
        else:
            if existing.admin_override:
                summary["skipped_override"] += 1
                continue
            existing.home_team = home_team
            existing.away_team = away_team
            existing.home_abbr = home_abbr
            existing.away_abbr = away_abbr
            existing.kickoff = kickoff
            existing.spread_home = spread_home
            existing.spread_source = bookmaker.get("key")
            existing.spread_updated_at = now
            summary["updated"] += 1

    db.session.commit()
    return summary
