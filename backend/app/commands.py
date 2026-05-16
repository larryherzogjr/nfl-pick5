from datetime import date, timedelta

import click
from flask.cli import with_appcontext

from app import db
from app.models import Season, Week

REGULAR_SEASON_WEEKS = 18


def _labor_day(year: int) -> date:
    sept_1 = date(year, 9, 1)
    days_until_monday = (0 - sept_1.weekday()) % 7
    return sept_1 + timedelta(days=days_until_monday)


@click.command("seed-weeks")
@click.argument("year", type=int)
@with_appcontext
def seed_weeks(year: int) -> None:
    label = f"{year}-{year + 1}"
    season = Season.query.filter_by(year=year).one_or_none()
    if season is None:
        season = Season(year=year, label=label)
        db.session.add(season)
        db.session.flush()

    first_thursday = _labor_day(year) + timedelta(days=3)

    existing_numbers = {
        wn for (wn,) in db.session.query(Week.week_number).filter_by(season_id=season.id).all()
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
                label=f"Week {week_number}",
                start_date=start,
                end_date=start + timedelta(days=4),
            )
        )
        created += 1

    db.session.commit()
    click.echo(f"Seeded {created} new weeks for season {label} ({skipped} already existed)")
