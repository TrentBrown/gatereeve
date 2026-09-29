from __future__ import annotations

import json
import hashlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from boundary_context import BoundaryContext  # noqa: E402
from boundary_gate import resolve_gate_context  # noqa: E402
from boundary_packet import (  # noqa: E402
    ARTIFACTS,
    packet_path_for_context,
    validate_packet,
)
from pr_context import ExplicitPullRequestProvider, verify_boundary_context_is_current  # noqa: E402
from synthetic_review import (  # noqa: E402
    SyntheticReviewError,
    promote_review,
    publish_review,
    resolve_synthetic_context,
)
from workflow_context import resolve_workflow_context  # noqa: E402


class SyntheticReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="synthetic review ")
        self.root = Path(self.temporary.name)
        self.remote = self.root / "remote.git"
        self.seed = self.root / "seed"
        self.repository = self.root / "work"
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is required")
        self.git_run(self.root, "init", "--bare", str(self.remote))
        self.git_run(self.root, "init", "-b", "integration", str(self.seed))
        self.configure(self.seed)
        (self.seed / ".agentic-workflow.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "featureId": "tb-synthetic-feature",
                    "repositories": {
                        "product": {
                            "path": ".",
                            "remote": "origin",
                            "integrationBranch": "integration",
                            "releaseBranch": "main",
                            "sliceBoundaryMode": "synthetic-commit",
                            "featureBaseSha": "1" * 40,
                        }
                    },
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        (self.seed / "base.txt").write_text("base\n", encoding="utf-8")
        self.git_run(self.seed, "add", ".")
        self.git_run(self.seed, "commit", "-m", "base")
        self.git_run(self.seed, "remote", "add", "origin", str(self.remote))
        self.git_run(self.seed, "push", "-u", "origin", "integration")
        self.git_run(self.root, "clone", "--branch", "integration", str(self.remote), str(self.repository))
        self.configure(self.repository)
        self.git_run(self.repository, "switch", "-c", "tb-synthetic-feature-01-slice")
        (self.repository / "slice.txt").write_text("slice\n", encoding="utf-8")
        self.git_run(self.repository, "add", "slice.txt")
        self.git_run(self.repository, "commit", "-m", "slice")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def git_run(self, cwd: Path, *args: str) -> str:
        result = subprocess.run(
            [self.git, "-C", str(cwd), *args],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def configure(self, repository: Path) -> None:
        self.git_run(repository, "config", "user.name", "Synthetic Reviewer")
        self.git_run(repository, "config", "user.email", "review@example.test")

    def context(self) -> BoundaryContext:
        workflow = resolve_workflow_context(self.repository, git_executable=self.git)
        return resolve_synthetic_context(
            workflow.repository,
            workflow.feature_id,
            git_executable=self.git,
        )

    def remote_ref(self, ref: str) -> str | None:
        output = self.git_run(self.repository, "ls-remote", "--refs", "origin", ref)
        return output.split()[0] if output else None

    def reviewed(self, receipt: dict[str, object]) -> dict[str, object]:
        value = dict(receipt)
        encoded = json.dumps([], sort_keys=True, separators=(",", ":")).encode("utf-8")
        value["commentsFingerprint"] = f"sha256:{hashlib.sha256(encoded).hexdigest()}"
        return value

    def test_round_trips_context_and_promotes_the_exact_reviewed_commit(self) -> None:
        context = self.context()
        self.assertEqual(
            BoundaryContext.from_dict(context.to_dict()).to_dict(), context.to_dict()
        )

        receipt = self.reviewed(publish_review(
            context,
            github_repository="example/product",
            git_executable=self.git,
        ))

        review_sha = str(receipt["reviewCommitSha"])
        commit = self.git_run(self.repository, "cat-file", "-p", review_sha)
        self.assertIn(f"tree {receipt['treeSha']}", commit.splitlines())
        self.assertEqual(
            [line for line in commit.splitlines() if line.startswith("parent ")],
            [f"parent {context.base_sha}"],
        )
        self.assertEqual(self.remote_ref(str(receipt["reviewRef"])), review_sha)
        self.assertEqual(
            receipt["url"], f"https://github.com/example/product/commit/{review_sha}"
        )

        result = promote_review(
            context,
            self.reviewed(receipt),
            {
                "accepted": True,
                "actor": "human-reviewer",
                "reviewCommitSha": review_sha,
            },
            git_executable=self.git,
        )

        self.assertEqual(result["integrationSha"], review_sha)
        self.assertEqual(self.remote_ref("refs/heads/integration"), review_sha)

    def test_refuses_dirty_detached_stale_and_undeclared_sources(self) -> None:
        (self.repository / "dirty.txt").write_text("dirty\n", encoding="utf-8")
        with self.assertRaisesRegex(SyntheticReviewError, "clean"):
            self.context()
        (self.repository / "dirty.txt").unlink()

        context = self.context()
        (self.repository / "source.txt").write_text("changed after gates\n", encoding="utf-8")
        self.git_run(self.repository, "add", "source.txt")
        self.git_run(self.repository, "commit", "-m", "unexpected source change")
        with self.assertRaisesRegex(SyntheticReviewError, "undeclared"):
            publish_review(
                context,
                github_repository="example/product",
                git_executable=self.git,
            )
        self.assertIsNone(self.remote_ref(str(context.review["reviewRef"])))

        self.git_run(self.repository, "switch", "--detach")
        workflow = resolve_workflow_context(self.repository, git_executable=self.git)
        with self.assertRaisesRegex(SyntheticReviewError, "detached"):
            resolve_synthetic_context(
                workflow.repository,
                workflow.feature_id,
                git_executable=self.git,
            )

    def test_refuses_integration_or_review_ref_drift(self) -> None:
        context = self.context()
        receipt = publish_review(
            context,
            github_repository="example/product",
            git_executable=self.git,
        )
        with self.assertRaisesRegex(SyntheticReviewError, "already exists"):
            publish_review(
                context,
                github_repository="example/product",
                git_executable=self.git,
            )

        self.git_run(
            self.repository,
            "push",
            "--force",
            "origin",
            f"{context.base_sha}:{receipt['reviewRef']}",
        )
        with self.assertRaisesRegex(SyntheticReviewError, "no longer names"):
            promote_review(
                context,
                self.reviewed(receipt),
                {
                    "accepted": True,
                    "actor": "human-reviewer",
                    "reviewCommitSha": receipt["reviewCommitSha"],
                },
                git_executable=self.git,
            )
        self.assertEqual(self.remote_ref("refs/heads/integration"), context.base_sha)

    def test_refuses_publication_after_integration_moves(self) -> None:
        context = self.context()
        (self.seed / "integration.txt").write_text("moved\n", encoding="utf-8")
        self.git_run(self.seed, "add", "integration.txt")
        self.git_run(self.seed, "commit", "-m", "move integration")
        self.git_run(self.seed, "push", "origin", "integration")

        with self.assertRaisesRegex(SyntheticReviewError, "Integration branch moved"):
            publish_review(
                context,
                github_repository="example/product",
                git_executable=self.git,
            )
        self.assertIsNone(self.remote_ref(str(context.review["reviewRef"])))

    def test_gate_and_packet_use_transport_neutral_synthetic_identity(self) -> None:
        context = self.context()
        workflow = resolve_workflow_context(self.repository, git_executable=self.git)
        current = verify_boundary_context_is_current(
            context.to_dict(),
            workflow.repository,
            ExplicitPullRequestProvider({}),
            git_executable=self.git,
        )
        self.assertEqual(current["status"], "current")
        self.assertEqual(current["transport"], "synthetic-commit")
        gate = resolve_gate_context(workflow, context, "codeReview")
        self.assertEqual(gate["transport"], "synthetic-commit")
        self.assertEqual(gate["diffBaseSha"], context.base_sha)
        self.assertEqual(gate["diffHeadSha"], context.evaluated_source_sha)
        self.assertNotIn("pullRequest", gate)

        receipt = self.reviewed(publish_review(
            context,
            github_repository="example/product",
            git_executable=self.git,
        ))
        receipt = promote_review(
            context,
            receipt,
            {
                "accepted": True,
                "actor": "human-reviewer",
                "reviewCommitSha": receipt["reviewCommitSha"],
            },
            git_executable=self.git,
        )
        packet = packet_path_for_context(workflow, context)
        packet.mkdir(parents=True)
        applicability = {
            "specEvaluation": False,
            "judge": False,
            "patternReview": False,
        }
        gates: dict[str, object] = {}
        for gate_id, artifact_name in ARTIFACTS.items():
            applicable = gate_id not in applicability or applicability.get(gate_id, True)
            if applicable:
                artifact = packet / artifact_name
                artifact.write_text(f"{gate_id} evidence\n", encoding="utf-8")
                digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
                gates[gate_id] = {
                    "disposition": "passed",
                    "reason": None,
                    "evidence": {
                        "path": artifact_name,
                        "sha256": f"sha256:{digest}",
                    },
                }
            else:
                gates[gate_id] = {
                    "disposition": "not_applicable",
                    "reason": "Not configured for this repository",
                    "evidence": None,
                }
        manifest = {
            "schemaVersion": 3,
            "scope": "slice",
            "featureId": workflow.feature_id,
            "repositoryAlias": workflow.repository.alias,
            "packetId": packet.name,
            "review": receipt,
            "mergeBaseSha": context.merge_base_sha,
            "evaluatedSourceSha": context.evaluated_source_sha,
            "featureBaseSha": None,
            "applicability": applicability,
            "gates": gates,
        }
        (packet / "boundary.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        workflow.feature_home.mkdir(parents=True, exist_ok=True)
        (workflow.feature_home / "tracker.md").write_text(
            "# Tracker\n\n## Review Log\n\n"
            f"### Review {context.reference}\n\n"
            f"- **Evidence packet:** [packet]({packet.name}/)\n",
            encoding="utf-8",
        )

        result = validate_packet(
            workflow,
            context,
            changed_paths=[f"{packet.name}/boundary.json"],
        )
        self.assertEqual(result["transport"], "synthetic-commit")
        self.assertEqual(result["reviewReference"], context.reference)
        self.assertIsNone(result["pullRequestNumber"])


if __name__ == "__main__":
    unittest.main()
