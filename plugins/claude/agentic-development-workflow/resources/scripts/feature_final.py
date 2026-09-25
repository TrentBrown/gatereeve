#!/usr/bin/env python3
"""Resolve complete-feature evaluation context and retention status."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path, PurePosixPath
from typing import Sequence

from pr_context import PullRequestContext, PullRequestContextError, load_context
from workflow_context import (
    WorkflowContext,
    WorkflowContextError,
    resolve_workflow_context,
)


SCHEMA_VERSION = 1
TRANSIENT_FILE_NAMES = {".DS_Store", "Thumbs.db"}


class FeatureFinalError(RuntimeError):
    """Raised when complete-feature evaluation cannot be resolved safely."""


def _git(
    args: Sequence[str],
    cwd: Path,
    *,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", "-C", str(cwd), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if check and result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "git command failed"
        raise FeatureFinalError(detail)
    return result


def _git_output(args: Sequence[str], cwd: Path) -> str:
    return _git(args, cwd).stdout.strip()


def effective_feature_base(
    workflow: WorkflowContext,
    context: PullRequestContext,
) -> str:
    """Return the explicit original base for a feature-final boundary."""
    if workflow.mode == "legacy":
        if context.feature_base_sha not in {None, context.merge_base_sha}:
            raise FeatureFinalError(
                "Legacy PR context featureBaseSha must be absent or equal the slice base"
            )
        return context.merge_base_sha

    configured = workflow.repository.feature_base_sha
    if configured is None:
        raise FeatureFinalError(
            f"Configured repository {workflow.repository.alias!r} has no "
            "featureBaseSha; record the original integration-branch commit before "
            "declaring scope feature-final"
        )
    if context.feature_base_sha is None:
        raise FeatureFinalError(
            "Pinned PR context has no featureBaseSha; rerun PR context resolution "
            "after configuring the original feature base"
        )
    if context.feature_base_sha != configured:
        raise FeatureFinalError(
            "Pinned PR context featureBaseSha differs from current workspace context"
        )
    return configured


def _require_ancestor(
    repository: Path,
    ancestor: str,
    descendant: str,
    label: str,
) -> None:
    result = _git(
        ["merge-base", "--is-ancestor", ancestor, descendant],
        repository,
        check=False,
    )
    if result.returncode != 0:
        raise FeatureFinalError(
            f"{label} {ancestor} is not an ancestor of {descendant}"
        )


def _changed_paths(repository: Path, base: str, head: str) -> list[str]:
    output = _git_output(
        ["diff", "--name-only", "--no-renames", f"{base}..{head}"],
        repository,
    )
    return [line for line in output.splitlines() if line]


def _is_known_transient(relative: str) -> bool:
    path = PurePosixPath(relative)
    return (
        path.name in TRANSIENT_FILE_NAMES
        or path.suffix == ".pyc"
        or "__pycache__" in path.parts
    )


def feature_home_retention(feature_home: Path) -> dict[str, object]:
    """Report whether every current feature-record file is Git tracked."""
    feature_home = feature_home.resolve()
    if not feature_home.is_dir():
        return {
            "status": "empty",
            "gitRoot": None,
            "trackedFileCount": 0,
            "untrackedFileCount": 0,
            "untrackedFiles": [],
            "ignoredFileCount": 0,
            "ignoredFiles": [],
            "retentionDecisionRequired": True,
            "reason": "The feature home does not exist",
        }
    files = sorted(
        item
        for item in feature_home.rglob("*")
        if item.is_file() or item.is_symlink()
    )
    relative_files = [item.relative_to(feature_home).as_posix() for item in files]

    root_result = _git(["rev-parse", "--show-toplevel"], feature_home, check=False)
    if root_result.returncode != 0:
        return {
            "status": "untracked",
            "gitRoot": None,
            "trackedFileCount": 0,
            "untrackedFileCount": len(relative_files),
            "untrackedFiles": relative_files,
            "ignoredFileCount": 0,
            "ignoredFiles": [],
            "retentionDecisionRequired": True,
            "reason": "The feature home is not inside a Git worktree",
        }

    git_root = Path(root_result.stdout.strip()).resolve()
    try:
        feature_relative = feature_home.relative_to(git_root).as_posix()
    except ValueError as error:
        raise FeatureFinalError("Feature home escapes its reported Git root") from error
    tracked_output = _git(
        ["ls-files", "-z", "--", feature_relative],
        git_root,
    ).stdout
    tracked_repository_paths = {
        path for path in tracked_output.split("\0") if path
    }
    tracked_files: list[str] = []
    untracked_files: list[str] = []
    prefix = PurePosixPath(feature_relative)
    for relative in relative_files:
        repository_path = (prefix / PurePosixPath(relative)).as_posix()
        target = (
            tracked_files
            if repository_path in tracked_repository_paths
            else untracked_files
        )
        target.append(relative)

    ignored_files: list[str] = []
    retained_untracked_files: list[str] = []
    for relative in untracked_files:
        repository_path = (prefix / PurePosixPath(relative)).as_posix()
        ignored = _git(
            ["check-ignore", "-q", "--", repository_path],
            git_root,
            check=False,
        )
        target = (
            ignored_files
            if ignored.returncode == 0 and _is_known_transient(relative)
            else retained_untracked_files
        )
        target.append(relative)
    untracked_files = retained_untracked_files

    if not tracked_files and not untracked_files:
        status = "empty"
        reason = "The feature home contains no non-ignored files to retain"
    elif not untracked_files:
        status = "tracked"
        reason = "Every current feature-record file is tracked by Git"
    elif not tracked_files:
        status = "untracked"
        reason = "No current feature-record file is tracked by Git"
    else:
        status = "partially_tracked"
        reason = "Some current feature-record files are not tracked by Git"
    return {
        "status": status,
        "gitRoot": str(git_root),
        "trackedFileCount": len(tracked_files),
        "untrackedFileCount": len(untracked_files),
        "untrackedFiles": untracked_files,
        "ignoredFileCount": len(ignored_files),
        "ignoredFiles": ignored_files,
        "retentionDecisionRequired": status != "tracked",
        "reason": reason,
    }


def resolve_feature_final_context(
    workflow: WorkflowContext,
    context: PullRequestContext,
) -> dict[str, object]:
    """Resolve one complete-feature view anchored to a real final PR."""
    repository = workflow.repository.path.resolve()
    if context.repository_alias != workflow.repository.alias:
        raise FeatureFinalError(
            "PR context repository alias differs from the selected workflow repository"
        )
    if context.repository_root != repository:
        raise FeatureFinalError(
            "PR context repository root differs from the selected workflow repository"
        )
    branch = _git_output(["branch", "--show-current"], repository)
    if branch != context.pull_request.head_branch:
        raise FeatureFinalError(
            f"Local branch {branch!r} differs from pinned PR head branch "
            f"{context.pull_request.head_branch!r}"
        )
    local_head = _git_output(["rev-parse", "HEAD"], repository).lower()
    if local_head != context.evaluated_source_sha:
        raise FeatureFinalError(
            f"Local HEAD {local_head} differs from evaluatedSourceSha "
            f"{context.evaluated_source_sha}"
        )
    merge_base = _git_output(
        [
            "merge-base",
            context.pull_request.base_sha,
            context.evaluated_source_sha,
        ],
        repository,
    ).lower()
    if merge_base != context.merge_base_sha:
        raise FeatureFinalError(
            f"Pinned merge base {context.merge_base_sha} differs from Git result "
            f"{merge_base}"
        )
    feature_base = effective_feature_base(workflow, context)
    for object_id in (
        feature_base,
        context.merge_base_sha,
        context.evaluated_source_sha,
    ):
        _git_output(["cat-file", "-e", f"{object_id}^{{commit}}"], repository)
    _require_ancestor(
        repository,
        feature_base,
        context.merge_base_sha,
        "Feature base",
    )
    _require_ancestor(
        repository,
        context.merge_base_sha,
        context.evaluated_source_sha,
        "Slice base",
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "scope": "feature-final",
        "featureId": workflow.feature_id,
        "repositoryAlias": workflow.repository.alias,
        "featureHome": str(workflow.feature_home.resolve()),
        "pullRequest": context.pull_request.to_dict(),
        "featureBaseSha": feature_base,
        "sliceBaseSha": context.merge_base_sha,
        "evaluatedSourceSha": context.evaluated_source_sha,
        "featureChangedFiles": _changed_paths(
            repository, feature_base, context.evaluated_source_sha
        ),
        "sliceChangedFiles": _changed_paths(
            repository, context.merge_base_sha, context.evaluated_source_sha
        ),
        "retention": feature_home_retention(workflow.feature_home),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cwd", default=".")
    parser.add_argument("--repository")
    parser.add_argument("--context", required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        workflow = resolve_workflow_context(
            args.cwd, repository_alias=args.repository
        )
        context = load_context(args.context)
        result = resolve_feature_final_context(workflow, context)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(
                f"Feature base: {result['featureBaseSha']}\n"
                f"Slice base: {result['sliceBaseSha']}\n"
                f"Retention: {result['retention']['status']}"
            )
        return 0
    except (
        FeatureFinalError,
        PullRequestContextError,
        WorkflowContextError,
    ) as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
