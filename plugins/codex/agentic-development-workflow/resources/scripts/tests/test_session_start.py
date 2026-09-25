from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "session_start.py"
sys.path.insert(0, str(SCRIPT.parent))

from session_start import discover_status_context  # noqa: E402


class SessionStartTests(unittest.TestCase):
    def test_emits_minimal_session_start_context(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout)

        self.assertEqual(
            payload["hookSpecificOutput"]["hookEventName"],
            "SessionStart",
        )
        context = payload["hookSpecificOutput"]["additionalContext"]
        self.assertIn("software-development-workflow", context)
        self.assertIn("explicitly asks to bypass", context)
        self.assertEqual(set(payload), {"hookSpecificOutput"})

    def test_discovers_missing_legacy_and_governed_feature_modes(self) -> None:
        node = shutil.which("node")
        git = shutil.which("git")
        if node is None or git is None:
            self.skipTest("Node and Git are required")
        with tempfile.TemporaryDirectory(prefix="gatereeve session start ") as root:
            repository = Path(root)
            subprocess.run([git, "-C", root, "init", "-b", "session-feature"], check=True, capture_output=True)
            subprocess.run([git, "-C", root, "config", "user.name", "Session Test"], check=True)
            subprocess.run([git, "-C", root, "config", "user.email", "session@example.test"], check=True)
            (repository / "README.md").write_text("fixture\n", encoding="utf-8")
            subprocess.run([git, "-C", root, "add", "README.md"], check=True)
            subprocess.run([git, "-C", root, "commit", "-m", "fixture"], check=True, capture_output=True)

            self.assertIn("no feature record", discover_status_context(root) or "")
            feature_home = repository / "docs" / "issues" / "session-feature"
            feature_home.mkdir(parents=True)
            (feature_home / "interview.md").write_text("# legacy\n", encoding="utf-8")
            self.assertIn("legacy feature", discover_status_context(root) or "")

            shutil.rmtree(feature_home)
            adapter = SCRIPT.parent.parent / "protocol" / "plugin-adapter.js"
            request = {
                "operation": "feature.init",
                "cwd": root,
                "actor": {"kind": "agent", "label": "session test"},
                "eventId": "evt-session-init",
            }
            initialized = subprocess.run(
                [node, str(adapter)],
                input=json.dumps(request),
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertTrue(json.loads(initialized.stdout)["ok"])
            governed = discover_status_context(root) or ""
            self.assertIn("state: governed", governed)
            self.assertIn("phase=DESIGNING", governed)


if __name__ == "__main__":
    unittest.main()
