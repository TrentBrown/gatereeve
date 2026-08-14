from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from workflow_doctor import REQUIRED_SKILLS, run_doctor  # noqa: E402
from workflow_setup import configure  # noqa: E402


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class WorkflowDoctorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="workflow doctor ")
        self.root = Path(self.temporary.name)
        self.plugin_root = self.root / "plugin with spaces"
        self.home = self.root / "home"
        self.home.mkdir()
        self.git = shutil.which("git")
        if self.git is None:
            self.skipTest("Git is required")
        self.environment = os.environ.copy()
        self.environment["GIT_CONFIG_GLOBAL"] = str(self.root / "global.gitconfig")
        self._build_package()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _build_package(self) -> None:
        shared_files = {
            "resources/policy/profiles/portable-core.md": "portable\n",
            "resources/policy/profiles/quality-code.md": "quality\n",
            "resources/scripts/workflow_doctor.py": "doctor script\n",
        }
        for name in REQUIRED_SKILLS:
            shared_files[f"skills/{name}/SKILL.md"] = f"{name}\n"
        entries = []
        for relative_path, content in shared_files.items():
            target = self.plugin_root / relative_path
            write(target, content)
            entries.append(
                {
                    "path": relative_path,
                    "type": "file",
                    "size": target.stat().st_size,
                    "sha256": sha256(target),
                }
            )
        write(
            self.plugin_root / ".workflow-build/shared-files.json",
            json.dumps({"schemaVersion": 1, "files": entries}),
        )
        write(
            self.plugin_root / ".workflow-build/provenance.json",
            '{"schemaVersion":1}\n',
        )
        write(self.plugin_root / ".codex-plugin/plugin.json", '{"name":"agentic-development-workflow"}\n')
        write(
            self.plugin_root / "hooks/hooks.json",
            json.dumps(
                {
                    "hooks": {
                        "SessionStart": [
                            {"hooks": [{"type": "command", "command": "python3 session_start.py"}]}
                        ]
                    }
                }
            ),
        )

    def _lookup(self, name: str) -> str | None:
        if name == "git":
            return self.git
        if name in {"python3", "gh", "codex"}:
            return f"/fixture/{name}"
        return None

    def _configure(self) -> None:
        configure(
            plugin_root=self.plugin_root,
            profile="quality-code",
            branch_prefix="dev-",
            scope="global",
            repository=None,
            git_executable=self.git,
            environment=self.environment,
        )

    def _run(self, *, activation_observed: bool = True) -> dict[str, object]:
        return run_doctor(
            plugin_root=self.plugin_root,
            home=self.home,
            repository=None,
            activation_observed=activation_observed,
            environment=self.environment,
            executable_lookup=self._lookup,
            gh_auth_check=lambda executable, environment: True,
        )

    @staticmethod
    def _failed_ids(result: dict[str, object]) -> set[str]:
        return {
            item["id"]
            for item in result["checks"]
            if item["status"] == "fail"
        }

    def test_ready_package_passes_and_optional_integrations_do_not_block(self) -> None:
        self._configure()
        result = self._run()
        self.assertTrue(result["ready"])
        optional = next(item for item in result["checks"] if item["id"] == "optional-integrations")
        self.assertEqual(optional["status"], "info")

    def test_missing_configuration_fails_with_actionable_checks(self) -> None:
        result = self._run()
        self.assertFalse(result["ready"])
        self.assertTrue({"profile", "branch-prefix"}.issubset(self._failed_ids(result)))

    def test_unobserved_or_disabled_activation_fails(self) -> None:
        self._configure()
        unobserved = self._run(activation_observed=False)
        self.assertIn("activation-observed", self._failed_ids(unobserved))

        codex_home = self.home / ".codex"
        write(codex_home / "config.toml", "[features]\nhooks = false\n")
        disabled = self._run()
        self.assertIn("codex-hook-feature", self._failed_ids(disabled))

        write(codex_home / "config.toml", "allow_managed_hooks_only = true\n")
        managed_only = self._run()
        self.assertIn("codex-hook-feature", self._failed_ids(managed_only))

    def test_missing_or_changed_resource_fails_integrity(self) -> None:
        self._configure()
        (self.plugin_root / "resources/scripts/workflow_doctor.py").unlink()
        result = self._run()
        self.assertIn("package-integrity", self._failed_ids(result))

    def test_duplicate_legacy_skill_fails(self) -> None:
        self._configure()
        duplicate = self.home / ".agents/skills/software-development-workflow"
        duplicate.mkdir(parents=True)
        result = self._run()
        self.assertIn("duplicate-legacy-skills", self._failed_ids(result))


if __name__ == "__main__":
    unittest.main()
