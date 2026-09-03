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

from boundary_packet import (  # noqa: E402
    ARTIFACTS,
    BoundaryPacketError,
    packet_name,
    packet_path,
    validate_packet,
)
from pr_context import PullRequestContext, PullRequestSnapshot  # noqa: E402
from workflow_context import resolve_workflow_context  # noqa: E402


BASE_SHA = "1" * 40
HEAD_SHA = "2" * 40
NEXT_HEAD_SHA = "3" * 40
FEATURE_BASE_SHA = "4" * 40


class BoundaryPacketTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="boundary packet ")
        self.root = Path(self.temporary.name) / "workspace with spaces"
        self.root.mkdir()
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is required")
        self.write_config(
            {
                "schemaVersion": 1,
                "featureId": "tb-1234-feature",
                "repositories": {
                    "product": {
                        "path": ".",
                        "remote": "origin",
                        "integrationBranch": "main",
                    }
                },
            }
        )
        self.workflow = resolve_workflow_context(self.root)
        self.context = self.make_context()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_config(self, value: object) -> None:
        (self.root / ".agentic-workflow.json").write_text(
            f"{json.dumps(value, indent=2)}\n",
            encoding="utf-8",
        )

    def run_git(self, *args: str) -> str:
        result = subprocess.run(
            [self.git, "-C", str(self.root), *args],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def initialize_git(self) -> None:
        self.run_git("init", "-b", "main")
        self.run_git("config", "user.name", "Boundary Packet Test")
        self.run_git("config", "user.email", "boundary@example.test")
        self.run_git("config", "commit.gpgsign", "false")
        self.run_git("config", "core.hooksPath", ".git/disabled-hooks")

    def make_context(
        self,
        *,
        repository_root: Path | None = None,
        repository_alias: str = "product",
        number: int = 42,
        head_sha: str = HEAD_SHA,
        feature_base_sha: str | None = None,
    ) -> PullRequestContext:
        snapshot = PullRequestSnapshot(
            repository="example/product",
            number=number,
            url=f"https://github.com/example/product/pull/{number}",
            state="OPEN",
            is_draft=True,
            base_branch="main",
            base_sha=BASE_SHA,
            head_branch="tb-1234-feature-03-packets",
            head_sha=head_sha,
        )
        return PullRequestContext(
            repository_root=(repository_root or self.root).resolve(),
            repository_alias=repository_alias,
            remote="origin",
            source="explicit",
            pull_request=snapshot,
            merge_base_sha=BASE_SHA,
            evaluated_source_sha=head_sha,
            feature_base_sha=feature_base_sha,
        )

    def gate(self, disposition: str, reason: str | None = None) -> dict[str, object]:
        return {"disposition": disposition, "reason": reason}

    def manifest(
        self,
        context: PullRequestContext | None = None,
        *,
        scope: str = "slice",
        feature_base_sha: str | None = None,
        applicability: dict[str, bool] | None = None,
    ) -> dict[str, object]:
        active = context or self.context
        applicable = applicability or {
            "specEvaluation": True,
            "judge": True,
            "patternReview": False,
        }
        return {
            "schemaVersion": 1,
            "scope": scope,
            "featureId": self.workflow.feature_id,
            "repositoryAlias": active.repository_alias,
            "packetId": packet_name(self.workflow, active.pull_request.number),
            "pullRequest": active.pull_request.to_dict(),
            "mergeBaseSha": active.merge_base_sha,
            "evaluatedSourceSha": active.evaluated_source_sha,
            "featureBaseSha": feature_base_sha,
            "applicability": applicable,
            "gates": {
                "verification": self.gate("passed"),
                "specEvaluation": self.gate(
                    "passed" if applicable["specEvaluation"] else "not_applicable",
                    None if applicable["specEvaluation"] else "Work is not specced",
                ),
                "judge": self.gate(
                    "passed" if applicable["judge"] else "not_applicable",
                    None if applicable["judge"] else "Judge is not required",
                ),
                "codeReview": self.gate("passed"),
                "patternReview": self.gate(
                    "passed" if applicable["patternReview"] else "not_applicable",
                    None
                    if applicable["patternReview"]
                    else "No pattern-review scope is configured",
                ),
                "explainDiff": self.gate("passed"),
            },
        }

    def write_packet(
        self,
        context: PullRequestContext | None = None,
        *,
        manifest: dict[str, object] | None = None,
    ) -> Path:
        active = context or self.context
        packet = packet_path(self.workflow, active.pull_request.number)
        packet.mkdir(parents=True, exist_ok=True)
        value = manifest or self.manifest(active)
        (packet / "boundary.json").write_text(
            f"{json.dumps(value, indent=2)}\n", encoding="utf-8"
        )
        for gate, artifact in ARTIFACTS.items():
            disposition = value["gates"][gate]["disposition"]
            if gate in {"verification", "codeReview", "explainDiff"} or disposition != "not_applicable":
                (packet / artifact).write_text(f"{gate} evidence\n", encoding="utf-8")
        self.write_tracker(active.pull_request.number, packet.name)
        return packet

    def write_tracker(self, number: int, packet_id: str, *, link: bool = True) -> None:
        self.workflow.feature_home.mkdir(parents=True, exist_ok=True)
        packet_line = f"- **Evidence packet:** [packet]({packet_id}/)\n" if link else ""
        (self.workflow.feature_home / "tracker.md").write_text(
            "# Tracker\n\n## PR Log\n\n"
            f"### PR #{number} - packet test\n\n"
            f"- **PR:** #{number}\n"
            f"{packet_line}",
            encoding="utf-8",
        )

    def validate(
        self,
        context: PullRequestContext | None = None,
        changed_paths: list[str] | None = None,
    ) -> dict[str, object]:
        active = context or self.context
        paths = changed_paths if changed_paths is not None else [
            f"{packet_name(self.workflow, active.pull_request.number)}/boundary.json"
        ]
        return validate_packet(self.workflow, active, changed_paths=paths)

    def test_validates_single_repository_packet_directly_under_feature_home(self) -> None:
        packet = self.write_packet()

        result = self.validate()

        self.assertEqual(packet.name, "pr-42")
        self.assertEqual(packet.parent, self.workflow.feature_home)
        self.assertEqual(result["status"], "valid")
        self.assertEqual(result["packetId"], "pr-42")
        self.assertEqual(result["changeSource"], "explicit")

    def test_multi_repository_names_and_centralizes_packets(self) -> None:
        api = self.root / "api"
        client = self.root / "client"
        api.mkdir()
        client.mkdir()
        self.write_config(
            {
                "schemaVersion": 1,
                "featureId": "tb-1234-feature",
                "repositories": {
                    "api": {"path": "api", "integrationBranch": "main"},
                    "client": {"path": "client", "integrationBranch": "main"},
                },
            }
        )
        self.workflow = resolve_workflow_context(api)
        self.context = self.make_context(repository_root=api, repository_alias="api")
        packet = self.write_packet()

        self.assertEqual(packet.name, "pr-api-42")
        self.assertEqual(
            packet.parent,
            self.root.resolve() / "docs/issues/tb-1234-feature",
        )
        self.assertEqual(self.validate()["packetId"], "pr-api-42")

        duplicate = api / "docs/issues/tb-1234-feature/pr-api-42"
        duplicate.mkdir(parents=True)
        with self.assertRaisesRegex(BoundaryPacketError, "centralized ownership"):
            self.validate()

    def test_requires_core_and_applicable_conditional_artifacts(self) -> None:
        packet = self.write_packet()
        (packet / "code-review.md").unlink()
        with self.assertRaisesRegex(BoundaryPacketError, "requires nonempty"):
            self.validate()

        packet = self.write_packet()
        (packet / "spec-evaluation.md").unlink()
        with self.assertRaisesRegex(BoundaryPacketError, "specEvaluation requires"):
            self.validate()

    def test_requires_explicit_consistent_dispositions(self) -> None:
        value = self.manifest()
        value["gates"]["patternReview"] = self.gate("passed")
        self.write_packet(manifest=value)
        with self.assertRaisesRegex(BoundaryPacketError, "Inapplicable gate"):
            self.validate()

        value = self.manifest()
        value["gates"]["judge"] = self.gate("waived")
        self.write_packet(manifest=value)
        with self.assertRaisesRegex(BoundaryPacketError, "reason is required"):
            self.validate()

        value = self.manifest()
        value["gates"]["verification"] = self.gate(
            "not_applicable", "No verification"
        )
        self.write_packet(manifest=value)
        with self.assertRaisesRegex(BoundaryPacketError, "Core gate"):
            self.validate()

    def test_rejects_unknown_fields_and_unexpected_packet_files(self) -> None:
        value = self.manifest()
        value["evidenceCommitSha"] = NEXT_HEAD_SHA
        self.write_packet(manifest=value)
        with self.assertRaisesRegex(BoundaryPacketError, "unexpected evidenceCommitSha"):
            self.validate()

        packet = self.write_packet()
        (packet / "latest.md").write_text("mutable pointer\n", encoding="utf-8")
        with self.assertRaisesRegex(BoundaryPacketError, "Packet files differ"):
            self.validate()

    def test_same_pr_rerun_updates_current_packet(self) -> None:
        self.write_packet()
        next_context = self.make_context(head_sha=NEXT_HEAD_SHA)
        self.write_packet(next_context, manifest=self.manifest(next_context))

        result = self.validate(
            next_context,
            changed_paths=["pr-42/boundary.json", "pr-42/verification.md"],
        )

        self.assertEqual(result["evaluatedSourceSha"], NEXT_HEAD_SHA)

    def test_later_pr_cannot_change_an_earlier_packet(self) -> None:
        self.write_packet()
        with self.assertRaisesRegex(BoundaryPacketError, "earlier or foreign packet"):
            self.validate(
                changed_paths=["pr-41/verification.md", "pr-42/boundary.json"]
            )

    def test_requires_matching_identity_context_and_tracker_link(self) -> None:
        value = self.manifest()
        value["featureId"] = "tb-other-feature"
        self.write_packet(manifest=value)
        with self.assertRaisesRegex(BoundaryPacketError, "featureId differs"):
            self.validate()

        self.write_packet()
        self.write_tracker(42, "pr-42", link=False)
        with self.assertRaisesRegex(BoundaryPacketError, "does not link packet"):
            self.validate()

    def test_feature_final_requires_original_feature_base(self) -> None:
        value = self.manifest(scope="feature-final")
        self.write_packet(manifest=value)
        with self.assertRaisesRegex(BoundaryPacketError, "featureBaseSha"):
            self.validate()

        self.write_config(
            {
                "schemaVersion": 1,
                "featureId": "tb-1234-feature",
                "repositories": {
                    "product": {
                        "path": ".",
                        "remote": "origin",
                        "integrationBranch": "main",
                        "featureBaseSha": FEATURE_BASE_SHA,
                    }
                },
            }
        )
        self.workflow = resolve_workflow_context(self.root)
        self.context = self.make_context(feature_base_sha=FEATURE_BASE_SHA)
        value = self.manifest(
            scope="feature-final", feature_base_sha=FEATURE_BASE_SHA
        )
        self.write_packet(manifest=value)
        self.assertEqual(self.validate()["scope"], "feature-final")

    def test_rejects_unsafe_explicit_changed_paths(self) -> None:
        self.write_packet()
        with self.assertRaisesRegex(BoundaryPacketError, "safe"):
            self.validate(changed_paths=[".." + "/pr-41/verification.md"])

    def test_derives_changes_from_clean_evidence_repository(self) -> None:
        self.initialize_git()
        self.workflow.feature_home.mkdir(parents=True, exist_ok=True)
        self.write_tracker(42, "pr-42")
        self.run_git("add", ".agentic-workflow.json", "docs")
        self.run_git("commit", "-m", "base")
        base_sha = self.run_git("rev-parse", "HEAD")
        self.run_git("switch", "-c", "tb-1234-feature-03-packets")
        (self.root / "source.py").write_text("print('source')\n", encoding="utf-8")
        self.run_git("add", "source.py")
        self.run_git("commit", "-m", "source")
        source_sha = self.run_git("rev-parse", "HEAD")
        snapshot = PullRequestSnapshot(
            repository="example/product",
            number=42,
            url="https://github.com/example/product/pull/42",
            state="OPEN",
            is_draft=True,
            base_branch="main",
            base_sha=base_sha,
            head_branch="tb-1234-feature-03-packets",
            head_sha=source_sha,
        )
        self.context = PullRequestContext(
            repository_root=self.root.resolve(),
            repository_alias="product",
            remote="origin",
            source="explicit",
            pull_request=snapshot,
            merge_base_sha=base_sha,
            evaluated_source_sha=source_sha,
        )
        self.write_packet(self.context, manifest=self.manifest(self.context))
        self.run_git("add", "docs")
        self.run_git("commit", "-m", "evidence")

        result = validate_packet(self.workflow, self.context)

        self.assertEqual(result["changeSource"], "git")
        self.assertIn("pr-42/boundary.json", result["changedFeaturePaths"])

        (packet_path(self.workflow, 42) / "verification.md").write_text(
            "dirty evidence\n", encoding="utf-8"
        )
        with self.assertRaisesRegex(BoundaryPacketError, "must be clean"):
            validate_packet(self.workflow, self.context)


if __name__ == "__main__":
    unittest.main()
