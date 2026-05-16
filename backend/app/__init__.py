from authlib.integrations.flask_client import OAuth
from flask import Flask
from flask_migrate import Migrate
from flask_session import Session
from flask_sqlalchemy import SQLAlchemy

from app.config import Config

db = SQLAlchemy()
migrate = Migrate()
sess = Session()
oauth = OAuth()


def create_app(config_class: type = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)

    app.config["SESSION_SQLALCHEMY"] = db
    sess.init_app(app)

    from app import models  # noqa: F401  (register models with SQLAlchemy metadata)

    oauth.init_app(app)
    oauth.register(
        name="google",
        client_id=app.config.get("GOOGLE_CLIENT_ID"),
        client_secret=app.config.get("GOOGLE_CLIENT_SECRET"),
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )
    oauth.register(
        name="meta",
        client_id=app.config.get("META_APP_ID"),
        client_secret=app.config.get("META_APP_SECRET"),
        access_token_url="https://graph.facebook.com/v19.0/oauth/access_token",
        authorize_url="https://www.facebook.com/v19.0/dialog/oauth",
        api_base_url="https://graph.facebook.com/v19.0/",
        client_kwargs={"scope": "email public_profile"},
    )

    from app.routes.admin import admin_bp
    from app.routes.auth import auth_bp
    from app.routes.picks import picks_bp
    from app.routes.weeks import weeks_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(weeks_bp)
    app.register_blueprint(picks_bp)

    from app.commands import seed_weeks

    app.cli.add_command(seed_weeks)

    return app
