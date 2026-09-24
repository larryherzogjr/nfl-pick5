from collections.abc import Iterable

from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from app.models import Game, Week
from app.utils.season_phases import PRESEASON_PHASE


def _record_phases(phase: str) -> tuple[str, ...]:
    """Return phases that contribute to a matchup's team record.

    Preseason results remain isolated. Regular- and postseason games share the
    official-season history so playoff matchups do not reset teams to 0-0.
    """
    if phase == PRESEASON_PHASE:
        return (PRESEASON_PHASE,)
    return ("regular", "postseason")


def _format_record(wins: int, losses: int, ties: int) -> str:
    return f"{wins}-{losses}-{ties}" if ties else f"{wins}-{losses}"


def records_before_games(games: Iterable[Game]) -> dict[int, dict[str, str]]:
    """Calculate each team's W-L(-T) record immediately before each kickoff.

    Records are derived from final games already stored in the app, so this
    does not make an external API request. A game's own result is never
    included, which keeps historical matchup graphics stable.
    """
    target_games = list(games)
    if not target_games:
        return {}

    season_ids = {game.week.season_id for game in target_games}
    team_abbrs = {
        abbreviation
        for game in target_games
        for abbreviation in (game.home_abbr, game.away_abbr)
    }
    latest_kickoff = max(game.kickoff for game in target_games)

    completed_games = (
        Game.query.options(joinedload(Game.week))
        .join(Week, Game.week_id == Week.id)
        .filter(
            Week.season_id.in_(season_ids),
            Game.is_final.is_(True),
            Game.score_home.isnot(None),
            Game.score_away.isnot(None),
            Game.kickoff < latest_kickoff,
            or_(
                Game.home_abbr.in_(team_abbrs),
                Game.away_abbr.in_(team_abbrs),
            ),
        )
        .order_by(Game.kickoff.asc())
        .all()
    )

    records: dict[int, dict[str, str]] = {}
    for target in target_games:
        allowed_phases = _record_phases(target.week.phase)
        team_results: dict[str, list[int]] = {
            target.away_abbr: [0, 0, 0],
            target.home_abbr: [0, 0, 0],
        }
        for completed in completed_games:
            if (
                completed.week.season_id != target.week.season_id
                or completed.week.phase not in allowed_phases
                or completed.kickoff >= target.kickoff
            ):
                continue

            for abbreviation in team_results:
                is_home = completed.home_abbr == abbreviation
                is_away = completed.away_abbr == abbreviation
                if not (is_home or is_away):
                    continue
                team_score = completed.score_home if is_home else completed.score_away
                opponent_score = (
                    completed.score_away if is_home else completed.score_home
                )
                if team_score > opponent_score:
                    team_results[abbreviation][0] += 1
                elif team_score < opponent_score:
                    team_results[abbreviation][1] += 1
                else:
                    team_results[abbreviation][2] += 1

        away = team_results[target.away_abbr]
        home = team_results[target.home_abbr]
        records[target.id] = {
            "away_record": _format_record(*away),
            "home_record": _format_record(*home),
        }

    return records
