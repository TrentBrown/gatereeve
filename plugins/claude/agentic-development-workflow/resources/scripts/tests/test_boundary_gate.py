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

from boundary_gate import BoundaryGateError, resolve_gate_context  # noqa: E402
from boundary_packet import ARTIFACTS  # noqa: E402
from pr_context import PullRequestContext, PullRequestSnapshot  # noqa: E402
from workflow_context import resolve_workflow_context  # noqa: E402


class BoundaryGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="boundary gate ")
        self.root = Path(self.temporary.name) / "repository with spaces"
        self.root.mkdir()
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is required")
        self.run_git("init", "-b", "main")
        self.run_git("config", "user.name", "Boundary Gate Test")
        self.run_git("config", "user.email", "boundary@example.test")
        self.run_git("config", "commit.gpgsign", "false")
        self.run_git("config", "core.hooksPath", ".git/disabled-hooks")
        (self.root / ".agentic-workflow.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "featureId": "tb-1234-feature",
                    "repositories": {
                        "product": {
                            "path": ".",
                            "remote": "origin",
                            "integrationBranch": "main",
                            "featureBaseSha": "0" * 40,
                        }
                    },
                }
            ),
            encoding="utf-8",
        )
        (self.root / "source.py").write_text("before\n", encoding="utf-8")
        self.run_git("add", ".")
        self.run_git("commit", "-m", "base")
        self.feature_base_sha = self.run_git("rev-parse", "HEAD")
        config_path = self.root / ".agentic-workflow.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        config["repositories"]["product"]["featureBaseSha"] = self.feature_base_sha
        config_path.write_text(f"{json.dumps(config, indent=2)}\n", encoding="utf-8")
        self.run_git("add", ".agentic-workflow.json")
        self.run_git("commit", "-m", "configure feature base")
        self.base_sha = self.run_git("rev-parse", "HEAD")
        self.run_git("switch", "-c", "tb-1234-feature-04-gates")
        (self.root / "source.py").write_text("after\n", encoding="utf-8")
        self.run_git("add", "source.py")
        self.run_git("commit", "-m", "source")
        self.head_sha = self.run_git("rev-parse", "HEAD")
        self.workflow = resolve_workflow_context(self.root)
        self.context = self.make_context()

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

    def make_context(
        self,
        *,
        repository_root: Path | None = None,
        repository_alias: str = "product",
    ) -> PullRequestContext:
        return PullRequestContext(
            repository_root=(repository_root or self.root).resolve(),
            repository_alias=repository_alias,
            remote="origin",
            source="explicit",
            pull_request=PullRequestSnapshot(
                repository="example/product",
                number=42,
                url="https://github.com/example/product/pull/42",
                state="OPEN",
                is_draft=True,
                base_branch="main",
                base_sha=self.base_sha,
                head_branch="tb-1234-feature-04-gates",
                head_sha=self.head_sha,
            ),
            merge_base_sha=self.base_sha,
            evaluated_source_sha=self.head_sha,
            feature_base_sha=self.feature_base_sha,
        )

    def test_every_gate_shares_one_pinned_diff_and_fixed_packet_output(self) -> None:
        results = {
            gate: resolve_gate_context(self.workflow, self.context, gate)
            for gate in ARTIFACTS
        }

        for gate, result in results.items():
            self.assertEqual(result["gate"], gate)
            self.assertEqual(result["diffBaseSha"], self.base_sha)
            self.assertEqual(result["diffHeadSha"], self.head_sha)
            self.assertEqual(result["changedFiles"], ["source.py"])
            self.assertEqual(result["packetId"], "pr-42")
            self.assertEqual(
                Path(result["outputPath"]),
                self.workflow.feature_home / "pr-42" / ARTIFACTS[gate],
            )

    def test_feature_final_routes_integrated_and_slice_gates_to_the_right_base(self) -> None:
        integrated = resolve_gate_context(
            self.workflow, self.context, "judge", scope="feature-final"
        )
        focused = resolve_gate_context(
            self.workflow, self.context, "codeReview", scope="feature-final"
        )

        self.assertEqual(integrated["evaluationScope"], "feature")
        self.assertEqual(integrated["diffBaseSha"], self.feature_base_sha)
        self.assertIn(".agentic-workflow.json", integrated["changedFiles"])
        self.assertEqual(focused["evaluationScope"], "slice")
        self.assertEqual(focused["diffBaseSha"], self.base_sha)
        self.assertEqual(focused["changedFiles"], ["source.py"])
        self.assertEqual(focused["featureBaseSha"], self.feature_base_sha)

    def test_cli_emits_the_same_versioned_gate_context(self) -> None:
        context_path = self.root / "pr-context.json"
        context_path.write_text(
            f"{json.dumps(self.context.to_dict(), indent=2)}\n", encoding="utf-8"
        )

        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "boundary_gate.py"),
                "--cwd",
                str(self.root),
                "--context",
                str(context_path),
                "--gate",
                "explainDiff",
                "--json",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        value = json.loads(result.stdout)

        self.assertEqual(value["schemaVersion"], 1)
        self.assertEqual(value["diffHeadSha"], self.head_sha)
        self.assertEqual(value["artifact"], "explain-diff.html")

    def test_pending_gate_artifacts_do_not_change_the_pinned_source(self) -> None:
        (self.root / "pending-report.md").write_text("pending\n", encoding="utf-8")

        result = resolve_gate_context(self.workflow, self.context, "judge")

        self.assertEqual(result["diffHeadSha"], self.head_sha)

    def test_rejects_local_head_or_workflow_identity_drift(self) -> None:
        wrong_alias = self.make_context(repository_alias="other")
        with self.assertRaisesRegex(BoundaryGateError, "repository alias"):
            resolve_gate_context(self.workflow, wrong_alias, "codeReview")

        wrong_root = self.make_context(repository_root=self.root / "nested")
        with self.assertRaisesRegex(BoundaryGateError, "repository root"):
            resolve_gate_context(self.workflow, wrong_root, "codeReview")

        (self.root / "later.py").write_text("later\n", encoding="utf-8")
        self.run_git("add", "later.py")
        self.run_git("commit", "-m", "later")
        with self.assertRaisesRegex(BoundaryGateError, "evaluatedSourceSha"):
            resolve_gate_context(self.workflow, self.context, "codeReview")

    def test_rejects_unknown_gate(self) -> None:
        with self.assertRaisesRegex(BoundaryGateError, "Unknown boundary gate"):
            resolve_gate_context(self.workflow, self.context, "unknown")

    def test_formal_gate_adapters_name_the_shared_context_and_packet_output(self) -> None:
        resources = SCRIPTS.parent
        shared = resources.parent
        adapters = {
            resources / "commands/pattern-review.md": "patternReview",
            resources / "commands/spec-evaluate.md": "specEvaluation",
            resources / "commands/judge.md": "judge",
            resources / "commands/pr-review.md": "codeReview",
            shared / "skills/explain-diff/SKILL.md": "explainDiff",
        }
        for path, gate in adapters.items():
            text = path.read_text(encoding="utf-8")
            self.assertIn("boundary_gate.py", text, path)
            self.assertIn(gate, text, path)
            self.assertIn("outputPath", text, path)

        orchestrator = (resources / "commands/pr-boundary.md").read_text(
            encoding="utf-8"
        )
        for required in (
            "pr_context.py",
            "boundary_gate.py",
            "check-current",
            "finalize",
            "boundary_packet.py",
        ):
            self.assertIn(required, orchestrator)


if __name__ == "__main__":
    unittest.main()
