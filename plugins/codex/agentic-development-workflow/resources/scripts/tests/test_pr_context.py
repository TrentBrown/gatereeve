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

from pr_context import (  # noqa: E402
    ExplicitPullRequestProvider,
    GitHubPullRequestProvider,
    PullRequestContext,
    PullRequestContextError,
    finalize_pull_request_context,
    resolve_pull_request_context,
    verify_context_is_current,
)
from workflow_context import RepositoryContext  # noqa: E402


class PullRequestContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="pr context ")
        self.root = Path(self.temporary.name) / "repository with spaces"
        self.root.mkdir()
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is required")
        self.run_git("init", "-b", "main")
        self.run_git("config", "user.name", "Workflow Test")
        self.run_git("config", "user.email", "workflow@example.test")
        self.run_git("config", "commit.gpgsign", "false")
        self.run_git("config", "core.hooksPath", ".git/disabled-hooks")
        self.run_git("remote", "add", "origin", "https://github.com/example/product.git")
        self.write("README.md", "base\n")
        self.run_git("add", "README.md")
        self.run_git("commit", "-m", "base")
        self.base_sha = self.sha()
        self.run_git("switch", "-c", "tb-feature-02-pr-context")
        self.write("src/app.py", "print('feature')\n")
        self.run_git("add", "src/app.py")
        self.run_git("commit", "-m", "feature")
        self.head_sha = self.sha()
        self.repository = RepositoryContext(
            alias="product",
            path=self.root,
            remote="origin",
            integration_branch="main",
            feature_base_sha=self.base_sha,
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def run_git(self, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [self.git, "-C", str(self.root), *args],
            check=check,
            capture_output=True,
            text=True,
        )

    def sha(self) -> str:
        return self.run_git("rev-parse", "HEAD").stdout.strip()

    def write(self, relative: str, content: str) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def payload(self, **overrides: object) -> dict[str, object]:
        value: dict[str, object] = {
            "repository": "example/product",
            "number": 42,
            "url": "https://github.com/example/product/pull/42",
            "state": "OPEN",
            "isDraft": True,
            "baseRefName": "main",
            "baseRefOid": self.base_sha,
            "headRefName": "tb-feature-02-pr-context",
            "headRefOid": self.head_sha,
        }
        value.update(overrides)
        return value

    def provider(self, **overrides: object) -> ExplicitPullRequestProvider:
        return ExplicitPullRequestProvider(self.payload(**overrides))

    def resolve(self) -> PullRequestContext:
        return resolve_pull_request_context(
            self.repository,
            self.provider(),
            git_executable=self.git,
        )

    def test_resolves_clean_pushed_draft_and_pins_one_context(self) -> None:
        context = self.resolve()

        self.assertEqual(context.source, "explicit")
        self.assertEqual(context.pull_request.number, 42)
        self.assertEqual(context.pull_request.base_sha, self.base_sha)
        self.assertEqual(context.pull_request.head_sha, self.head_sha)
        self.assertEqual(context.merge_base_sha, self.base_sha)
        self.assertEqual(context.evaluated_source_sha, self.head_sha)
        self.assertEqual(context.feature_base_sha, self.base_sha)
        self.assertEqual(
            PullRequestContext.from_dict(context.to_dict()).to_dict(),
            context.to_dict(),
        )

    def test_rejects_dirty_wrong_branch_unpushed_and_ready_sources(self) -> None:
        self.write("dirty.txt", "not committed\n")
        with self.assertRaisesRegex(PullRequestContextError, "dirty"):
            self.resolve()
        (self.root / "dirty.txt").unlink()

        with self.assertRaisesRegex(PullRequestContextError, "differs from PR head branch"):
            resolve_pull_request_context(
                self.repository,
                self.provider(headRefName="different-branch"),
                git_executable=self.git,
            )

        with self.assertRaisesRegex(PullRequestContextError, "differs from pushed PR head"):
            resolve_pull_request_context(
                self.repository,
                self.provider(headRefOid=self.base_sha),
                git_executable=self.git,
            )

        with self.assertRaisesRegex(PullRequestContextError, "must be draft"):
            resolve_pull_request_context(
                self.repository,
                self.provider(isDraft=False),
                git_executable=self.git,
            )

    def test_rejects_closed_or_mismatched_pull_request_identity(self) -> None:
        with self.assertRaisesRegex(PullRequestContextError, "not OPEN"):
            resolve_pull_request_context(
                self.repository,
                self.provider(state="MERGED"),
                git_executable=self.git,
            )

        context = self.resolve()
        with self.assertRaisesRegex(PullRequestContextError, "does not match selector"):
            verify_context_is_current(
                context,
                self.provider(number=43),
                git_executable=self.git,
            )

    def test_stale_check_rejects_remote_or_local_head_changes(self) -> None:
        context = self.resolve()
        self.write("src/next.py", "print('next')\n")
        self.run_git("add", "src/next.py")
        self.run_git("commit", "-m", "next")
        next_sha = self.sha()

        with self.assertRaisesRegex(PullRequestContextError, "became stale"):
            verify_context_is_current(
                context,
                self.provider(headRefOid=next_sha),
                git_executable=self.git,
            )

        with self.assertRaisesRegex(PullRequestContextError, "Local HEAD changed"):
            verify_context_is_current(
                context,
                self.provider(),
                git_executable=self.git,
            )

    def test_stale_check_allows_uncommitted_boundary_artifacts(self) -> None:
        context = self.resolve()
        self.write("docs/issues/tb-feature/pr-42/verification.md", "working evidence\n")

        result = verify_context_is_current(
            context,
            self.provider(),
            git_executable=self.git,
        )

        self.assertEqual(result["status"], "current")
        self.assertEqual(result["evaluatedSourceSha"], self.head_sha)

    def test_finalization_allows_only_declared_evidence_and_requires_sync(self) -> None:
        context = self.resolve()
        evidence_path = "docs/issues/tb-feature/pr-42/verification.md"
        self.write(evidence_path, "# Verification\n")
        self.run_git("add", evidence_path)
        self.run_git("commit", "-m", "evidence")
        evidence_sha = self.sha()

        result = finalize_pull_request_context(
            context,
            self.provider(headRefOid=evidence_sha),
            evidence_paths=["docs/issues/tb-feature/pr-42"],
            git_executable=self.git,
        )

        self.assertEqual(result["status"], "synchronized")
        self.assertEqual(result["finalHeadSha"], evidence_sha)
        self.assertEqual(result["evidenceChanges"], [evidence_path])

        with self.assertRaisesRegex(PullRequestContextError, "differs from remote"):
            finalize_pull_request_context(
                context,
                self.provider(),
                evidence_paths=["docs/issues/tb-feature/pr-42"],
                git_executable=self.git,
            )

    def test_finalization_rejects_intervening_code_and_unsafe_declarations(self) -> None:
        context = self.resolve()
        self.write("docs/issues/tb-feature/pr-42/verification.md", "evidence\n")
        self.write("src/intervening.py", "print('code')\n")
        self.run_git("add", "docs", "src/intervening.py")
        self.run_git("commit", "-m", "mixed")
        mixed_sha = self.sha()

        with self.assertRaisesRegex(PullRequestContextError, "undeclared non-evidence"):
            finalize_pull_request_context(
                context,
                self.provider(headRefOid=mixed_sha),
                evidence_paths=["docs/issues/tb-feature/pr-42"],
                git_executable=self.git,
            )
        with self.assertRaisesRegex(PullRequestContextError, "safe repository-relative"):
            finalize_pull_request_context(
                context,
                self.provider(headRefOid=mixed_sha),
                evidence_paths=[".." + "/src"],
                git_executable=self.git,
            )

    def test_github_adapter_uses_repository_and_pull_request_json(self) -> None:
        calls: list[tuple[str, tuple[str, ...], Path]] = []

        def runner(
            executable: str,
            args: tuple[str, ...] | list[str],
            cwd: Path,
            environment: object,
        ) -> str:
            calls.append((executable, tuple(args), cwd))
            if tuple(args[:2]) == ("repo", "view"):
                return json.dumps({"nameWithOwner": "example/product"})
            return json.dumps(
                {
                    key: value
                    for key, value in self.payload().items()
                    if key != "repository"
                }
            )

        provider = GitHubPullRequestProvider(
            self.root,
            gh_executable="/managed/gh",
            runner=runner,
        )
        snapshot = provider.snapshot("42")

        self.assertEqual(snapshot.repository, "example/product")
        self.assertEqual(snapshot.number, 42)
        self.assertTrue(all(call[0] == "/managed/gh" for call in calls))
        self.assertEqual(calls[0][1], ("repo", "view", "--json", "nameWithOwner"))
        self.assertIn("--repo", calls[1][1])
        self.assertIn("example/product", calls[1][1])
        self.assertIn("42", calls[1][1])

    def test_explicit_provider_validates_selector_and_schema(self) -> None:
        with self.assertRaisesRegex(PullRequestContextError, "does not match selector"):
            self.provider().snapshot("99")
        with self.assertRaisesRegex(PullRequestContextError, "full hexadecimal"):
            ExplicitPullRequestProvider(
                self.payload(headRefOid="short")
            ).snapshot()

        context = self.resolve().to_dict()
        context["evaluatedSourceSha"] = self.base_sha
        with self.assertRaisesRegex(PullRequestContextError, "originally resolved"):
            PullRequestContext.from_dict(context)

        with self.assertRaisesRegex(PullRequestContextError, "valid Git branch"):
            resolve_pull_request_context(
                self.repository,
                self.provider(headRefName="--unsafe"),
                git_executable=self.git,
            )


if __name__ == "__main__":
    unittest.main()
