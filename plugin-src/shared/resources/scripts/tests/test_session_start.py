from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "session_start.py"


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


if __name__ == "__main__":
    unittest.main()
