from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "decision_triage.py"


class DecisionTriageTests(unittest.TestCase):
    def test_repeated_triage_does_not_duplicate_promoted_decisions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            branch_dir = Path(temporary_directory)
            (branch_dir / "scratchpad.md").write_text(
                "# Scratchpad\n\n"
                "## [1] Keep one source\n\n"
                "[x] **Promote**\n\n"
                "The durable decision.\n"
            )
            (branch_dir / "decisions.md").write_text("# Decisions\n")

            command = [
                sys.executable,
                str(SCRIPT),
                "--branch-dir",
                str(branch_dir),
                "--pr",
                "#2",
            ]
            first = subprocess.run(command, check=True, capture_output=True, text=True)
            second = subprocess.run(command, check=True, capture_output=True, text=True)

            decisions = (branch_dir / "decisions.md").read_text()
            self.assertIn("Promoted 1 decision", first.stdout)
            self.assertIn("No promoted decisions found", second.stdout)
            self.assertEqual(decisions.count("## Keep one source"), 1)


if __name__ == "__main__":
    unittest.main()
