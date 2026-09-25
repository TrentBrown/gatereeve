#!/usr/bin/env python3
"""Resolve portable feature-workspace context for workflow commands."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from workflow_common import WorkflowConfigurationError, load_json


CONFIG_NAME = ".agentic-workflow.json"
SCHEMA_VERSION = 1
IDENTIFIER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$")
OBJECT_ID = re.compile(r"^[0-9a-fA-F]{40,64}$")


class WorkflowContextError(RuntimeError):
    """Raised when a workspace cannot resolve one safe workflow context."""


@dataclass(frozen=True)
class ExternalTask:
    id: str | None
    url: str | None

    def to_dict(self) -> dict[str, str | None]:
        return {"id": self.id, "url": self.url}


@dataclass(frozen=True)
class RepositoryContext:
    alias: str
    path: Path
    remote: str
    integration_branch: str
    feature_base_sha: str | None = None

    def to_dict(self) -> dict[str, str | None]:
        return {
            "alias": self.alias,
            "path": str(self.path),
            "remote": self.remote,
            "integrationBranch": self.integration_branch,
            "featureBaseSha": self.feature_base_sha,
        }


@dataclass(frozen=True)
class WorkflowContext:
    mode: str
    workspace_root: Path
    config_path: Path | None
    feature_id: str
    feature_home: Path
    repositories: tuple[RepositoryContext, ...]
    repository: RepositoryContext
    external_task: ExternalTask | None

    @property
    def multi_repository(self) -> bool:
        return len(self.repositories) > 1

    def to_dict(self) -> dict[str, object]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "mode": self.mode,
            "workspaceRoot": str(self.workspace_root),
            "configPath": str(self.config_path) if self.config_path else None,
            "featureId": self.feature_id,
            "featureHome": str(self.feature_home),
            "externalTask": self.external_task.to_dict() if self.external_task else None,
            "multiRepository": self.multi_repository,
            "repository": self.repository.to_dict(),
            "repositories": [item.to_dict() for item in self.repositories],
        }


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _validate_identifier(value: object, label: str) -> str:
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise WorkflowContextError(
            f"{label} must be a nonempty portable slug containing only letters, "
            "numbers, dots, underscores, and hyphens"
        )
    if value in {".", ".."} or ".." in value or value.endswith(".lock"):
        raise WorkflowContextError(f"{label} is not a safe Git-compatible slug: {value}")
    return value


def validate_feature_id(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise WorkflowContextError("featureId must be a nonempty Git-compatible name")
    if any(character.isspace() or ord(character) < 32 for character in value):
        raise WorkflowContextError("featureId must not contain whitespace or control characters")
    invalid_fragments = ("..", "//", "@{", "\\", "~", "^", ":", "?", "*", "[")
    if (
        value.startswith(("/", ".", "-"))
        or value.endswith(("/", "."))
        or any(fragment in value for fragment in invalid_fragments)
        or any(part.startswith(".") or part.endswith(".lock") for part in value.split("/"))
    ):
        raise WorkflowContextError(f"featureId is not a safe Git-compatible name: {value}")
    return value


def _validate_branch_name(value: str, label: str) -> str:
    try:
        return validate_feature_id(value)
    except WorkflowContextError as error:
        raise WorkflowContextError(f"{label} is invalid: {error}") from error


def find_workspace_config(start: str | Path = ".") -> Path | None:
    current = Path(start).expanduser().resolve()
    if current.is_file():
        current = current.parent
    for directory in (current, *current.parents):
        candidate = directory / CONFIG_NAME
        if candidate.is_file():
            return candidate
    return None


def _required_string(mapping: Mapping[str, object], key: str, label: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise WorkflowContextError(f"{label}.{key} must be a nonempty string")
    return value.strip()


def _parse_external_task(value: object) -> ExternalTask | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise WorkflowContextError("externalTask must be an object")
    task_id = value.get("id")
    url = value.get("url")
    if task_id is not None and (not isinstance(task_id, str) or not task_id.strip()):
        raise WorkflowContextError("externalTask.id must be a nonempty string")
    if url is not None and (not isinstance(url, str) or not url.strip()):
        raise WorkflowContextError("externalTask.url must be a nonempty string")
    if task_id is None and url is None:
        raise WorkflowContextError("externalTask must define id or url")
    return ExternalTask(
        id=task_id.strip() if isinstance(task_id, str) else None,
        url=url.strip() if isinstance(url, str) else None,
    )


def _parse_repositories(
    value: object,
    workspace_root: Path,
) -> tuple[RepositoryContext, ...]:
    if not isinstance(value, dict) or not value:
        raise WorkflowContextError("repositories must be a nonempty object")

    repositories: list[RepositoryContext] = []
    paths: dict[Path, str] = {}
    for raw_alias, raw_repository in value.items():
        alias = _validate_identifier(raw_alias, "repository alias")
        if not isinstance(raw_repository, dict):
            raise WorkflowContextError(f"repositories.{alias} must be an object")
        raw_path = _required_string(raw_repository, "path", f"repositories.{alias}")
        relative_path = Path(raw_path).expanduser()
        if relative_path.is_absolute():
            raise WorkflowContextError(
                f"repositories.{alias}.path must be workspace-relative"
            )
        path = (workspace_root / relative_path).resolve()
        if not _is_within(path, workspace_root):
            raise WorkflowContextError(
                f"repositories.{alias}.path escapes the workspace root"
            )
        if not path.is_dir():
            raise WorkflowContextError(
                f"repositories.{alias}.path does not identify an existing directory: {path}"
            )
        if path in paths:
            raise WorkflowContextError(
                f"repositories.{alias} and repositories.{paths[path]} resolve to the same path"
            )
        paths[path] = alias
        remote = _validate_identifier(
            raw_repository.get("remote", "origin"),
            f"repositories.{alias}.remote",
        )
        integration_branch = _validate_branch_name(
            _required_string(
                raw_repository,
                "integrationBranch",
                f"repositories.{alias}",
            ),
            f"repositories.{alias}.integrationBranch",
        )
        raw_feature_base = raw_repository.get("featureBaseSha")
        if raw_feature_base is None:
            feature_base_sha = None
        elif not isinstance(raw_feature_base, str) or not OBJECT_ID.fullmatch(
            raw_feature_base
        ):
            raise WorkflowContextError(
                f"repositories.{alias}.featureBaseSha must be a full hexadecimal "
                "object ID"
            )
        else:
            feature_base_sha = raw_feature_base.lower()
        repositories.append(
            RepositoryContext(
                alias=alias,
                path=path,
                remote=remote,
                integration_branch=integration_branch,
                feature_base_sha=feature_base_sha,
            )
        )
    return tuple(repositories)


def _select_repository(
    repositories: tuple[RepositoryContext, ...],
    start: Path,
    repository_alias: str | None,
) -> RepositoryContext:
    if repository_alias is not None:
        for repository in repositories:
            if repository.alias == repository_alias:
                return repository
        known = ", ".join(item.alias for item in repositories)
        raise WorkflowContextError(
            f"Unknown repository alias {repository_alias!r}; configured aliases: {known}"
        )
    if len(repositories) == 1:
        return repositories[0]

    matches = [item for item in repositories if _is_within(start, item.path)]
    if not matches:
        raise WorkflowContextError(
            "Current path does not identify a configured repository; pass a repository alias"
        )
    matches.sort(key=lambda item: len(item.path.parts), reverse=True)
    return matches[0]


def _run_git(
    args: list[str],
    cwd: Path,
    *,
    git_executable: str,
    environment: Mapping[str, str] | None,
) -> str:
    result = subprocess.run(
        [git_executable, "-C", str(cwd), *args],
        check=False,
        capture_output=True,
        text=True,
        env=dict(environment) if environment is not None else None,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "Git command failed"
        raise WorkflowContextError(detail)
    return result.stdout.strip()


def _legacy_context(
    start: Path,
    *,
    git_executable: str,
    environment: Mapping[str, str] | None,
) -> WorkflowContext:
    root = Path(
        _run_git(
            ["rev-parse", "--show-toplevel"],
            start,
            git_executable=git_executable,
            environment=environment,
        )
    ).resolve()
    branch = _run_git(
        ["branch", "--show-current"],
        root,
        git_executable=git_executable,
        environment=environment,
    )
    if not branch:
        raise WorkflowContextError(
            f"Cannot derive legacy feature identity from detached HEAD in {root}"
        )
    # The existing branch-derived layout permits Git branch prefixes such as
    # ``developer/feature`` and therefore may produce nested issue folders.
    # Preserve that behavior in legacy mode; configured feature IDs use an
    # explicit safe Git-compatible contract.
    feature_id = branch
    repository = RepositoryContext(
        alias="repository",
        path=root,
        remote="origin",
        integration_branch="",
    )
    return WorkflowContext(
        mode="legacy",
        workspace_root=root,
        config_path=None,
        feature_id=feature_id,
        feature_home=root / "docs" / "issues" / feature_id,
        repositories=(repository,),
        repository=repository,
        external_task=None,
    )


def resolve_workflow_context(
    start: str | Path = ".",
    *,
    repository_alias: str | None = None,
    git_executable: str = "git",
    environment: Mapping[str, str] | None = None,
) -> WorkflowContext:
    start_path = Path(start).expanduser().resolve()
    if start_path.is_file():
        start_path = start_path.parent
    config_path = find_workspace_config(start_path)
    if config_path is None:
        return _legacy_context(
            start_path,
            git_executable=git_executable,
            environment=environment,
        )

    try:
        raw = load_json(config_path)
    except WorkflowConfigurationError as error:
        raise WorkflowContextError(str(error)) from error
    if not isinstance(raw, dict):
        raise WorkflowContextError(f"{config_path} must contain a JSON object")
    if raw.get("schemaVersion") != SCHEMA_VERSION:
        raise WorkflowContextError(
            f"{config_path} schemaVersion must be {SCHEMA_VERSION}"
        )
    workspace_root = config_path.parent.resolve()
    feature_id = validate_feature_id(raw.get("featureId"))
    repositories = _parse_repositories(raw.get("repositories"), workspace_root)
    repository = _select_repository(repositories, start_path, repository_alias)
    external_task = _parse_external_task(raw.get("externalTask"))
    return WorkflowContext(
        mode="configured",
        workspace_root=workspace_root,
        config_path=config_path.resolve(),
        feature_id=feature_id,
        feature_home=workspace_root / "docs" / "issues" / feature_id,
        repositories=repositories,
        repository=repository,
        external_task=external_task,
    )


def delivery_branch_name(feature_id: str, ordinal: int, description: str) -> str:
    feature = validate_feature_id(feature_id)
    if not isinstance(ordinal, int) or isinstance(ordinal, bool) or ordinal < 1:
        raise WorkflowContextError("Delivery branch ordinal must be a positive integer")
    try:
        slice_description = _validate_identifier(description, "delivery description")
    except WorkflowContextError as error:
        raise WorkflowContextError(f"Invalid delivery description: {error}") from error
    return f"{feature}-{ordinal:02d}-{slice_description}"


def validate_delivery_branch(feature_id: str, branch: str) -> None:
    feature = validate_feature_id(feature_id)
    if branch == feature:
        return
    pattern = re.compile(rf"^{re.escape(feature)}-(\d{{2,}})-([A-Za-z0-9][A-Za-z0-9._-]*)$")
    match = pattern.fullmatch(branch)
    if not match or int(match.group(1)) < 1:
        raise WorkflowContextError(
            f"Branch {branch!r} is not the feature branch or a sequential delivery "
            f"branch for {feature!r}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    resolve_parser = subparsers.add_parser("resolve", help="Resolve active workflow context")
    resolve_parser.add_argument("--cwd", default=".")
    resolve_parser.add_argument("--repository")
    resolve_parser.add_argument("--json", action="store_true")

    branch_parser = subparsers.add_parser(
        "delivery-branch", help="Build a sequential delivery branch name"
    )
    branch_parser.add_argument("--feature-id", required=True)
    branch_parser.add_argument("--ordinal", required=True, type=int)
    branch_parser.add_argument("--description", required=True)

    args = parser.parse_args()
    try:
        if args.command == "delivery-branch":
            print(delivery_branch_name(args.feature_id, args.ordinal, args.description))
            return 0
        context = resolve_workflow_context(args.cwd, repository_alias=args.repository)
        if args.json:
            print(json.dumps(context.to_dict(), indent=2))
        else:
            print(f"Feature: {context.feature_id}")
            print(f"Feature home: {context.feature_home}")
            print(f"Repository: {context.repository.alias} ({context.repository.path})")
        return 0
    except WorkflowContextError as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
