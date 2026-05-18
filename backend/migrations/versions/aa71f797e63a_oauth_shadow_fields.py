"""oauth shadow fields

Revision ID: aa71f797e63a
Revises: 4a14278b1a51
Create Date: 2026-05-18 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'aa71f797e63a'
down_revision = '4a14278b1a51'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'users',
        sa.Column('oauth_display_name', sa.String(length=100), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column('oauth_avatar_url', sa.Text(), nullable=True),
    )
    op.execute(
        "UPDATE users SET oauth_display_name = display_name, oauth_avatar_url = avatar_url"
    )
    op.alter_column('users', 'oauth_display_name', nullable=False)


def downgrade():
    op.drop_column('users', 'oauth_avatar_url')
    op.drop_column('users', 'oauth_display_name')
