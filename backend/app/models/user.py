import uuid

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class User(db.Model):
    __tablename__ = "users"
    __table_args__ = (
        db.UniqueConstraint("oauth_provider", "oauth_subject", name="uq_users_oauth_identity"),
    )

    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = db.Column(db.String(255), unique=True, nullable=False)
    display_name = db.Column(db.String(100), nullable=False)
    avatar_url = db.Column(db.Text)
    oauth_display_name = db.Column(db.String(100), nullable=False)
    oauth_avatar_url = db.Column(db.Text)
    oauth_provider = db.Column(db.String(20), nullable=False)
    oauth_subject = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    created_at = db.Column(
        db.DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_login = db.Column(db.DateTime(timezone=True))

    picks = db.relationship("Pick", back_populates="user", cascade="all, delete-orphan")
