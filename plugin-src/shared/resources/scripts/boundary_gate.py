#!/usr/bin/env python3
"""Resolve one deterministic gate view of a pinned PR boundary."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Sequence

from boundary_packet import ARTIFACTS, packet_path
from feature_final import FeatureFinalError, resolve_feature_final_context
from pr_context import PullRequestContext, PullRequestContextError, load_context
from workflow_context import (
    WorkflowContext,
    WorkflowContextError,
    resolve_workflow_context,
)


SCHEMA_VERSION = 1
SCOPES = {"slice", "feature-final"}
FEATURE_WIDE_GATES = {"verification", "specEvaluation", "judge"}


class BoundaryGateError(RuntimeError):
    """Raised when a gate cannot use the pinned boundary context safely."""


def _git_output(args: Sequence[str], cwd: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(cwd), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "git command failed"
        raise BoundaryGateError(detail)
    return result.stdout.strip()


def resolve_gate_context(
    workflow: WorkflowContext,
    context: PullRequestContext,
    gate: str,
    *,
    scope: str = "slice",
) -> dict[str, object]:
    if gate not in ARTIFACTS:
        raise BoundaryGateError(
            f"Unknown boundary gate {gate!r}; expected one of {sorted(ARTIFACTS)}"
        )
    if scope not in SCOPES:
        raise BoundaryGateError(
            f"Unknown boundary scope {scope!r}; expected one of {sorted(SCOPES)}"
        )
    if context.repository_alias != workflow.repository.alias:
        raise BoundaryGateError(
            f"PR context repository alias {context.repository_alias!r} differs from "
            f"workflow alias {workflow.repository.alias!r}"
        )
    repository_root = workflow.repository.path.resolve()
    if context.repository_root != repository_root:
        raise BoundaryGateError(
            "PR context repository root differs from the selected workflow repository"
        )
    git_root = Path(
        _git_output(["rev-parse", "--show-toplevel"], repository_root)
    ).resolve()
    if git_root != repository_root:
        raise BoundaryGateError(
            "Selected workflow repository is not the Git repository root"
        )
    branch = _git_output(["branch", "--show-current"], repository_root)
    if branch != context.pull_request.head_branch:
        raise BoundaryGateError(
            f"Local branch {branch!r} differs from pinned PR head branch "
            f"{context.pull_request.head_branch!r}"
        )
    local_head = _git_output(["rev-parse", "HEAD"], repository_root).lower()
    if local_head != context.evaluated_source_sha:
        raise BoundaryGateError(
            f"Local HEAD {local_head} differs from evaluatedSourceSha "
            f"{context.evaluated_source_sha}; rerun the formal boundary"
        )
    merge_base = _git_output(
        [
            "merge-base",
            context.pull_request.base_sha,
            context.evaluated_source_sha,
        ],
        repository_root,
    ).lower()
    if merge_base != context.merge_base_sha:
        raise BoundaryGateError(
            f"Pinned merge base {context.merge_base_sha} differs from Git result "
            f"{merge_base}"
        )
    slice_changed = _git_output(
        [
            "diff",
            "--name-only",
            "--no-renames",
            f"{context.merge_base_sha}..{context.evaluated_source_sha}",
        ],
        repository_root,
    )
    packet = packet_path(workflow, context.pull_request.number).resolve()
    output = packet / ARTIFACTS[gate]
    feature_base: str | None = None
    feature_changed: list[str] | None = None
    retention: dict[str, object] | None = None
    evaluation_scope = "slice"
    diff_base = context.merge_base_sha
    if scope == "feature-final":
        final = resolve_feature_final_context(workflow, context)
        feature_base = str(final["featureBaseSha"])
        feature_changed = list(final["featureChangedFiles"])
        retention = dict(final["retention"])
        if gate in FEATURE_WIDE_GATES:
            evaluation_scope = "feature"
            diff_base = feature_base
    selected_changed = (
        feature_changed
        if evaluation_scope == "feature"
        else [line for line in slice_changed.splitlines() if line]
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "scope": scope,
        "gate": gate,
        "artifact": ARTIFACTS[gate],
        "repositoryRoot": str(repository_root),
        "repositoryAlias": workflow.repository.alias,
        "featureId": workflow.feature_id,
        "featureHome": str(workflow.feature_home.resolve()),
        "packetId": packet.name,
        "packetPath": str(packet),
        "outputPath": str(output),
        "pullRequest": context.pull_request.to_dict(),
        "evaluationScope": evaluation_scope,
        "featureBaseSha": feature_base,
        "sliceBaseSha": context.merge_base_sha,
        "diffBaseSha": diff_base,
        "diffHeadSha": context.evaluated_source_sha,
        "changedFiles": selected_changed,
        "sliceChangedFiles": [
            line for line in slice_changed.splitlines() if line
        ],
        "featureChangedFiles": feature_changed,
        "featureHomeRetention": retention,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cwd", default=".")
    parser.add_argument("--repository")
    parser.add_argument("--context", required=True)
    parser.add_argument("--gate", required=True, choices=sorted(ARTIFACTS))
    parser.add_argument("--scope", choices=sorted(SCOPES), default="slice")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        workflow = resolve_workflow_context(
            args.cwd, repository_alias=args.repository
        )
        context = load_context(args.context)
        result = resolve_gate_context(
            workflow, context, args.gate, scope=args.scope
        )
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(result["outputPath"])
        return 0
    except (
        BoundaryGateError,
        FeatureFinalError,
        PullRequestContextError,
        WorkflowContextError,
    ) as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
