"""Standalone scheduler entry point: ``python -m app.scheduler.run``.

Runs in its own Docker Compose service. MUST NOT be imported from the Flask
app factory or any web route — APScheduler must run in exactly one process,
not in every Gunicorn worker.
"""

import logging
import signal
import sys

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from flask import Flask

from app import create_app
from app.scheduler.jobs import refresh_odds_job, refresh_scores_job

logger = logging.getLogger(__name__)

NFL_TZ = "America/New_York"


def build_scheduler(app: Flask) -> BlockingScheduler:
    """Construct the BlockingScheduler with all cron jobs registered.

    Schedule (all times America/New_York):

    * Odds — non-game days (Tue/Wed/Fri/Sat): daily at 06:00
    * Odds — game days (Thu/Sun/Mon): every 4 hours, 08:00–22:00 (08, 12, 16, 20)
    * Scores — daily catch-up at 06:00 (covers unusual game days and late finishes)
    * Scores — Thu 20:00–23:30, every 30 min
    * Scores — Sun 13:00–23:30, every 30 min
    * Scores — Mon 20:00–23:30, every 30 min
    """
    scheduler = BlockingScheduler(timezone=NFL_TZ)

    scheduler.add_job(
        refresh_odds_job,
        trigger=CronTrigger(
            day_of_week="tue,wed,fri,sat", hour=6, minute=0, timezone=NFL_TZ
        ),
        kwargs={"app": app},
        id="refresh_odds_off_day",
        name="refresh_odds (non-game days @ 06:00 ET)",
    )

    scheduler.add_job(
        refresh_odds_job,
        trigger=CronTrigger(
            day_of_week="thu,sun,mon", hour="8-22/4", minute=0, timezone=NFL_TZ
        ),
        kwargs={"app": app},
        id="refresh_odds_game_day",
        name="refresh_odds (game days every 4h, 08:00–22:00 ET)",
    )

    scheduler.add_job(
        refresh_scores_job,
        trigger=CronTrigger(hour=6, minute=0, timezone=NFL_TZ),
        kwargs={"app": app},
        id="refresh_scores_daily_catchup",
        name="refresh_scores (daily catch-up @ 06:00 ET)",
    )

    scheduler.add_job(
        refresh_scores_job,
        trigger=CronTrigger(
            day_of_week="thu", hour="20-23", minute="0,30", timezone=NFL_TZ
        ),
        kwargs={"app": app},
        id="refresh_scores_thu",
        name="refresh_scores (Thu 20:00–23:30 ET / 30 min)",
    )

    scheduler.add_job(
        refresh_scores_job,
        trigger=CronTrigger(
            day_of_week="sun", hour="13-23", minute="0,30", timezone=NFL_TZ
        ),
        kwargs={"app": app},
        id="refresh_scores_sun",
        name="refresh_scores (Sun 13:00–23:30 ET / 30 min)",
    )

    scheduler.add_job(
        refresh_scores_job,
        trigger=CronTrigger(
            day_of_week="mon", hour="20-23", minute="0,30", timezone=NFL_TZ
        ),
        kwargs={"app": app},
        id="refresh_scores_mon",
        name="refresh_scores (Mon 20:00–23:30 ET / 30 min)",
    )

    return scheduler


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )

    app = create_app()
    scheduler = build_scheduler(app)

    logger.info("Scheduler starting")
    for job in scheduler.get_jobs():
        logger.info("  job: %s | trigger: %s", job.name, job.trigger)

    def _shutdown(signum: int, _frame) -> None:
        logger.info("Received signal %s; shutting scheduler down", signum)
        if scheduler.running:
            scheduler.shutdown(wait=False)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    scheduler.start()
    logger.info("Scheduler stopped")


if __name__ == "__main__":
    main()
