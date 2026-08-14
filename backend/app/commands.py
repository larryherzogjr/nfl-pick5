from datetime import date, timedelta

import click
from flask.cli import with_appcontext

from app import db
from app.models import Season, Week
from app.utils.season_phases import PRESEASON_PHASE, REGULAR_PHASE

REGULAR_SEASON_WEEKS = 18
PRESEASON_DATES_BY_YEAR = {
    2026: (
        (1, date(2026, 8, 13), date(2026, 8, 16)),
        (2, date(2026, 8, 20), date(2026, 8, 23)),
        (3, date(2026, 8, 27), date(2026, 8, 30)),
    )
}


def _season_for_year(year: int) -> Season:
    label = f"{year}-{year + 1}"
    season = Season.query.filter_by(year=year).one_or_none()
    if season is None:
        season = Season(year=year, label=label)
        db.session.add(season)
        db.session.flush()
    return season


def _labor_day(year: int) -> date:
    sept_1 = date(year, 9, 1)
    days_until_monday = (0 - sept_1.weekday()) % 7
    return sept_1 + timedelta(days=days_until_monday)


@click.command("seed-weeks")
@click.argument("year", type=int)
@with_appcontext
def seed_weeks(year: int) -> None:
    label = f"{year}-{year + 1}"
    season = _season_for_year(year)

    first_thursday = _labor_day(year) + timedelta(days=3)

    existing_numbers = {
        wn
        for (wn,) in db.session.query(Week.week_number)
        .filter_by(season_id=season.id, phase=REGULAR_PHASE)
        .all()
    }

    created = 0
    skipped = 0
    for i in range(REGULAR_SEASON_WEEKS):
        week_number = i + 1
        if week_number in existing_numbers:
            skipped += 1
            continue
        start = first_thursday + timedelta(days=7 * i)
        db.session.add(
            Week(
                season_id=season.id,
                week_number=week_number,
                phase=REGULAR_PHASE,
                label=f"Week {week_number}",
                start_date=start,
                end_date=start + timedelta(days=4),
            )
        )
        created += 1

    db.session.commit()
    click.echo(
        f"Seeded {created} new weeks for season {label} ({skipped} already existed)"
    )


@click.command("seed-preseason-weeks")
@click.argument("year", type=int)
@with_appcontext
def seed_preseason_weeks(year: int) -> None:
    dates = PRESEASON_DATES_BY_YEAR.get(year)
    if dates is None:
        raise click.ClickException(
            f"No verified preseason date ranges are configured for {year}"
        )

    season = _season_for_year(year)
    existing_numbers = {
        wn
        for (wn,) in db.session.query(Week.week_number)
        .filter_by(season_id=season.id, phase=PRESEASON_PHASE)
        .all()
    }

    created = 0
    skipped = 0
    for week_number, start_date, end_date in dates:
        if week_number in existing_numbers:
            skipped += 1
            continue
        db.session.add(
            Week(
                season_id=season.id,
                week_number=week_number,
                phase=PRESEASON_PHASE,
                label=f"Preseason Week {week_number}",
                start_date=start_date,
                end_date=end_date,
            )
        )
        created += 1

    db.session.commit()
    click.echo(
        f"Seeded {created} preseason weeks for {year} ({skipped} already existed)"
    )
