from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from boundary_gate import resolve_gate_context  # noqa: E402
from boundary_packet import ARTIFACTS, packet_path, validate_packet  # noqa: E402
from feature_final import feature_home_retention, resolve_feature_final_context  # noqa: E402
from pr_context import (  # noqa: E402
    ExplicitPullRequestProvider,
    PullRequestContext,
    PullRequestContextError,
    finalize_pull_request_context,
    resolve_pull_request_context,
    verify_context_is_current,
)
from workflow_context import (  # noqa: E402
    WorkflowContext,
    delivery_branch_name,
    resolve_workflow_context,
)


class SequentialWorkflowAcceptanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="workflow acceptance ")
        self.workspace = Path(self.temporary.name) / "workspace with spaces"
        self.workspace.mkdir()
        self.git_executable = shutil.which("git")
        if self.git_executable is None:
            self.skipTest("Git is required")
        self.environment = os.environ.copy()
        self.environment["PYTHONDONTWRITEBYTECODE"] = "1"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def git(self, repository: Path, *args: str) -> str:
        result = subprocess.run(
            [self.git_executable, "-C", str(repository), *args],
            check=True,
            capture_output=True,
            text=True,
            env=self.environment,
        )
        return result.stdout.strip()

    def initialize_repository(self, repository: Path, name: str) -> str:
        repository.mkdir(parents=True, exist_ok=True)
        self.git(repository, "init", "-b", "main")
        self.git(repository, "config", "user.name", "Workflow Acceptance")
        self.git(repository, "config", "user.email", "workflow@example.test")
        self.git(repository, "config", "commit.gpgsign", "false")
        self.git(repository, "config", "core.hooksPath", ".git/disabled-hooks")
        self.git(
            repository,
            "remote",
            "add",
            "origin",
            f"https://github.com/example/{name}.git",
        )
        self.write(repository / "README.md", f"# {name}\n")
        self.git(repository, "add", "README.md")
        self.git(repository, "commit", "-m", "base")
        return self.git(repository, "rev-parse", "HEAD")

    def write(self, path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def write_config(
        self,
        *,
        feature_id: str,
        repositories: dict[str, dict[str, object]],
    ) -> None:
        self.write(
            self.workspace / ".agentic-workflow.json",
            f"{json.dumps({'schemaVersion': 1, 'featureId': feature_id, 'repositories': repositories}, indent=2)}\n",
        )

    def ignore_workspace_config(self, repository: Path) -> None:
        exclude = repository / ".git/info/exclude"
        existing = exclude.read_text(encoding="utf-8") if exclude.exists() else ""
        exclude.write_text(f"{existing.rstrip()}\n.agentic-workflow.json\n", encoding="utf-8")

    def commit_all(self, repository: Path, message: str) -> str:
        self.git(repository, "add", "-A")
        self.git(repository, "commit", "-m", message)
        return self.git(repository, "rev-parse", "HEAD")

    def bootstrap(self, root: Path) -> None:
        subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "bootstrap_branch_docs.py"),
                "--root",
                str(root),
            ],
            check=True,
            capture_output=True,
            text=True,
            env=self.environment,
        )

    def payload(
        self,
        *,
        repository: str,
        number: int,
        base_sha: str,
        head_branch: str,
        head_sha: str,
    ) -> dict[str, object]:
        return {
            "repository": f"example/{repository}",
            "number": number,
            "url": f"https://github.com/example/{repository}/pull/{number}",
            "state": "OPEN",
            "isDraft": True,
            "baseRefName": "main",
            "baseRefOid": base_sha,
            "headRefName": head_branch,
            "headRefOid": head_sha,
        }

    def resolve_pr(
        self,
        workflow: WorkflowContext,
        payload: dict[str, object],
    ) -> PullRequestContext:
        return resolve_pull_request_context(
            workflow.repository,
            ExplicitPullRequestProvider(payload),
            git_executable=self.git_executable,
            environment=self.environment,
        )

    def write_tracker(
        self,
        workflow: WorkflowContext,
        entries: list[tuple[int, str]],
    ) -> None:
        lines = ["# Tracker", "", "## PR Log", ""]
        for number, packet_id in entries:
            lines.extend(
                [
                    f"### PR #{number} - acceptance slice",
                    "",
                    f"- **PR:** #{number}",
                    f"- **Evidence packet:** [packet]({packet_id}/)",
                    "",
                ]
            )
        self.write(workflow.feature_home / "tracker.md", "\n".join(lines))

    def manifest(
        self,
        workflow: WorkflowContext,
        context: PullRequestContext,
        *,
        scope: str = "slice",
    ) -> dict[str, object]:
        feature_base = context.feature_base_sha if scope == "feature-final" else None
        applicability = {
            "specEvaluation": True,
            "judge": True,
            "patternReview": False,
        }
        gates: dict[str, dict[str, str | None]] = {}
        for gate in ARTIFACTS:
            if gate == "patternReview":
                gates[gate] = {
                    "disposition": "not_applicable",
                    "reason": "No pattern-review scope is configured",
                }
            else:
                gates[gate] = {"disposition": "passed", "reason": None}
        packet = packet_path(workflow, context.pull_request.number)
        return {
            "schemaVersion": 1,
            "scope": scope,
            "featureId": workflow.feature_id,
            "repositoryAlias": context.repository_alias,
            "packetId": packet.name,
            "pullRequest": context.pull_request.to_dict(),
            "mergeBaseSha": context.merge_base_sha,
            "evaluatedSourceSha": context.evaluated_source_sha,
            "featureBaseSha": feature_base,
            "applicability": applicability,
            "gates": gates,
        }

    def write_packet(
        self,
        workflow: WorkflowContext,
        context: PullRequestContext,
        *,
        scope: str = "slice",
    ) -> Path:
        packet = packet_path(workflow, context.pull_request.number)
        packet.mkdir(parents=True, exist_ok=True)
        value = self.manifest(workflow, context, scope=scope)
        self.write(packet / "boundary.json", f"{json.dumps(value, indent=2)}\n")
        for gate, artifact in ARTIFACTS.items():
            if gate != "patternReview":
                self.write(packet / artifact, f"{gate} acceptance evidence\n")
        return packet

    def test_configured_sequential_delivery_reaches_feature_final(self) -> None:
        repository = self.workspace
        feature_id = "tb-1234-composed-workflow"
        original_base = self.initialize_repository(repository, "product")
        self.ignore_workspace_config(repository)
        self.write_config(
            feature_id=feature_id,
            repositories={
                "product": {
                    "path": ".",
                    "remote": "origin",
                    "integrationBranch": "main",
                    "featureBaseSha": original_base,
                }
            },
        )

        first_branch = delivery_branch_name(feature_id, 1, "foundation")
        self.git(repository, "switch", "-c", first_branch)
        self.bootstrap(repository)
        self.write(repository / "src/first.py", "FIRST = True\n")
        first_source = self.commit_all(repository, "first source slice")
        first_workflow = resolve_workflow_context(repository)
        first_context = self.resolve_pr(
            first_workflow,
            self.payload(
                repository="product",
                number=101,
                base_sha=original_base,
                head_branch=first_branch,
                head_sha=first_source,
            ),
        )
        first_packet = self.write_packet(first_workflow, first_context)
        self.write_tracker(first_workflow, [(101, first_packet.name)])
        self.assertEqual(
            validate_packet(
                first_workflow,
                first_context,
                changed_paths=["tracker.md", f"{first_packet.name}/boundary.json"],
            )["status"],
            "valid",
        )
        first_evidence = self.commit_all(repository, "first boundary evidence")
        first_final = finalize_pull_request_context(
            first_context,
            ExplicitPullRequestProvider(
                self.payload(
                    repository="product",
                    number=101,
                    base_sha=original_base,
                    head_branch=first_branch,
                    head_sha=first_evidence,
                )
            ),
            evidence_paths=[f"docs/issues/{feature_id}"],
            git_executable=self.git_executable,
            environment=self.environment,
        )
        self.assertEqual(first_final["finalHeadSha"], first_evidence)

        self.git(repository, "switch", "main")
        self.git(repository, "merge", "--ff-only", first_branch)
        second_base = self.git(repository, "rev-parse", "HEAD")
        second_branch = delivery_branch_name(feature_id, 2, "feature-final")
        self.git(repository, "switch", "-c", second_branch)
        self.bootstrap(repository)
        self.write(repository / "src/second.py", "SECOND = True\n")
        second_source = self.commit_all(repository, "final source slice")
        second_workflow = resolve_workflow_context(repository)
        second_payload = self.payload(
            repository="product",
            number=102,
            base_sha=second_base,
            head_branch=second_branch,
            head_sha=second_source,
        )
        second_context = self.resolve_pr(second_workflow, second_payload)

        feature_final = resolve_feature_final_context(second_workflow, second_context)
        self.assertIn("src/first.py", feature_final["featureChangedFiles"])
        self.assertIn("src/second.py", feature_final["featureChangedFiles"])
        self.assertNotIn("src/first.py", feature_final["sliceChangedFiles"])
        self.assertEqual(feature_final["retention"]["status"], "tracked")

        gate_results = {
            gate: resolve_gate_context(
                second_workflow,
                second_context,
                gate,
                scope="feature-final",
            )
            for gate in ARTIFACTS
        }
        for gate in ("verification", "specEvaluation", "judge"):
            self.assertEqual(gate_results[gate]["diffBaseSha"], original_base)
            self.assertEqual(gate_results[gate]["evaluationScope"], "feature")
        for gate in ("codeReview", "patternReview", "explainDiff"):
            self.assertEqual(gate_results[gate]["diffBaseSha"], second_base)
            self.assertEqual(gate_results[gate]["evaluationScope"], "slice")

        second_packet = self.write_packet(
            second_workflow,
            second_context,
            scope="feature-final",
        )
        self.write_tracker(
            second_workflow,
            [(101, first_packet.name), (102, second_packet.name)],
        )
        self.assertEqual(
            validate_packet(
                second_workflow,
                second_context,
                changed_paths=["tracker.md", f"{second_packet.name}/boundary.json"],
            )["status"],
            "valid",
        )

        second_evidence = self.commit_all(repository, "final boundary evidence")
        stale_provider = ExplicitPullRequestProvider(
            {**second_payload, "headRefOid": second_evidence}
        )
        with self.assertRaisesRegex(PullRequestContextError, "became stale"):
            verify_context_is_current(
                second_context,
                stale_provider,
                git_executable=self.git_executable,
                environment=self.environment,
            )
        finalized = finalize_pull_request_context(
            second_context,
            stale_provider,
            evidence_paths=[f"docs/issues/{feature_id}"],
            git_executable=self.git_executable,
            environment=self.environment,
        )
        self.assertEqual(finalized["finalHeadSha"], second_evidence)
        self.assertEqual(
            validate_packet(second_workflow, second_context)["changeSource"],
            "git",
        )

    def test_multi_repository_evidence_stays_in_one_workspace_home(self) -> None:
        feature_id = "tb-5678-multi-repository"
        api = self.workspace / "api"
        client = self.workspace / "client"
        api_base = self.initialize_repository(api, "api")
        client_base = self.initialize_repository(client, "client")
        self.write_config(
            feature_id=feature_id,
            repositories={
                "api": {
                    "path": "api",
                    "remote": "origin",
                    "integrationBranch": "main",
                    "featureBaseSha": api_base,
                },
                "client": {
                    "path": "client",
                    "remote": "origin",
                    "integrationBranch": "main",
                    "featureBaseSha": client_base,
                },
            },
        )

        contexts: list[tuple[WorkflowContext, PullRequestContext, Path]] = []
        for alias, repository, number, description in (
            ("api", api, 201, "api-slice"),
            ("client", client, 202, "client-slice"),
        ):
            base = api_base if alias == "api" else client_base
            branch = delivery_branch_name(feature_id, number - 200, description)
            self.git(repository, "switch", "-c", branch)
            self.write(repository / "src/change.txt", f"{alias}\n")
            head = self.commit_all(repository, f"{alias} source")
            workflow = resolve_workflow_context(repository)
            context = self.resolve_pr(
                workflow,
                self.payload(
                    repository=alias,
                    number=number,
                    base_sha=base,
                    head_branch=branch,
                    head_sha=head,
                ),
            )
            packet = self.write_packet(workflow, context)
            contexts.append((workflow, context, packet))

        feature_home = (self.workspace / "docs/issues" / feature_id).resolve()
        self.write_tracker(
            contexts[0][0],
            [(201, contexts[0][2].name), (202, contexts[1][2].name)],
        )
        for workflow, context, packet in contexts:
            self.assertEqual(packet.parent, feature_home)
            self.assertTrue(packet.name.startswith(f"pr-{context.repository_alias}-"))
            self.assertEqual(
                resolve_gate_context(workflow, context, "codeReview")["packetPath"],
                str(packet),
            )
            self.assertEqual(
                validate_packet(
                    workflow,
                    context,
                    changed_paths=["tracker.md", f"{packet.name}/boundary.json"],
                )["status"],
                "valid",
            )
            self.assertFalse((workflow.repository.path / "docs/issues" / feature_id).exists())

        retention = feature_home_retention(feature_home)
        self.assertEqual(retention["status"], "untracked")
        self.assertTrue(retention["retentionDecisionRequired"])

    def test_legacy_single_pr_remains_operable_without_configuration(self) -> None:
        repository = self.workspace / "legacy repository"
        base = self.initialize_repository(repository, "legacy")
        branch = "tb-legacy-single-pr"
        self.git(repository, "switch", "-c", branch)
        self.bootstrap(repository)
        self.write(repository / "src/legacy.py", "LEGACY = True\n")
        head = self.commit_all(repository, "legacy source")
        workflow = resolve_workflow_context(repository / "src")
        self.assertEqual(workflow.mode, "legacy")
        self.assertEqual(workflow.feature_id, branch)
        context = self.resolve_pr(
            workflow,
            self.payload(
                repository="legacy",
                number=301,
                base_sha=base,
                head_branch=branch,
                head_sha=head,
            ),
        )

        gate = resolve_gate_context(workflow, context, "verification")
        self.assertEqual(gate["scope"], "slice")
        self.assertEqual(gate["packetId"], "pr-301")
        feature_final = resolve_feature_final_context(workflow, context)
        self.assertEqual(feature_final["featureBaseSha"], context.merge_base_sha)

        packet = self.write_packet(workflow, context)
        self.write_tracker(workflow, [(301, packet.name)])
        result = validate_packet(
            workflow,
            context,
            changed_paths=["tracker.md", f"{packet.name}/boundary.json"],
        )
        self.assertEqual(result["status"], "valid")
        self.assertEqual(packet.parent, (repository / "docs/issues" / branch).resolve())


if __name__ == "__main__":
    unittest.main()
