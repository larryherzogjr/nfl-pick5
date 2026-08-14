"""add week phase

Revision ID: c9144b88e2d1
Revises: b83d1f6c2a40
Create Date: 2026-08-13 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = "c9144b88e2d1"
down_revision = "b83d1f6c2a40"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("weeks", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "phase",
                sa.String(length=12),
                server_default="regular",
                nullable=False,
            )
        )
        batch_op.drop_constraint(
            "uq_weeks_season_week_number", type_="unique"
        )
        batch_op.create_unique_constraint(
            "uq_weeks_season_phase_week_number",
            ["season_id", "phase", "week_number"],
        )
        batch_op.create_check_constraint(
            "ck_weeks_phase",
            "phase IN ('preseason', 'regular', 'postseason')",
        )


def downgrade():
    with op.batch_alter_table("weeks", schema=None) as batch_op:
        batch_op.drop_constraint("ck_weeks_phase", type_="check")
        batch_op.drop_constraint(
            "uq_weeks_season_phase_week_number", type_="unique"
        )
        batch_op.create_unique_constraint(
            "uq_weeks_season_week_number", ["season_id", "week_number"]
        )
        batch_op.drop_column("phase")
