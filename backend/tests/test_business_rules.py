import os
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from flask import Flask

from app import create_app, db
from app.models import Game, Pick, Season, User, Week
from app.routes.auth import _email_belongs_to_another_user
from app.routes.picks import _replacement_plan
from app.routes.weeks import _current_or_upcoming_week
from app.scheduler.run import build_scheduler
from app.services.odds_service import _odds_api_url, refresh_odds
from app.services.score_service import _scores_api_url, points_for_pick, refresh_scores
from app.utils.season_phases import PRESEASON_PHASE


class TestConfig:
    TESTING = True
    SECRET_KEY = "test-secret"
    SQLALCHEMY_DATABASE_URI = os.environ.get("TEST_DATABASE_URL", "sqlite://")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_TYPE = "sqlalchemy"
    SESSION_SQLALCHEMY_TABLE = "test_sessions"
    SESSION_PERMANENT = False
    SESSION_COOKIE_SECURE = False
    FRONTEND_URL = "http://localhost"
    GOOGLE_CLIENT_ID = None
    GOOGLE_CLIENT_SECRET = None
    ODDS_API_KEY = None
    ODDS_PREFERRED_BOOK = "fanduel"


class UnsafeProductionConfig(TestConfig):
    SECRET_KEY = "dev-insecure-change-me"
    SESSION_COOKIE_SECURE = True
    FRONTEND_URL = "https://pick5.example.com"


class PickReplacementTests(unittest.TestCase):
    def test_omitted_unlocked_picks_are_removed_and_locked_picks_survive(self):
        now = datetime.now(timezone.utc)
        locked = SimpleNamespace(
            game_id=1,
            game=SimpleNamespace(kickoff=now - timedelta(minutes=1)),
        )
        omitted_unlocked = SimpleNamespace(
            game_id=2,
            game=SimpleNamespace(kickoff=now + timedelta(hours=1)),
        )
        retained_unlocked = SimpleNamespace(
            game_id=3,
            game=SimpleNamespace(kickoff=now + timedelta(hours=2)),
        )

        final_ids, to_delete = _replacement_plan(
            [locked, omitted_unlocked, retained_unlocked], {3, 4}, now
        )

        self.assertEqual(final_ids, {1, 3, 4})
        self.assertEqual(to_delete, [omitted_unlocked])

    def test_production_rejects_the_default_session_secret(self):
        with self.assertRaisesRegex(RuntimeError, "FLASK_SECRET_KEY"):
            create_app(UnsafeProductionConfig)


class ScoringTests(unittest.TestCase):
    def test_home_and_away_cover(self):
        self.assertEqual(points_for_pick(24, 20, Decimal("-3.0"), "home"), 1)
        self.assertEqual(points_for_pick(20, 24, Decimal("3.0"), "away"), 1)

    def test_push_is_worth_two_only_when_selected(self):
        self.assertEqual(points_for_pick(24, 21, Decimal("-3.0"), "push"), 2)
        self.assertEqual(points_for_pick(24, 21, Decimal("-3.0"), "home"), 0)
        self.assertEqual(points_for_pick(24, 21, Decimal("-3.0"), "away"), 0)

    def test_incorrect_push_scores_zero(self):
        self.assertEqual(points_for_pick(27, 21, Decimal("-3.0"), "push"), 0)


class PickEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app(TestConfig)
        cls.context = cls.app.app_context()
        cls.context.push()
        cls.client = cls.app.test_client()

    @classmethod
    def tearDownClass(cls):
        db.session.remove()
        db.engine.dispose()
        cls.context.pop()

    def setUp(self):
        db.drop_all()
        db.create_all()

        self.now = datetime.now(timezone.utc)
        season = Season(year=2026, label="2026", is_active=True)
        db.session.add(season)
        db.session.flush()
        self.week = Week(
            season_id=season.id,
            week_number=1,
            label="Week 1",
            start_date=self.now.date(),
            end_date=self.now.date(),
        )
        self.viewer = User(
            email="viewer@example.com",
            display_name="Viewer",
            oauth_display_name="Viewer",
            oauth_provider="google",
            oauth_subject="viewer",
        )
        self.target = User(
            email="target@example.com",
            display_name="Target",
            oauth_display_name="Target",
            oauth_provider="google",
            oauth_subject="target",
        )
        db.session.add_all([self.week, self.viewer, self.target])
        db.session.flush()
        self.locked_game = self._game(
            "locked", self.now - timedelta(minutes=5), "KC", "BUF"
        )
        self.future_game = self._game(
            "future", self.now + timedelta(hours=2), "GB", "CHI"
        )
        db.session.add_all([self.locked_game, self.future_game])
        db.session.flush()
        db.session.add_all(
            [
                Pick(
                    user_id=self.target.id,
                    game_id=self.locked_game.id,
                    picked_side="home",
                    spread_at_pick=Decimal("-3.0"),
                ),
                Pick(
                    user_id=self.target.id,
                    game_id=self.future_game.id,
                    picked_side="away",
                    spread_at_pick=Decimal("2.5"),
                ),
            ]
        )
        db.session.commit()

    def tearDown(self):
        db.session.remove()

    def _game(self, external_id, kickoff, home_abbr, away_abbr):
        return Game(
            week_id=self.week.id,
            external_id=external_id,
            home_team=f"{home_abbr} Home",
            away_team=f"{away_abbr} Away",
            home_abbr=home_abbr,
            away_abbr=away_abbr,
            kickoff=kickoff,
            spread_home=Decimal("-3.0"),
        )

    def _login(self, user):
        with self.client.session_transaction() as session:
            session["user_id"] = str(user.id)

    def test_other_players_future_picks_are_hidden(self):
        self._login(self.viewer)
        response = self.client.get(
            f"/api/users/{self.target.id}/weeks/{self.week.id}/picks"
        )

        self.assertEqual(response.status_code, 200)
        picks = response.get_json()["picks"]
        self.assertEqual([pick["game_id"] for pick in picks], [self.locked_game.id])

    def test_health_check_reaches_the_database(self):
        response = self.client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})

    def test_duplicate_oauth_email_is_detected_without_auto_linking(self):
        self.assertEqual(
            _email_belongs_to_another_user(self.target.email, None), self.target
        )
        self.assertIsNone(
            _email_belongs_to_another_user(self.target.email, self.target)
        )

    def test_players_can_see_all_of_their_own_picks(self):
        self._login(self.target)
        response = self.client.get(
            f"/api/users/{self.target.id}/weeks/{self.week.id}/picks"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()["picks"]), 2)

    def test_weekly_leaderboard_lists_players_with_visible_ungraded_picks(self):
        self._login(self.viewer)
        response = self.client.get(f"/api/leaderboard?week_id={self.week.id}")

        self.assertEqual(response.status_code, 200)
        target_entry = next(
            entry
            for entry in response.get_json()
            if entry["user"]["id"] == str(self.target.id)
        )
        self.assertEqual(target_entry["points"], 0)
        self.assertEqual(target_entry["total_picked"], 0)

    def test_submission_removes_an_omitted_unlocked_pick(self):
        self._login(self.target)
        response = self.client.post(
            f"/api/weeks/{self.week.id}/picks",
            json={"picks": []},
        )

        self.assertEqual(response.status_code, 200)
        remaining = Pick.query.filter_by(user_id=self.target.id).all()
        self.assertEqual([pick.game_id for pick in remaining], [self.locked_game.id])

    def test_cross_origin_mutation_is_rejected(self):
        self._login(self.target)

        response = self.client.post(
            f"/api/weeks/{self.week.id}/picks",
            json={"picks": []},
            headers={"Origin": "https://attacker.example.com"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.get_json(), {"error": "origin_not_allowed"})

    def test_current_week_falls_forward_across_the_tuesday_wednesday_gap(self):
        self.week.start_date = date(2026, 9, 10)
        self.week.end_date = date(2026, 9, 14)
        db.session.commit()

        resolved = _current_or_upcoming_week(date(2026, 9, 8))

        self.assertEqual(resolved.id, self.week.id)

    def test_current_week_falls_forward_across_preseason_monday_gap(self):
        self.week.start_date = date(2026, 8, 20)
        self.week.end_date = date(2026, 8, 23)
        db.session.commit()

        resolved = _current_or_upcoming_week(date(2026, 8, 17))

        self.assertEqual(resolved.id, self.week.id)

    def test_current_week_does_not_jump_to_a_far_future_week(self):
        self.week.start_date = date(2026, 9, 10)
        self.week.end_date = date(2026, 9, 14)
        db.session.commit()

        self.assertIsNone(_current_or_upcoming_week(date(2026, 9, 1)))

    def test_admin_odds_refresh_is_scoped_to_the_requested_week(self):
        self.viewer.is_admin = True
        db.session.commit()
        self._login(self.viewer)

        with patch("app.routes.admin.refresh_odds", return_value={"updated": 0}) as fn:
            response = self.client.post(f"/api/admin/weeks/{self.week.id}/refresh-odds")

        self.assertEqual(response.status_code, 200)
        fn.assert_called_once_with(week_id=self.week.id)

    def test_preseason_weeks_can_share_regular_week_numbers(self):
        preseason_week = Week(
            season_id=self.week.season_id,
            week_number=1,
            phase=PRESEASON_PHASE,
            label="Preseason Week 1",
            start_date=date(2026, 8, 13),
            end_date=date(2026, 8, 16),
        )
        db.session.add(preseason_week)
        db.session.commit()

        self.assertNotEqual(preseason_week.id, self.week.id)

    def test_preseason_standings_are_isolated_from_official_standings(self):
        preseason_week = Week(
            season_id=self.week.season_id,
            week_number=1,
            phase=PRESEASON_PHASE,
            label="Preseason Week 1",
            start_date=self.now.date(),
            end_date=self.now.date(),
        )
        db.session.add(preseason_week)
        db.session.flush()
        preseason_game = Game(
            week_id=preseason_week.id,
            external_id="preseason-final",
            home_team="Kansas City Chiefs",
            away_team="Buffalo Bills",
            home_abbr="KC",
            away_abbr="BUF",
            kickoff=self.now - timedelta(hours=4),
            spread_home=Decimal("-3.0"),
            score_home=24,
            score_away=20,
            is_final=True,
        )
        db.session.add(preseason_game)
        db.session.flush()
        db.session.add(
            Pick(
                user_id=self.target.id,
                game_id=preseason_game.id,
                picked_side="home",
                spread_at_pick=Decimal("-3.0"),
                points_awarded=1,
            )
        )
        db.session.commit()
        self._login(self.viewer)

        official = self.client.get(f"/api/leaderboard?season_id={self.week.season_id}")
        preseason = self.client.get(
            f"/api/leaderboard?season_id={self.week.season_id}&phase=preseason"
        )

        self.assertEqual(official.status_code, 200)
        self.assertEqual(official.get_json(), [])
        self.assertEqual(preseason.status_code, 200)
        entry = preseason.get_json()[0]
        self.assertEqual(entry["points"], 1)
        self.assertEqual(entry["weekly_breakdown"][0]["label"], "Preseason Week 1")

    def test_preseason_odds_refresh_uses_preseason_sport_key(self):
        preseason_week = Week(
            season_id=self.week.season_id,
            week_number=1,
            phase=PRESEASON_PHASE,
            label="Preseason Week 1",
            start_date=self.now.date(),
            end_date=self.now.date(),
        )
        db.session.add(preseason_week)
        db.session.commit()
        event = {
            "id": "preseason-odds",
            "home_team": "Kansas City Chiefs",
            "away_team": "Buffalo Bills",
            "commence_time": (self.now + timedelta(hours=1)).isoformat(),
            "bookmakers": [
                {
                    "key": "fanduel",
                    "markets": [
                        {
                            "key": "spreads",
                            "outcomes": [
                                {"name": "Kansas City Chiefs", "point": -2.5},
                                {"name": "Buffalo Bills", "point": 2.5},
                            ],
                        }
                    ],
                }
            ],
        }
        response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: [event],
        )
        original_key = self.app.config["ODDS_API_KEY"]
        self.app.config["ODDS_API_KEY"] = "test-key"
        try:
            with patch(
                "app.services.odds_service.requests.get", return_value=response
            ) as get:
                summary = refresh_odds(week_id=preseason_week.id)
        finally:
            self.app.config["ODDS_API_KEY"] = original_key

        self.assertEqual(summary["created"], 1)
        self.assertIn("americanfootball_nfl_preseason", get.call_args.args[0])
        created = Game.query.filter_by(external_id="preseason-odds").one()
        self.assertEqual(created.week_id, preseason_week.id)

    def test_preseason_score_refresh_uses_preseason_sport_key(self):
        self.locked_game.is_final = True
        self.future_game.is_final = True
        preseason_week = Week(
            season_id=self.week.season_id,
            week_number=1,
            phase=PRESEASON_PHASE,
            label="Preseason Week 1",
            start_date=self.now.date(),
            end_date=self.now.date(),
        )
        db.session.add(preseason_week)
        db.session.flush()
        preseason_game = Game(
            week_id=preseason_week.id,
            external_id="preseason-score",
            home_team="Kansas City Chiefs",
            away_team="Buffalo Bills",
            home_abbr="KC",
            away_abbr="BUF",
            kickoff=self.now - timedelta(hours=1),
            spread_home=Decimal("-3.0"),
        )
        db.session.add(preseason_game)
        db.session.flush()
        preseason_pick = Pick(
            user_id=self.target.id,
            game_id=preseason_game.id,
            picked_side="home",
            spread_at_pick=Decimal("-3.0"),
        )
        db.session.add(preseason_pick)
        db.session.commit()
        event = {
            "id": "preseason-score",
            "completed": True,
            "scores": [
                {"name": "Kansas City Chiefs", "score": "24"},
                {"name": "Buffalo Bills", "score": "20"},
            ],
        }
        response = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: [event],
        )
        original_key = self.app.config["ODDS_API_KEY"]
        self.app.config["ODDS_API_KEY"] = "test-key"
        try:
            with patch(
                "app.services.score_service.requests.get", return_value=response
            ) as get:
                summary = refresh_scores()
        finally:
            self.app.config["ODDS_API_KEY"] = original_key

        self.assertEqual(summary["finalized"], 1)
        self.assertIn("americanfootball_nfl_preseason", get.call_args.args[0])
        self.assertTrue(preseason_game.is_final)
        self.assertEqual(preseason_pick.points_awarded, 1)

    def test_preseason_cli_is_idempotent(self):
        runner = self.app.test_cli_runner()

        first = runner.invoke(args=["seed-preseason-weeks", "2026"])
        second = runner.invoke(args=["seed-preseason-weeks", "2026"])

        self.assertEqual(first.exit_code, 0, first.output)
        self.assertEqual(second.exit_code, 0, second.output)
        weeks = Week.query.filter_by(
            season_id=self.week.season_id, phase=PRESEASON_PHASE
        ).all()
        self.assertEqual(len(weeks), 3)


class SeasonPhaseTests(unittest.TestCase):
    def test_provider_urls_are_phase_aware(self):
        self.assertIn("americanfootball_nfl_preseason", _odds_api_url("preseason"))
        self.assertIn("americanfootball_nfl_preseason", _scores_api_url("preseason"))
        self.assertIn("americanfootball_nfl/odds", _odds_api_url("regular"))


class SchedulerTests(unittest.TestCase):
    def test_daily_score_catchup_is_registered(self):
        app = Flask(__name__)
        scheduler = build_scheduler(app)
        job_ids = {job.id for job in scheduler.get_jobs()}

        self.assertIn("refresh_scores_daily_catchup", job_ids)
        self.assertEqual(len(job_ids), 6)


if __name__ == "__main__":
    unittest.main()
