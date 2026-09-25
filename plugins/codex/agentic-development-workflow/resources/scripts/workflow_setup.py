#!/usr/bin/env python3
"""Configure portable workflow settings through namespaced Git config."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Sequence

from workflow_common import (
    WorkflowConfigurationError,
    default_plugin_root,
    profile_paths,
    validate_branch_prefix,
    write_configuration,
)


def configure(
    *,
    plugin_root: Path,
    profile: str,
    branch_prefix: str,
    scope: str,
    repository: Path | None,
    git_executable: str,
    environment: dict[str, str] | None = None,
) -> dict[str, object]:
    profiles = profile_paths(plugin_root)
    if profile not in profiles:
        available = ", ".join(profiles) or "none"
        raise WorkflowConfigurationError(
            f"Unknown workflow profile {profile!r}; available profiles: {available}"
        )
    if scope == "local":
        if repository is None:
            raise WorkflowConfigurationError("Local setup requires --repository")
        repository = repository.resolve()
        probe = subprocess.run(
            [git_executable, "-C", str(repository), "rev-parse", "--git-dir"],
            capture_output=True,
            text=True,
            env=environment,
        )
        if probe.returncode != 0:
            raise WorkflowConfigurationError(f"Not a Git repository: {repository}")
    elif repository is not None:
        raise WorkflowConfigurationError("--repository is valid only with --scope local")

    validate_branch_prefix(
        branch_prefix,
        git_executable=git_executable,
        environment=environment,
    )
    write_configuration(
        profile=profile,
        branch_prefix=branch_prefix,
        scope=scope,
        git_executable=git_executable,
        repository=repository,
        environment=environment,
    )
    return {
        "schemaVersion": 1,
        "scope": scope,
        "repository": str(repository) if repository is not None else None,
        "profile": profile,
        "branchPrefix": branch_prefix,
        "profilePath": str(profiles[profile]),
    }


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument(
        "--plugin-root",
        type=Path,
        default=default_plugin_root(Path(__file__)),
    )
    command.add_argument("--profile", required=True)
    command.add_argument("--branch-prefix", required=True)
    command.add_argument("--scope", choices=("global", "local"), default="global")
    command.add_argument("--repository", type=Path)
    command.add_argument("--json", action="store_true")
    return command


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    git_executable = shutil.which("git")
    if git_executable is None:
        print("ERROR: Git is required to configure the workflow", file=sys.stderr)
        return 1

    try:
        result = configure(
            plugin_root=arguments.plugin_root.resolve(),
            profile=arguments.profile,
            branch_prefix=arguments.branch_prefix,
            scope=arguments.scope,
            repository=arguments.repository,
            git_executable=git_executable,
        )
    except (WorkflowConfigurationError, subprocess.CalledProcessError) as error:
        detail = error.stderr.strip() if isinstance(error, subprocess.CalledProcessError) and error.stderr else str(error)
        print(f"ERROR: {detail}", file=sys.stderr)
        return 1

    if arguments.json:
        print(json.dumps(result, indent=2))
    else:
        print(
            "Workflow configured: "
            f"scope={result['scope']} profile={result['profile']} "
            f"branchPrefix={result['branchPrefix']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
