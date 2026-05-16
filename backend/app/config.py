import os
from datetime import timedelta


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL", "postgresql://pick5:pick5@db:5432/pick5")
    # Force the psycopg (v3) driver — psycopg2 is not installed.
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class Config:
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-insecure-change-me")
    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
    META_APP_ID = os.environ.get("META_APP_ID")
    META_APP_SECRET = os.environ.get("META_APP_SECRET")

    ODDS_API_KEY = os.environ.get("ODDS_API_KEY")
    ODDS_PREFERRED_BOOK = os.environ.get("ODDS_PREFERRED_BOOK", "fanduel")

    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

    SESSION_TYPE = "sqlalchemy"
    SESSION_SQLALCHEMY_TABLE = "flask_sessions"
    SESSION_PERMANENT = True
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
    SESSION_USE_SIGNER = True
    SESSION_COOKIE_NAME = "pick5_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _bool_env("SESSION_COOKIE_SECURE", False)
