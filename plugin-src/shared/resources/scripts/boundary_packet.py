#!/usr/bin/env python3
"""Resolve and validate durable pull-request evidence packets."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path, PurePosixPath
from typing import Mapping, Sequence

from feature_final import FeatureFinalError, effective_feature_base
from pr_context import PullRequestContext, PullRequestContextError, load_context
from workflow_context import WorkflowContext, resolve_workflow_context


SCHEMA_VERSION = 1
SHA = re.compile(r"^[0-9a-fA-F]{40,64}$")
PACKET_NAME = re.compile(r"^pr-[A-Za-z0-9._-]+$")
DISPOSITIONS = {"passed", "waived", "not_applicable"}
SCOPES = {"slice", "feature-final"}

ARTIFACTS = {
    "verification": "verification.md",
    "specEvaluation": "spec-evaluation.md",
    "judge": "judge.md",
    "codeReview": "code-review.md",
    "patternReview": "pattern-review.md",
    "explainDiff": "explain-diff.html",
}
CORE_GATES = {"verification", "codeReview", "explainDiff"}
CONDITIONAL_GATES = {"specEvaluation", "judge", "patternReview"}
MANIFEST_KEYS = {
    "schemaVersion",
    "scope",
    "featureId",
    "repositoryAlias",
    "packetId",
    "pullRequest",
    "mergeBaseSha",
    "evaluatedSourceSha",
    "featureBaseSha",
    "applicability",
    "gates",
}


class BoundaryPacketError(RuntimeError):
    """Raised when an evidence packet violates the boundary contract."""


def _required_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BoundaryPacketError(f"{label} must be a nonempty string")
    return value.strip()


def _required_sha(value: object, label: str) -> str:
    result = _required_string(value, label).lower()
    if not SHA.fullmatch(result):
        raise BoundaryPacketError(f"{label} must be a full hexadecimal object ID")
    return result


def _exact_keys(value: object, expected: set[str], label: str) -> Mapping[str, object]:
    if not isinstance(value, dict):
        raise BoundaryPacketError(f"{label} must be an object")
    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        unexpected = sorted(actual - expected)
        details = []
        if missing:
            details.append(f"missing {', '.join(missing)}")
        if unexpected:
            details.append(f"unexpected {', '.join(unexpected)}")
        raise BoundaryPacketError(f"{label} fields differ: {'; '.join(details)}")
    return value


def packet_name(workflow: WorkflowContext, pr_number: int) -> str:
    if not isinstance(pr_number, int) or isinstance(pr_number, bool) or pr_number < 1:
        raise BoundaryPacketError("PR number must be a positive integer")
    if workflow.multi_repository:
        return f"pr-{workflow.repository.alias}-{pr_number}"
    return f"pr-{pr_number}"


def packet_path(workflow: WorkflowContext, pr_number: int) -> Path:
    return workflow.feature_home / packet_name(workflow, pr_number)


def _load_json(path: Path, label: str) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BoundaryPacketError(f"Cannot read {label} from {path}: {error}") from error


def _validate_context_alignment(
    workflow: WorkflowContext,
    context: PullRequestContext,
) -> None:
    if context.repository_alias != workflow.repository.alias:
        raise BoundaryPacketError(
            f"PR context repository alias {context.repository_alias!r} differs from "
            f"workflow alias {workflow.repository.alias!r}"
        )
    if context.repository_root != workflow.repository.path.resolve():
        raise BoundaryPacketError(
            "PR context repository root differs from the selected workflow repository"
        )


def _validate_gate(
    gate: str,
    value: object,
    applicable: bool,
    packet: Path,
) -> dict[str, object]:
    fields = _exact_keys(value, {"disposition", "reason"}, f"gates.{gate}")
    disposition = _required_string(
        fields.get("disposition"), f"gates.{gate}.disposition"
    )
    if disposition not in DISPOSITIONS:
        raise BoundaryPacketError(
            f"gates.{gate}.disposition must be one of {sorted(DISPOSITIONS)}"
        )
    reason = fields.get("reason")
    if reason is not None and (not isinstance(reason, str) or not reason.strip()):
        raise BoundaryPacketError(f"gates.{gate}.reason must be null or nonempty text")
    if disposition in {"waived", "not_applicable"} and not reason:
        raise BoundaryPacketError(
            f"gates.{gate}.reason is required when disposition is {disposition}"
        )
    if disposition == "passed" and reason is not None:
        raise BoundaryPacketError(
            f"gates.{gate}.reason must be null when disposition is passed"
        )
    if gate in CORE_GATES and disposition == "not_applicable":
        raise BoundaryPacketError(f"Core gate {gate} cannot be not_applicable")
    if gate in CONDITIONAL_GATES:
        if applicable and disposition == "not_applicable":
            raise BoundaryPacketError(
                f"Applicable gate {gate} cannot be not_applicable"
            )
        if not applicable and disposition != "not_applicable":
            raise BoundaryPacketError(
                f"Inapplicable gate {gate} must be not_applicable"
            )

    artifact = packet / ARTIFACTS[gate]
    required = gate in CORE_GATES or disposition != "not_applicable"
    if required:
        if not artifact.is_file() or artifact.is_symlink() or artifact.stat().st_size == 0:
            raise BoundaryPacketError(
                f"Gate {gate} requires nonempty regular artifact {ARTIFACTS[gate]}"
            )
    elif artifact.exists():
        raise BoundaryPacketError(
            f"Inapplicable gate {gate} must not include {ARTIFACTS[gate]}"
        )
    return {"disposition": disposition, "reason": reason}


def _validate_tracker_link(feature_home: Path, pr_number: int, packet_id: str) -> None:
    tracker = feature_home / "tracker.md"
    try:
        text = tracker.read_text(encoding="utf-8")
    except OSError as error:
        raise BoundaryPacketError(f"Cannot read cumulative tracker {tracker}: {error}") from error
    pattern = re.compile(
        rf"^### PR #{pr_number}\b(?P<body>.*?)(?=^### PR #|\Z)",
        flags=re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        raise BoundaryPacketError(f"Tracker PR Log has no PR #{pr_number} entry")
    link = re.compile(rf"\]\((?:\./)?{re.escape(packet_id)}/(?:boundary\.json)?\)")
    if not link.search(match.group("body")):
        raise BoundaryPacketError(
            f"Tracker PR #{pr_number} entry does not link packet {packet_id}/"
        )


def _validate_centralized_ownership(
    workflow: WorkflowContext,
    expected_packet: Path,
) -> None:
    for repository in workflow.repositories:
        subordinate_home = (
            repository.path
            / "docs"
            / "issues"
            / workflow.feature_id
        ).resolve()
        if subordinate_home == workflow.feature_home.resolve():
            continue
        if not subordinate_home.is_dir():
            continue
        duplicates = sorted(
            item for item in subordinate_home.iterdir() if item.name.startswith("pr-")
        )
        if duplicates:
            rendered = ", ".join(str(item) for item in duplicates)
            raise BoundaryPacketError(
                "Subordinate evidence packets violate centralized ownership: "
                f"{rendered}"
            )


def _normalize_changed_paths(paths: Sequence[str]) -> tuple[str, ...]:
    normalized = []
    for raw in paths:
        path = PurePosixPath(raw)
        if path.is_absolute() or not path.parts or any(
            part in {"", ".", ".."} for part in path.parts
        ):
            raise BoundaryPacketError(
                f"Changed path must be feature-home-relative and safe: {raw!r}"
            )
        value = path.as_posix()
        if value not in normalized:
            normalized.append(value)
    return tuple(normalized)


def _git_output(args: Sequence[str], cwd: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(cwd), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "git command failed"
        raise BoundaryPacketError(detail)
    return result.stdout.strip()


def _derived_changed_paths(
    workflow: WorkflowContext,
    context: PullRequestContext,
) -> tuple[tuple[str, ...], str]:
    try:
        evidence_root = Path(
            _git_output(["rev-parse", "--show-toplevel"], workflow.feature_home)
        ).resolve()
    except BoundaryPacketError as error:
        raise BoundaryPacketError(
            "Feature home is not in a Git repository; pass explicit --changed-path "
            "values from the coordination layer"
        ) from error
    if evidence_root != context.repository_root:
        raise BoundaryPacketError(
            "Evidence and code use different Git repositories; pass explicit "
            "--changed-path values from the coordination commit"
        )
    dirty = _git_output(
        ["status", "--porcelain=v1", "--untracked-files=all"], evidence_root
    )
    if dirty:
        preview = "\n".join(dirty.splitlines()[:8])
        raise BoundaryPacketError(
            "Evidence repository must be clean before Git-derived packet validation:\n"
            f"{preview}"
        )
    try:
        feature_relative = workflow.feature_home.resolve().relative_to(evidence_root)
    except ValueError as error:
        raise BoundaryPacketError("Feature home escapes its evidence repository") from error
    output = _git_output(
        [
            "diff",
            "--name-only",
            "--no-renames",
            f"{context.merge_base_sha}..HEAD",
        ],
        evidence_root,
    )
    result = []
    for raw in output.splitlines():
        if not raw:
            continue
        try:
            relative = PurePosixPath(raw).relative_to(PurePosixPath(feature_relative.as_posix()))
        except ValueError:
            continue
        result.append(relative.as_posix())
    return _normalize_changed_paths(result), "git"


def _validate_prior_packet_immutability(
    changed_paths: Sequence[str],
    current_packet: str,
) -> None:
    for path in changed_paths:
        top = PurePosixPath(path).parts[0]
        if top.startswith("pr-") and top != current_packet:
            raise BoundaryPacketError(
                f"Current boundary changes earlier or foreign packet {top}: {path}"
            )


def validate_packet(
    workflow: WorkflowContext,
    context: PullRequestContext,
    *,
    changed_paths: Sequence[str] | None = None,
) -> dict[str, object]:
    _validate_context_alignment(workflow, context)
    expected_name = packet_name(workflow, context.pull_request.number)
    packet = packet_path(workflow, context.pull_request.number)
    if not PACKET_NAME.fullmatch(expected_name):
        raise BoundaryPacketError(f"Derived packet name is invalid: {expected_name}")
    if not packet.is_dir() or packet.is_symlink():
        raise BoundaryPacketError(f"Expected packet directory does not exist: {packet}")
    _validate_centralized_ownership(workflow, packet)

    manifest_path = packet / "boundary.json"
    if manifest_path.is_symlink():
        raise BoundaryPacketError("boundary.json must not be a symbolic link")
    manifest = _exact_keys(
        _load_json(manifest_path, "boundary manifest"),
        MANIFEST_KEYS,
        "boundary.json",
    )
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        raise BoundaryPacketError(
            f"boundary.json schemaVersion must be {SCHEMA_VERSION}"
        )
    scope = _required_string(manifest.get("scope"), "boundary.json.scope")
    if scope not in SCOPES:
        raise BoundaryPacketError(f"boundary.json.scope must be one of {sorted(SCOPES)}")
    if manifest.get("featureId") != workflow.feature_id:
        raise BoundaryPacketError("boundary.json featureId differs from workflow context")
    if manifest.get("repositoryAlias") != workflow.repository.alias:
        raise BoundaryPacketError("boundary.json repositoryAlias differs from workflow context")
    if manifest.get("packetId") != expected_name:
        raise BoundaryPacketError(
            f"boundary.json packetId must be {expected_name!r}"
        )
    expected_pr = context.pull_request.to_dict()
    if manifest.get("pullRequest") != expected_pr:
        raise BoundaryPacketError("boundary.json pullRequest differs from pinned PR context")
    if _required_sha(manifest.get("mergeBaseSha"), "mergeBaseSha") != context.merge_base_sha:
        raise BoundaryPacketError("boundary.json mergeBaseSha differs from pinned context")
    evaluated = _required_sha(manifest.get("evaluatedSourceSha"), "evaluatedSourceSha")
    if evaluated != context.evaluated_source_sha:
        raise BoundaryPacketError(
            "boundary.json evaluatedSourceSha differs from pinned context"
        )
    feature_base = manifest.get("featureBaseSha")
    if scope == "feature-final":
        manifest_feature_base = _required_sha(feature_base, "featureBaseSha")
        try:
            expected_feature_base = effective_feature_base(workflow, context)
        except FeatureFinalError as error:
            raise BoundaryPacketError(str(error)) from error
        if manifest_feature_base != expected_feature_base:
            raise BoundaryPacketError(
                "boundary.json featureBaseSha differs from the authoritative "
                "feature-final context"
            )
    elif feature_base is not None:
        raise BoundaryPacketError("Slice packets must set featureBaseSha to null")

    applicability = _exact_keys(
        manifest.get("applicability"), CONDITIONAL_GATES, "applicability"
    )
    for gate, applicable in applicability.items():
        if not isinstance(applicable, bool):
            raise BoundaryPacketError(f"applicability.{gate} must be boolean")
    gates = _exact_keys(manifest.get("gates"), set(ARTIFACTS), "gates")
    normalized_gates = {}
    for gate, value in gates.items():
        normalized_gates[gate] = _validate_gate(
            gate,
            value,
            bool(applicability.get(gate, True)),
            packet,
        )

    expected_files = {"boundary.json"}
    for gate, artifact in ARTIFACTS.items():
        if gate in CORE_GATES or normalized_gates[gate]["disposition"] != "not_applicable":
            expected_files.add(artifact)
    actual_files = {item.name for item in packet.iterdir()}
    if actual_files != expected_files:
        raise BoundaryPacketError(
            "Packet files differ from the manifest contract: expected "
            f"{sorted(expected_files)}, found {sorted(actual_files)}"
        )

    _validate_tracker_link(
        workflow.feature_home, context.pull_request.number, expected_name
    )
    if changed_paths is None:
        normalized_changes, change_source = _derived_changed_paths(workflow, context)
    else:
        normalized_changes = _normalize_changed_paths(changed_paths)
        change_source = "explicit"
    _validate_prior_packet_immutability(normalized_changes, expected_name)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "valid",
        "featureId": workflow.feature_id,
        "packetId": expected_name,
        "packetPath": str(packet.resolve()),
        "repositoryAlias": workflow.repository.alias,
        "pullRequestNumber": context.pull_request.number,
        "evaluatedSourceSha": context.evaluated_source_sha,
        "scope": scope,
        "changeSource": change_source,
        "changedFeaturePaths": list(normalized_changes),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    path_parser = subparsers.add_parser("path", help="Resolve the active PR packet path")
    path_parser.add_argument("--cwd", default=".")
    path_parser.add_argument("--repository")
    path_parser.add_argument("--pr-number", required=True, type=int)

    validate_parser = subparsers.add_parser("validate", help="Validate one boundary packet")
    validate_parser.add_argument("--cwd", default=".")
    validate_parser.add_argument("--repository")
    validate_parser.add_argument("--context", required=True)
    validate_parser.add_argument(
        "--changed-path",
        action="append",
        default=None,
        help="Feature-home-relative changed path; repeat for coordination commits",
    )
    validate_parser.add_argument("--json", action="store_true")

    args = parser.parse_args()
    try:
        workflow = resolve_workflow_context(
            args.cwd, repository_alias=args.repository
        )
        if args.command == "path":
            print(packet_path(workflow, args.pr_number))
            return 0
        context = load_context(args.context)
        result = validate_packet(
            workflow,
            context,
            changed_paths=args.changed_path,
        )
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"PASS: {result['packetId']} is valid")
        return 0
    except (BoundaryPacketError, PullRequestContextError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
