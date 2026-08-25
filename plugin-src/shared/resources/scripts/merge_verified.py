#!/usr/bin/env python3
"""Prove that the exact reviewed content reached an integration ref."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Sequence


SCHEMA_VERSION = 1


class MergeVerificationError(RuntimeError):
    """Raised when reviewed content cannot be proven on integration."""


def _git(
    repository: Path,
    args: Sequence[str],
    *,
    check: bool = True,
    binary: bool = False,
) -> str | bytes:
    result = subprocess.run(
        ["git", "-C", str(repository), *args],
        check=False,
        capture_output=True,
        text=not binary,
    )
    if check and result.returncode != 0:
        stderr = result.stderr.decode(errors="replace") if binary else result.stderr
        stdout = result.stdout.decode(errors="replace") if binary else result.stdout
        raise MergeVerificationError(
            (stderr or stdout or "git command failed").strip()
        )
    return result.stdout


def _commit(repository: Path, revision: str) -> str:
    value = str(_git(repository, ["rev-parse", f"{revision}^{{commit}}"])).strip()
    if len(value) != 40:
        raise MergeVerificationError(f"Revision did not resolve to a full commit: {revision}")
    return value.lower()


def _is_ancestor(repository: Path, ancestor: str, descendant: str) -> bool:
    result = subprocess.run(
        ["git", "-C", str(repository), "merge-base", "--is-ancestor", ancestor, descendant],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return True
    if result.returncode == 1:
        return False
    raise MergeVerificationError(
        (result.stderr or result.stdout or "git merge-base failed").strip()
    )


def _changed_paths(repository: Path, base: str, head: str) -> list[str]:
    output = _git(
        repository,
        ["diff", "--name-only", "--no-renames", "-z", f"{base}..{head}"],
        binary=True,
    )
    assert isinstance(output, bytes)
    return [
        item.decode("utf-8", errors="surrogateescape")
        for item in output.rstrip(b"\0").split(b"\0")
        if item
    ]


def _tree_entry(repository: Path, commit: str, path: str) -> bytes:
    output = _git(
        repository,
        ["ls-tree", "-z", commit, "--", path],
        binary=True,
    )
    assert isinstance(output, bytes)
    return output


def verify_reviewed_content(
    repository: str | Path,
    *,
    reviewed_base: str,
    reviewed_head: str,
    integration_ref: str,
) -> dict[str, object]:
    root = Path(repository).resolve()
    if not root.is_dir():
        raise MergeVerificationError(f"Repository does not exist: {root}")
    git_root = Path(str(_git(root, ["rev-parse", "--show-toplevel"])).strip()).resolve()
    if git_root != root:
        raise MergeVerificationError("Selected repository is not the Git repository root")

    base_sha = _commit(root, reviewed_base)
    head_sha = _commit(root, reviewed_head)
    integration_sha = _commit(root, integration_ref)
    if not _is_ancestor(root, base_sha, head_sha):
        raise MergeVerificationError("Reviewed base is not an ancestor of reviewed head")

    changed_paths = _changed_paths(root, base_sha, head_sha)
    if _is_ancestor(root, head_sha, integration_sha):
        method = "ancestor"
    else:
        if not _is_ancestor(root, base_sha, integration_sha):
            raise MergeVerificationError(
                "Reviewed base is not an ancestor of the integration ref"
            )
        mismatches = [
            path
            for path in changed_paths
            if _tree_entry(root, head_sha, path) != _tree_entry(root, integration_sha, path)
        ]
        if mismatches:
            raise MergeVerificationError(
                "Integration does not contain the reviewed tree entries: "
                + ", ".join(repr(path) for path in mismatches)
            )
        method = "tree-content"

    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "verified",
        "method": method,
        "repositoryRoot": str(root),
        "reviewedBaseSha": base_sha,
        "reviewedHeadSha": head_sha,
        "integrationRef": integration_ref,
        "integrationSha": integration_sha,
        "changedPaths": changed_paths,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", default=".")
    parser.add_argument("--reviewed-base", required=True)
    parser.add_argument("--reviewed-head", required=True)
    parser.add_argument("--integration-ref", required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        result = verify_reviewed_content(
            args.repository,
            reviewed_base=args.reviewed_base,
            reviewed_head=args.reviewed_head,
            integration_ref=args.integration_ref,
        )
    except MergeVerificationError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(
            f"VERIFIED {result['method']}: {result['reviewedHeadSha']} -> "
            f"{result['integrationSha']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
