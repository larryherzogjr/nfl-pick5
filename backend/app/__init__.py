from authlib.integrations.flask_client import OAuth
from flask import Flask
from flask_cors import CORS
from flask_migrate import Migrate
from flask_session import Session
from flask_sqlalchemy import SQLAlchemy

from werkzeug.middleware.proxy_fix import ProxyFix

from app.config import Config

db = SQLAlchemy()
migrate = Migrate()
sess = Session()
oauth = OAuth()
cors = CORS()


def create_app(config_class: type = Config) -> Flask:
    app = Flask(__name__)
    # Trust X-Forwarded-* headers from the Nginx reverse proxy.
    # Without this, url_for(_external=True) generates http:// URLs
    # because Flask sees the incoming request as plain HTTP from 127.0.0.1.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)

    app.config["SESSION_SQLALCHEMY"] = db
    sess.init_app(app)

    cors.init_app(
        app,
        resources={
            r"/auth/*": {"origins": [app.config["FRONTEND_URL"]]},
            r"/api/*": {"origins": [app.config["FRONTEND_URL"]]},
        },
        supports_credentials=True,
    )

    from app import models  # noqa: F401  (register models with SQLAlchemy metadata)

    oauth.init_app(app)
    oauth.register(
        name="google",
        client_id=app.config.get("GOOGLE_CLIENT_ID"),
        client_secret=app.config.get("GOOGLE_CLIENT_SECRET"),
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )
    from app.routes.admin import admin_bp
    from app.routes.auth import auth_bp
    from app.routes.health import health_bp
    from app.routes.leaderboard import leaderboard_bp
    from app.routes.media import media_bp
    from app.routes.picks import picks_bp
    from app.routes.users import users_bp
    from app.routes.weeks import weeks_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(weeks_bp)
    app.register_blueprint(picks_bp)
    app.register_blueprint(leaderboard_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(health_bp)

    from app.commands import seed_weeks

    app.cli.add_command(seed_weeks)

    return app
