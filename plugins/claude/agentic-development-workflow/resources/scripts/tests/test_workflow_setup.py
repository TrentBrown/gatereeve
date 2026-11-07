from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from workflow_common import WorkflowConfigurationError, read_configuration  # noqa: E402
from workflow_setup import configure  # noqa: E402


class WorkflowSetupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="workflow setup ")
        self.root = Path(self.temporary.name)
        self.plugin_root = self.root / "plugin with spaces"
        profiles = self.plugin_root / "resources/policy/profiles"
        profiles.mkdir(parents=True)
        (profiles / "portable-core.md").write_text("portable\n", encoding="utf-8")
        (profiles / "quality-code.md").write_text("quality\n", encoding="utf-8")
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is required")
        self.environment = os.environ.copy()
        self.environment["GIT_CONFIG_GLOBAL"] = str(self.root / "global.gitconfig")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_records_global_profile_and_developer_prefix(self) -> None:
        result = configure(
            plugin_root=self.plugin_root,
            profile="quality-code",
            branch_prefix="dev-",
            scope="global",
            repository=None,
            git_executable=self.git,
            environment=self.environment,
        )
        values = read_configuration(
            git_executable=self.git,
            environment=self.environment,
        )
        self.assertEqual(result["scope"], "global")
        self.assertEqual(values, {"profile": "quality-code", "branchPrefix": "dev-"})

    def test_repository_config_overrides_global_values(self) -> None:
        repository = self.root / "repository"
        repository.mkdir()
        subprocess.run([self.git, "-C", str(repository), "init"], check=True, capture_output=True)
        configure(
            plugin_root=self.plugin_root,
            profile="quality-code",
            branch_prefix="global-",
            scope="global",
            repository=None,
            git_executable=self.git,
            environment=self.environment,
        )
        configure(
            plugin_root=self.plugin_root,
            profile="portable-core",
            branch_prefix="local/",
            scope="local",
            repository=repository,
            git_executable=self.git,
            environment=self.environment,
        )
        values = read_configuration(
            git_executable=self.git,
            repository=repository,
            environment=self.environment,
        )
        self.assertEqual(values, {"profile": "portable-core", "branchPrefix": "local/"})

    def test_rejects_unknown_profile_and_invalid_prefix(self) -> None:
        with self.assertRaisesRegex(WorkflowConfigurationError, "Unknown workflow profile"):
            configure(
                plugin_root=self.plugin_root,
                profile="maintainer-personal",
                branch_prefix="dev-",
                scope="global",
                repository=None,
                git_executable=self.git,
                environment=self.environment,
            )
        with self.assertRaisesRegex(WorkflowConfigurationError, "whitespace"):
            configure(
                plugin_root=self.plugin_root,
                profile="portable-core",
                branch_prefix="bad prefix",
                scope="global",
                repository=None,
                git_executable=self.git,
                environment=self.environment,
            )
        with self.assertRaisesRegex(WorkflowConfigurationError, "only with --scope local"):
            configure(
                plugin_root=self.plugin_root,
                profile="portable-core",
                branch_prefix="dev-",
                scope="global",
                repository=self.root,
                git_executable=self.git,
                environment=self.environment,
            )


if __name__ == "__main__":
    unittest.main()
