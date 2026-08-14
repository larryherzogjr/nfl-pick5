PRESEASON_PHASE = "preseason"
REGULAR_PHASE = "regular"
POSTSEASON_PHASE = "postseason"

VALID_PHASES = (PRESEASON_PHASE, REGULAR_PHASE, POSTSEASON_PHASE)

SPORT_KEY_BY_PHASE = {
    PRESEASON_PHASE: "americanfootball_nfl_preseason",
    REGULAR_PHASE: "americanfootball_nfl",
    POSTSEASON_PHASE: "americanfootball_nfl",
}


def sport_key_for_phase(phase: str) -> str:
    try:
        return SPORT_KEY_BY_PHASE[phase]
    except KeyError as exc:
        raise ValueError(f"Unsupported NFL season phase: {phase!r}") from exc
