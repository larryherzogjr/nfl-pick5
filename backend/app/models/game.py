from app import db


class Game(db.Model):
    __tablename__ = "games"
    __table_args__ = (
        db.UniqueConstraint("week_id", "external_id", name="uq_games_week_external_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    week_id = db.Column(
        db.Integer,
        db.ForeignKey("weeks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    external_id = db.Column(db.String(100), nullable=False)
    home_team = db.Column(db.String(50), nullable=False)
    away_team = db.Column(db.String(50), nullable=False)
    home_abbr = db.Column(db.String(5), nullable=False)
    away_abbr = db.Column(db.String(5), nullable=False)
    kickoff = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    spread_home = db.Column(db.Numeric(4, 1))
    spread_source = db.Column(db.String(50))
    spread_updated_at = db.Column(db.DateTime(timezone=True))
    score_home = db.Column(db.Integer)
    score_away = db.Column(db.Integer)
    is_final = db.Column(
        db.Boolean, nullable=False, default=False, server_default=db.false()
    )
    admin_override = db.Column(
        db.Boolean, nullable=False, default=False, server_default=db.false()
    )

    week = db.relationship("Week", back_populates="games")
    picks = db.relationship("Pick", back_populates="game", cascade="all, delete-orphan")
