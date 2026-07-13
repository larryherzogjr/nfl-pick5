from app import db


class Week(db.Model):
    __tablename__ = "weeks"
    __table_args__ = (
        db.UniqueConstraint(
            "season_id", "week_number", name="uq_weeks_season_week_number"
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    season_id = db.Column(
        db.Integer,
        db.ForeignKey("seasons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    week_number = db.Column(db.Integer, nullable=False)
    label = db.Column(db.String(30), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)

    season = db.relationship("Season", back_populates="weeks")
    games = db.relationship(
        "Game",
        back_populates="week",
        cascade="all, delete-orphan",
        order_by="Game.kickoff",
    )
