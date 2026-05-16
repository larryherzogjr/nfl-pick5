from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class Pick(db.Model):
    __tablename__ = "picks"
    __table_args__ = (
        db.UniqueConstraint("user_id", "game_id", name="uq_picks_user_game"),
        db.CheckConstraint(
            "picked_side IN ('home', 'away', 'push')", name="ck_picks_picked_side"
        ),
        db.CheckConstraint(
            "picked_side <> 'push' OR spread_at_pick = trunc(spread_at_pick)",
            name="ck_picks_push_requires_whole_spread",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        UUID(as_uuid=True),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    game_id = db.Column(
        db.Integer, db.ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    picked_side = db.Column(db.String(10), nullable=False)
    spread_at_pick = db.Column(db.Numeric(4, 1), nullable=False)
    points_awarded = db.Column(db.Integer)
    created_at = db.Column(
        db.DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user = db.relationship("User", back_populates="picks")
    game = db.relationship("Game", back_populates="picks")
