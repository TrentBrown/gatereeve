from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "bootstrap_branch_docs.py"


class BootstrapBranchDocsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="workflow bootstrap ")
        self.root = Path(self.temporary.name) / "workspace with spaces"
        self.root.mkdir()
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is required")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def init_repository(self, branch: str) -> None:
        subprocess.run([self.git, "-C", str(self.root), "init"], check=True, capture_output=True)
        subprocess.run(
            [self.git, "-C", str(self.root), "checkout", "-b", branch],
            check=True,
            capture_output=True,
        )

    def run_bootstrap(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root)],
            check=True,
            capture_output=True,
            text=True,
        )

    def test_sequential_branches_share_one_configured_feature_folder(self) -> None:
        feature_id = "tb-1234-important-feature"
        self.init_repository(feature_id)
        (self.root / ".agentic-workflow.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "featureId": feature_id,
                    "repositories": {
                        "workflow": {"path": ".", "integrationBranch": "main"}
                    },
                }
            ),
            encoding="utf-8",
        )

        first = self.run_bootstrap()
        subprocess.run(
            [self.git, "-C", str(self.root), "checkout", "-b", f"{feature_id}-02-api"],
            check=True,
            capture_output=True,
        )
        second = self.run_bootstrap()

        feature_home = self.root / "docs/issues" / feature_id
        self.assertTrue((feature_home / "spec.md").is_file())
        self.assertIn("**Feature:**", (feature_home / "spec.md").read_text())
        self.assertFalse((self.root / "docs/issues" / f"{feature_id}-02-api").exists())
        self.assertIn(f"Feature docs: {feature_home.resolve()}", first.stdout)
        self.assertIn("Skipped existing", second.stdout)

    def test_legacy_mode_still_uses_the_current_branch(self) -> None:
        self.init_repository("tb-legacy-feature")

        result = self.run_bootstrap()

        feature_home = self.root / "docs/issues/tb-legacy-feature"
        self.assertTrue((feature_home / "tracker.md").is_file())
        self.assertIn(f"Feature docs: {feature_home.resolve()}", result.stdout)

    def test_configured_mode_rejects_an_unrelated_delivery_branch(self) -> None:
        self.init_repository("unrelated-branch")
        (self.root / ".agentic-workflow.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "featureId": "tb-feature",
                    "repositories": {
                        "workflow": {"path": ".", "integrationBranch": "main"}
                    },
                }
            ),
            encoding="utf-8",
        )

        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(self.root)],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not the feature branch or a sequential delivery branch", result.stderr)

    def test_explicit_feature_id_cannot_override_configured_identity(self) -> None:
        self.init_repository("tb-feature")
        (self.root / ".agentic-workflow.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "featureId": "tb-feature",
                    "repositories": {
                        "workflow": {"path": ".", "integrationBranch": "main"}
                    },
                }
            ),
            encoding="utf-8",
        )

        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--root",
                str(self.root),
                "--feature-id",
                "tb-other-feature",
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not match authoritative configured featureId", result.stderr)
        self.assertFalse((self.root / "docs/issues/tb-other-feature").exists())


if __name__ == "__main__":
    unittest.main()
