"""manage Flask-Session table

Revision ID: b83d1f6c2a40
Revises: aa71f797e63a
Create Date: 2026-07-14 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "b83d1f6c2a40"
down_revision = "aa71f797e63a"
branch_labels = None
depends_on = None


def upgrade():
    # Flask-Session historically created this table during app startup. Keep
    # upgrades safe for existing deployments while bringing new databases
    # under Alembic ownership.
    if sa.inspect(op.get_bind()).has_table("flask_sessions"):
        return

    op.create_table(
        "flask_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(length=255), nullable=True),
        sa.Column("data", sa.LargeBinary(), nullable=True),
        sa.Column("expiry", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id"),
    )


def downgrade():
    op.drop_table("flask_sessions")
