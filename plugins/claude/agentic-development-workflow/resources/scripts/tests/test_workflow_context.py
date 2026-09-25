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

from workflow_context import (  # noqa: E402
    WorkflowContextError,
    delivery_branch_name,
    resolve_workflow_context,
)


class WorkflowContextTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="workflow context ")
        self.root = Path(self.temporary.name) / "workspace with spaces"
        self.root.mkdir()
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is required")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_config(self, value: object) -> None:
        (self.root / ".agentic-workflow.json").write_text(
            f"{json.dumps(value, indent=2)}\n",
            encoding="utf-8",
        )

    def test_resolves_nearest_single_repository_context(self) -> None:
        nested = self.root / "src/deep"
        nested.mkdir(parents=True)
        self.write_config(
            {
                "schemaVersion": 1,
                "featureId": "tb-1234-important-feature",
                "externalTask": {
                    "id": "1234",
                    "url": "https://tracker.example/tasks/1234",
                },
                "repositories": {
                    "workflow": {
                        "path": ".",
                        "remote": "origin",
                        "integrationBranch": "main",
                        "featureBaseSha": "A" * 40,
                    }
                },
            }
        )

        context = resolve_workflow_context(nested, git_executable=self.git)

        self.assertEqual(context.mode, "configured")
        self.assertEqual(context.workspace_root, self.root.resolve())
        self.assertEqual(context.feature_id, "tb-1234-important-feature")
        self.assertEqual(
            context.feature_home,
            self.root.resolve() / "docs/issues/tb-1234-important-feature",
        )
        self.assertEqual(context.repository.alias, "workflow")
        self.assertEqual(context.repository.path, self.root.resolve())
        self.assertEqual(context.repository.remote, "origin")
        self.assertEqual(context.repository.integration_branch, "main")
        self.assertEqual(context.repository.feature_base_sha, "a" * 40)
        self.assertEqual(context.external_task.id, "1234")

    def test_selects_the_most_specific_repository_or_explicit_alias(self) -> None:
        client = self.root / "client"
        backend = self.root / "services/backend"
        (client / "src").mkdir(parents=True)
        backend.mkdir(parents=True)
        self.write_config(
            {
                "schemaVersion": 1,
                "featureId": "tb-multi-repo-feature",
                "repositories": {
                    "workspace": {"path": ".", "integrationBranch": "main"},
                    "client": {"path": "client", "integrationBranch": "main"},
                    "backend": {
                        "path": "services/backend",
                        "remote": "upstream",
                        "integrationBranch": "development",
                    },
                },
            }
        )

        nested = resolve_workflow_context(client / "src", git_executable=self.git)
        explicit = resolve_workflow_context(
            self.root,
            repository_alias="backend",
            git_executable=self.git,
        )

        self.assertEqual(nested.repository.alias, "client")
        self.assertEqual(explicit.repository.alias, "backend")
        self.assertEqual(explicit.repository.remote, "upstream")
        self.assertTrue(explicit.multi_repository)

    def test_rejects_invalid_or_ambiguous_configuration(self) -> None:
        cases = [
            (
                {"schemaVersion": 2, "featureId": "tb-feature", "repositories": {}},
                "schemaVersion",
            ),
            (
                {
                    "schemaVersion": 1,
                    "featureId": "bad feature",
                    "repositories": {
                        "repo": {"path": ".", "integrationBranch": "main"}
                    },
                },
                "featureId",
            ),
            (
                {
                    "schemaVersion": 1,
                    "featureId": "tb-feature",
                    "repositories": {
                        "repo": {
                            "path": ".." + "/escape",
                            "integrationBranch": "main",
                        }
                    },
                },
                "escapes",
            ),
            (
                {
                    "schemaVersion": 1,
                    "featureId": "tb-feature",
                    "repositories": {
                        "one": {"path": ".", "integrationBranch": "main"},
                        "two": {"path": ".", "integrationBranch": "main"},
                    },
                },
                "same path",
            ),
            (
                {
                    "schemaVersion": 1,
                    "featureId": "tb-feature",
                    "repositories": {
                        "repo": {
                            "path": ".",
                            "integrationBranch": "main",
                            "featureBaseSha": "not-a-commit",
                        }
                    },
                },
                "featureBaseSha",
            ),
        ]

        for value, message in cases:
            with self.subTest(message=message):
                self.write_config(value)
                with self.assertRaisesRegex(WorkflowContextError, message):
                    resolve_workflow_context(self.root, git_executable=self.git)

        (self.root / ".agentic-workflow.json").write_text("{not json", encoding="utf-8")
        with self.assertRaisesRegex(WorkflowContextError, "Cannot read JSON"):
            resolve_workflow_context(self.root, git_executable=self.git)

    def test_requires_a_selector_when_cwd_is_outside_configured_repositories(self) -> None:
        repository = self.root / "repo"
        other_repository = self.root / "other"
        repository.mkdir()
        other_repository.mkdir()
        self.write_config(
            {
                "schemaVersion": 1,
                "featureId": "tb-feature",
                "repositories": {
                    "repo": {"path": "repo", "integrationBranch": "main"},
                    "other": {"path": "other", "integrationBranch": "main"},
                },
            }
        )

        with self.assertRaisesRegex(WorkflowContextError, "does not identify"):
            resolve_workflow_context(self.root, git_executable=self.git)

        selected = resolve_workflow_context(
            self.root,
            repository_alias="repo",
            git_executable=self.git,
        )
        self.assertEqual(selected.repository.alias, "repo")

    def test_falls_back_to_the_current_branch_without_configuration(self) -> None:
        repository = self.root / "legacy repository"
        repository.mkdir()
        subprocess.run([self.git, "-C", str(repository), "init"], check=True, capture_output=True)
        subprocess.run(
            [self.git, "-C", str(repository), "checkout", "-b", "tb-legacy-feature"],
            check=True,
            capture_output=True,
        )
        nested = repository / "src"
        nested.mkdir()

        context = resolve_workflow_context(nested, git_executable=self.git)

        self.assertEqual(context.mode, "legacy")
        self.assertEqual(context.feature_id, "tb-legacy-feature")
        self.assertEqual(context.workspace_root, repository.resolve())
        self.assertEqual(
            context.feature_home,
            repository.resolve() / "docs/issues/tb-legacy-feature",
        )
        self.assertEqual(context.repository.path, repository.resolve())
        self.assertFalse(context.multi_repository)

    def test_legacy_mode_preserves_branch_prefixes_containing_slashes(self) -> None:
        repository = self.root / "legacy slash repository"
        repository.mkdir()
        subprocess.run([self.git, "-C", str(repository), "init"], check=True, capture_output=True)
        subprocess.run(
            [self.git, "-C", str(repository), "checkout", "-b", "developer/feature"],
            check=True,
            capture_output=True,
        )

        context = resolve_workflow_context(repository, git_executable=self.git)

        self.assertEqual(context.feature_id, "developer/feature")
        self.assertEqual(
            context.feature_home,
            repository.resolve() / "docs/issues/developer/feature",
        )

    def test_builds_and_validates_sequential_delivery_branch_names(self) -> None:
        self.assertEqual(
            delivery_branch_name("tb-1234-important-feature", 2, "application-shell"),
            "tb-1234-important-feature-02-application-shell",
        )
        with self.assertRaisesRegex(WorkflowContextError, "ordinal"):
            delivery_branch_name("tb-feature", 0, "slice")
        with self.assertRaisesRegex(WorkflowContextError, "description"):
            delivery_branch_name("tb-feature", 2, "bad description")

        self.assertEqual(
            delivery_branch_name("developer/1234-feature", 3, "api"),
            "developer/1234-feature-03-api",
        )


if __name__ == "__main__":
    unittest.main()
