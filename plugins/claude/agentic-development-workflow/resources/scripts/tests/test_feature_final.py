from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from feature_final import (  # noqa: E402
    FeatureFinalError,
    resolve_feature_final_context,
)
from pr_context import PullRequestContext, PullRequestSnapshot  # noqa: E402
from workflow_context import resolve_workflow_context  # noqa: E402


class FeatureFinalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="feature final ")
        self.root = Path(self.temporary.name) / "repository with spaces"
        self.root.mkdir()
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is required")
        self.run_git("init", "-b", "main")
        self.run_git("config", "user.name", "Feature Final Test")
        self.run_git("config", "user.email", "feature-final@example.test")
        self.run_git("config", "commit.gpgsign", "false")
        self.run_git("config", "core.hooksPath", ".git/disabled-hooks")
        self.write("source.py", "original\n")
        self.run_git("add", "source.py")
        self.run_git("commit", "-m", "original feature base")
        self.feature_base_sha = self.sha()

        self.write_config(self.feature_base_sha)
        self.write(".gitignore", ".DS_Store\nignored-record.md\n")
        self.write("docs/issues/tb-1234-feature/tracker.md", "# Tracker\n")
        self.write("source.py", "earlier slice\n")
        self.run_git("add", ".")
        self.run_git("commit", "-m", "earlier feature slice")
        self.slice_base_sha = self.sha()

        self.run_git("switch", "-c", "tb-1234-feature-05-final-context")
        self.write("source.py", "final slice\n")
        self.write("final.py", "print('final')\n")
        self.run_git("add", "source.py", "final.py")
        self.run_git("commit", "-m", "final feature slice")
        self.head_sha = self.sha()
        self.workflow = resolve_workflow_context(self.root)
        self.context = self.make_context(self.feature_base_sha)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_git(self, *args: str) -> str:
        result = subprocess.run(
            [self.git, "-C", str(self.root), *args],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def sha(self) -> str:
        return self.run_git("rev-parse", "HEAD")

    def write(self, relative: str, content: str) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def write_config(self, feature_base_sha: str | None) -> None:
        repository = {
            "path": ".",
            "remote": "origin",
            "integrationBranch": "main",
        }
        if feature_base_sha is not None:
            repository["featureBaseSha"] = feature_base_sha
        self.write(
            ".agentic-workflow.json",
            f"{json.dumps({'schemaVersion': 1, 'featureId': 'tb-1234-feature', 'repositories': {'product': repository}}, indent=2)}\n",
        )

    def make_context(self, feature_base_sha: str | None) -> PullRequestContext:
        snapshot = PullRequestSnapshot(
            repository="example/product",
            number=45,
            url="https://github.com/example/product/pull/45",
            state="OPEN",
            is_draft=True,
            base_branch="main",
            base_sha=self.slice_base_sha,
            head_branch="tb-1234-feature-05-final-context",
            head_sha=self.head_sha,
        )
        return PullRequestContext(
            repository_root=self.root.resolve(),
            repository_alias="product",
            remote="origin",
            source="explicit",
            pull_request=snapshot,
            merge_base_sha=self.slice_base_sha,
            evaluated_source_sha=self.head_sha,
            feature_base_sha=feature_base_sha,
        )

    def test_resolves_complete_feature_and_slice_views(self) -> None:
        result = resolve_feature_final_context(self.workflow, self.context)

        self.assertEqual(result["scope"], "feature-final")
        self.assertEqual(result["featureBaseSha"], self.feature_base_sha)
        self.assertEqual(result["sliceBaseSha"], self.slice_base_sha)
        self.assertIn("final.py", result["featureChangedFiles"])
        self.assertIn("source.py", result["sliceChangedFiles"])
        self.assertNotIn(".agentic-workflow.json", result["sliceChangedFiles"])
        self.assertEqual(result["retention"]["status"], "tracked")
        self.assertFalse(result["retention"]["retentionDecisionRequired"])

    def test_reports_untracked_feature_record_files_without_archiving_them(self) -> None:
        self.write("docs/issues/tb-1234-feature/local-note.md", "local only\n")

        result = resolve_feature_final_context(self.workflow, self.context)

        self.assertEqual(result["retention"]["status"], "partially_tracked")
        self.assertTrue(result["retention"]["retentionDecisionRequired"])
        self.assertEqual(
            result["retention"]["untrackedFiles"], ["local-note.md"]
        )

    def test_ignores_git_ignored_transient_files_in_retention_decision(self) -> None:
        self.write("docs/issues/tb-1234-feature/.DS_Store", "transient\n")

        result = resolve_feature_final_context(self.workflow, self.context)

        self.assertEqual(result["retention"]["status"], "tracked")
        self.assertFalse(result["retention"]["retentionDecisionRequired"])
        self.assertEqual(result["retention"]["ignoredFiles"], [".DS_Store"])

    def test_ignored_nontransient_record_still_requires_retention_decision(self) -> None:
        self.write(
            "docs/issues/tb-1234-feature/ignored-record.md",
            "important but ignored\n",
        )

        result = resolve_feature_final_context(self.workflow, self.context)

        self.assertEqual(result["retention"]["status"], "partially_tracked")
        self.assertTrue(result["retention"]["retentionDecisionRequired"])
        self.assertEqual(
            result["retention"]["untrackedFiles"], ["ignored-record.md"]
        )

    def test_requires_the_configured_original_base_in_pinned_context(self) -> None:
        self.write_config(None)
        workflow = resolve_workflow_context(self.root)
        context = self.make_context(None)

        with self.assertRaisesRegex(FeatureFinalError, "no featureBaseSha"):
            resolve_feature_final_context(workflow, context)

    def test_rejects_a_feature_base_that_is_not_ancestral_to_the_slice(self) -> None:
        self.write_config(self.head_sha)
        workflow = resolve_workflow_context(self.root)
        context = self.make_context(self.head_sha)

        with self.assertRaisesRegex(FeatureFinalError, "not an ancestor"):
            resolve_feature_final_context(workflow, context)

    def test_rejects_local_source_drift_from_the_pinned_final_pr(self) -> None:
        self.write("later.py", "later\n")
        self.run_git("add", "later.py")
        self.run_git("commit", "-m", "later source")

        with self.assertRaisesRegex(FeatureFinalError, "Local HEAD"):
            resolve_feature_final_context(self.workflow, self.context)

    def test_cli_emits_the_versioned_feature_final_context(self) -> None:
        context_path = self.root / "pr-context.json"
        context_path.write_text(
            f"{json.dumps(self.context.to_dict(), indent=2)}\n", encoding="utf-8"
        )
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "feature_final.py"),
                "--cwd",
                str(self.root),
                "--context",
                str(context_path),
                "--json",
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        value = json.loads(result.stdout)
        self.assertEqual(value["schemaVersion"], 1)
        self.assertEqual(value["featureBaseSha"], self.feature_base_sha)


if __name__ == "__main__":
    unittest.main()
