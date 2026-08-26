from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from merge_verified import MergeVerificationError, verify_reviewed_content  # noqa: E402


class MergeVerifiedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="merge verified ")
        self.repository = Path(self.temporary.name) / "repository with spaces"
        self.repository.mkdir()
        self.git_executable = shutil.which("git")
        if self.git_executable is None:
            self.skipTest("Git is required")
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Merge Verification")
        self.git("config", "user.email", "merge@example.test")
        self.git("config", "commit.gpgsign", "false")
        self.write("README.md", "base\n")
        self.git("add", "README.md")
        self.git("commit", "-m", "base")
        self.base = self.git("rev-parse", "HEAD")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def git(self, *args: str) -> str:
        result = subprocess.run(
            [self.git_executable, "-C", str(self.repository), *args],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def write(self, path: str, content: str) -> None:
        target = self.repository / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    def feature_commit(self, branch: str = "feature") -> str:
        self.git("switch", "-c", branch, self.base)
        self.write("src/feature.txt", "reviewed content\n")
        self.write("README.md", "reviewed readme\n")
        self.git("add", "-A")
        self.git("commit", "-m", "reviewed feature")
        return self.git("rev-parse", "HEAD")

    def test_accepts_merge_commit_ancestry(self) -> None:
        head = self.feature_commit()
        self.git("switch", "main")
        self.git("merge", "--no-ff", "feature", "-m", "merge feature")
        result = verify_reviewed_content(
            self.repository,
            reviewed_base=self.base,
            reviewed_head=head,
            integration_ref="main",
        )
        self.assertEqual(result["status"], "verified")
        self.assertEqual(result["method"], "ancestor")

    def test_accepts_exact_squash_content_without_sha_equality(self) -> None:
        head = self.feature_commit()
        self.git("switch", "main")
        self.git("merge", "--squash", "feature")
        self.git("commit", "-m", "squash feature")
        result = verify_reviewed_content(
            self.repository,
            reviewed_base=self.base,
            reviewed_head=head,
            integration_ref="main",
        )
        self.assertEqual(result["method"], "tree-content")
        self.assertIn("src/feature.txt", result["changedPaths"])

    def test_rejects_changed_reviewed_paths_after_squash(self) -> None:
        head = self.feature_commit()
        self.git("switch", "main")
        self.git("merge", "--squash", "feature")
        self.git("commit", "-m", "squash feature")
        self.write("src/feature.txt", "different integration content\n")
        self.git("add", "src/feature.txt")
        self.git("commit", "-m", "change reviewed path")
        with self.assertRaisesRegex(
            MergeVerificationError,
            "does not contain the reviewed tree entries",
        ):
            verify_reviewed_content(
                self.repository,
                reviewed_base=self.base,
                reviewed_head=head,
                integration_ref="main",
            )


if __name__ == "__main__":
    unittest.main()
