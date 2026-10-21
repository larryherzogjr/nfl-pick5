"""Exercise deployment sequencing without Docker, root, or network access."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class ApplicationDeployTests(unittest.TestCase):
    def test_migration_stdin_cannot_swallow_restart_and_publish_steps(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "deploy").mkdir()
            (root / "frontend").mkdir()
            commands = root / "bin"
            commands.mkdir()
            script = root / "deploy/build_app.sh"
            shutil.copyfile(Path(__file__).resolve().parents[1] / script.name, script)
            log = root / "commands.log"
            for name, contents in {
                "git": "#!/bin/bash\nexit 0\n",
                "curl": '#!/bin/bash\nprintf "health\\n" >> "$DEPLOY_TEST_LOG"\n',
                "docker": """#!/bin/bash
printf '%s\\n' "$*" >> "$DEPLOY_TEST_LOG"
if [[ $1 == build ]]; then
    for argument in "$@"; do
        if [[ $argument == type=local,dest=* ]]; then
            printf 'new frontend' > "${argument#type=local,dest=}/index.html"
        fi
    done
fi
if [[ " $* " == *" run "* ]]; then
    # Mimic Compose attaching stdin to the migration container.
    cat > /dev/null
    if [[ ${DEPLOY_TEST_FAIL_MIGRATION:-} == 1 ]]; then
        exit 1
    fi
fi
""",
            }.items():
                command = commands / name
                command.write_text(contents)
                command.chmod(0o755)
            env = {
                **os.environ,
                "PATH": f"{commands}:{os.environ['PATH']}",
                "DEPLOY_TEST_LOG": str(log),
            }
            subprocess.run(
                ["bash", str(script)], env=env, input="", text=True, check=True
            )
            entries = log.read_text().splitlines()
            migration = next(i for i, line in enumerate(entries) if " run " in line)
            restart = next(i for i, line in enumerate(entries) if " up " in line)
            status = next(i for i, line in enumerate(entries) if line.endswith(" ps"))
            self.assertIn("run --rm -T backend flask db upgrade", entries[migration])
            self.assertLess(migration, restart)
            self.assertLess(restart, entries.index("health"))
            self.assertLess(entries.index("health"), status)
            self.assertEqual(
                (root / "frontend/dist/index.html").read_text(), "new frontend"
            )

            # A failed migration must stop deployment before service restart.
            log.write_text("")
            result = subprocess.run(
                ["bash", str(script)],
                env={**env, "DEPLOY_TEST_FAIL_MIGRATION": "1"},
                input="",
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(" up ", log.read_text())
