import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location(
    "sync_nginx", Path(__file__).resolve().parents[1] / "sync_nginx.py"
)
nginx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nginx)


class NginxSyncTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / "repo.conf"
        self.target = self.root / "pick5"
        self.source.write_text("new config")
        self.target.write_text("old config")

    @patch.object(nginx, "check_health")
    @patch.object(nginx.subprocess, "run")
    def test_installs_repo_config_validates_reloads_and_checks_health(
        self, run, health
    ):
        nginx.sync_nginx(self.source, self.target)
        self.assertEqual(self.target.read_text(), "new config")
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o644)
        backup = list(self.root.glob("pick5.backup-*"))
        self.assertEqual(len(backup), 1)
        self.assertEqual(backup[0].read_text(), "old config")
        self.assertEqual(
            [call.args[0] for call in run.call_args_list],
            [["nginx", "-t"], ["systemctl", "reload", "nginx"]],
        )
        health.assert_called_once()

    @patch.object(nginx, "check_health")
    @patch.object(nginx.subprocess, "run")
    def test_failed_validation_restores_previous_config_before_reload(
        self, run, health
    ):
        run.side_effect = [subprocess.CalledProcessError(1, "nginx"), None, None]
        with self.assertRaises(subprocess.CalledProcessError):
            nginx.sync_nginx(self.source, self.target)
        self.assertEqual(self.target.read_text(), "old config")
        health.assert_not_called()
        self.assertEqual(run.call_args_list[1].args[0], ["nginx", "-t"])

    @patch.object(nginx, "check_health", side_effect=ValueError("HTML response"))
    @patch.object(nginx.subprocess, "run")
    def test_failed_public_health_check_restores_previous_config(self, run, health):
        with self.assertRaises(ValueError):
            nginx.sync_nginx(self.source, self.target)
        self.assertEqual(self.target.read_text(), "old config")
        self.assertEqual(run.call_count, 4)

    @patch.object(nginx, "check_health")
    @patch.object(nginx.subprocess, "run")
    def test_failed_reload_restores_and_reloads_previous_config(self, run, health):
        run.side_effect = [
            None,
            subprocess.CalledProcessError(1, "systemctl"),
            None,
            None,
        ]
        with self.assertRaises(subprocess.CalledProcessError):
            nginx.sync_nginx(self.source, self.target)
        self.assertEqual(self.target.read_text(), "old config")
        self.assertEqual(run.call_count, 4)
        health.assert_not_called()

    @patch.object(nginx, "check_health")
    @patch.object(nginx.subprocess, "run")
    def test_unchanged_config_still_validates_reloads_and_checks_health(
        self, run, health
    ):
        self.source.write_bytes(self.target.read_bytes())
        nginx.sync_nginx(self.source, self.target)
        self.assertEqual(list(self.root.glob("pick5.backup-*")), [])
        self.assertEqual(run.call_count, 2)
        health.assert_called_once()

    @patch.object(nginx.time, "sleep")
    @patch.object(nginx, "urlopen")
    def test_health_check_rejects_html_even_with_http_200(self, urlopen, sleep):
        response = Mock(status=200)
        response.headers.get_content_type.return_value = "text/html"
        urlopen.return_value.__enter__.return_value = response
        with self.assertRaises(ValueError):
            nginx.check_health()
        self.assertEqual(urlopen.call_count, 5)

    @patch.object(nginx, "urlopen")
    def test_health_check_accepts_backend_json(self, urlopen):
        response = Mock(status=200)
        response.headers.get_content_type.return_value = "application/json"
        response.read.return_value = b'{"status":"ok"}'
        urlopen.return_value.__enter__.return_value = response
        nginx.check_health()

    @patch.object(nginx.time, "sleep")
    @patch.object(nginx, "urlopen")
    def test_health_check_rejects_unhealthy_json(self, urlopen, sleep):
        response = Mock(status=200)
        response.headers.get_content_type.return_value = "application/json"
        response.read.return_value = b'{"status":"error"}'
        urlopen.return_value.__enter__.return_value = response
        with self.assertRaises(ValueError):
            nginx.check_health()
