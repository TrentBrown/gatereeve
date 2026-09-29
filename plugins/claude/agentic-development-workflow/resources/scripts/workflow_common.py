#!/usr/bin/env python3
"""Shared portable helpers for workflow setup and diagnostics."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Mapping


PROFILE_KEY = "agentic-workflow.profile"
BRANCH_PREFIX_KEY = "agentic-workflow.branchPrefix"


class WorkflowConfigurationError(RuntimeError):
    """Raised when workflow configuration cannot be read or written safely."""


def default_plugin_root(script: Path) -> Path:
    return script.resolve().parents[2]


def profile_paths(plugin_root: Path) -> dict[str, Path]:
    root = plugin_root / "resources" / "policy" / "profiles"
    if not root.is_dir():
        return {}
    return {path.stem: path for path in sorted(root.glob("*.md"))}


def _git_prefix(git_executable: str, repository: Path | None) -> list[str]:
    command = [git_executable]
    if repository is not None:
        command.extend(["-C", str(repository)])
    return command


def validate_branch_prefix(
    prefix: str,
    *,
    git_executable: str,
    environment: Mapping[str, str] | None = None,
) -> None:
    if not prefix or prefix.isspace():
        raise WorkflowConfigurationError("Branch prefix must not be empty")
    if any(character.isspace() for character in prefix):
        raise WorkflowConfigurationError("Branch prefix must not contain whitespace")

    result = subprocess.run(
        [git_executable, "check-ref-format", "--branch", f"{prefix}workflow-check"],
        capture_output=True,
        text=True,
        env=dict(environment) if environment is not None else None,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "invalid Git branch prefix"
        raise WorkflowConfigurationError(detail)


def write_configuration(
    *,
    profile: str,
    branch_prefix: str,
    scope: str,
    git_executable: str,
    repository: Path | None = None,
    environment: Mapping[str, str] | None = None,
) -> None:
    if scope not in {"global", "local"}:
        raise WorkflowConfigurationError(f"Unsupported Git configuration scope: {scope}")
    if scope == "local" and repository is None:
        raise WorkflowConfigurationError("Local scope requires a repository path")

    command = _git_prefix(git_executable, repository if scope == "local" else None)
    command.extend(["config", f"--{scope}", "--replace-all"])
    subprocess.run(
        [*command, PROFILE_KEY, profile],
        check=True,
        capture_output=True,
        text=True,
        env=dict(environment) if environment is not None else None,
    )
    subprocess.run(
        [*command, BRANCH_PREFIX_KEY, branch_prefix],
        check=True,
        capture_output=True,
        text=True,
        env=dict(environment) if environment is not None else None,
    )


def read_configuration(
    *,
    git_executable: str,
    repository: Path | None = None,
    environment: Mapping[str, str] | None = None,
) -> dict[str, str | None]:
    values: dict[str, str | None] = {}
    for label, key in (("profile", PROFILE_KEY), ("branchPrefix", BRANCH_PREFIX_KEY)):
        command = _git_prefix(git_executable, repository)
        command.extend(["config", "--get", key])
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            env=dict(environment) if environment is not None else None,
        )
        if result.returncode == 0:
            values[label] = result.stdout.strip()
        elif result.returncode == 1:
            values[label] = None
        else:
            detail = result.stderr.strip() or f"git config failed for {key}"
            raise WorkflowConfigurationError(detail)
    return values


def load_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise WorkflowConfigurationError(f"Cannot read JSON file {path}: {error}") from error
