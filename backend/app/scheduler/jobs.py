import logging
import traceback

from flask import Flask

from app.services.odds_service import refresh_odds
from app.services.score_service import refresh_scores

logger = logging.getLogger(__name__)


def refresh_odds_job(app: Flask) -> None:
    """Refresh NFL odds inside a Flask app context.

    Exceptions are caught and logged with traceback so a transient failure
    (Odds API hiccup, DB blip) does not crash the long-running scheduler.
    """
    with app.app_context():
        try:
            summary = refresh_odds()
        except Exception:
            logger.error("refresh_odds_job failed:\n%s", traceback.format_exc())
            return
        logger.info("refresh_odds_job complete: %s", summary)


def refresh_scores_job(app: Flask) -> None:
    """Refresh NFL scores inside a Flask app context.

    Exceptions are caught and logged with traceback so a transient failure
    does not crash the long-running scheduler.
    """
    with app.app_context():
        try:
            summary = refresh_scores()
        except Exception:
            logger.error("refresh_scores_job failed:\n%s", traceback.format_exc())
            return
        logger.info("refresh_scores_job complete: %s", summary)
