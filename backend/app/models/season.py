from app import db


class Season(db.Model):
    __tablename__ = "seasons"
    __table_args__ = (
        db.Index(
            "uq_seasons_only_one_active",
            "is_active",
            unique=True,
            postgresql_where=db.text("is_active"),
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    year = db.Column(db.Integer, nullable=False)
    label = db.Column(db.String(20), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())

    weeks = db.relationship(
        "Week", back_populates="season", cascade="all, delete-orphan", order_by="Week.week_number"
    )
