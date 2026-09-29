#!/usr/bin/env python3
"""Publish and promote exact-tree synthetic review commits without opening a PR."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path, PurePosixPath
from typing import Mapping, Sequence

from boundary_context import (
    BoundaryContext,
    BoundaryContextError,
    load_context,
)
from workflow_context import (
    RepositoryContext,
    WorkflowContextError,
    resolve_workflow_context,
)


SCHEMA_VERSION = 1
SHA = re.compile(r"^[0-9a-fA-F]{40,64}$")


class SyntheticReviewError(RuntimeError):
    """Raised when a synthetic review cannot proceed without weakening safety."""


class GitRepository:
    def __init__(self, repository: RepositoryContext, git_executable: str = "git") -> None:
        self.context = repository
        self.root = repository.path.resolve()
        self.remote = repository.remote
        self.git_executable = git_executable

    def git(
        self,
        *args: str,
        environment: Mapping[str, str] | None = None,
    ) -> str:
        result = subprocess.run(
            [self.git_executable, "-C", str(self.root), *args],
            check=False,
            capture_output=True,
            text=True,
            env=dict(environment) if environment is not None else None,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "git command failed"
            raise SyntheticReviewError(
                f"git {' '.join(args)} failed: {detail}"
            )
        return result.stdout.strip()

    def require_clean(self) -> None:
        status = self.git("status", "--porcelain=v1", "--untracked-files=all")
        if status:
            preview = "\n".join(status.splitlines()[:8])
            raise SyntheticReviewError(
                "Synthetic review requires a clean checkout:\n" + preview
            )

    def branch(self) -> str:
        branch = self.git("branch", "--show-current")
        if not branch:
            raise SyntheticReviewError("Synthetic review cannot use detached HEAD")
        return branch

    def head(self) -> str:
        return _required_sha(self.git("rev-parse", "HEAD"), "local HEAD")

    def tree(self, revision: str = "HEAD") -> str:
        return _required_sha(
            self.git("rev-parse", f"{revision}^{{tree}}"), "tree object"
        )

    def remote_ref(self, full_ref: str) -> str | None:
        output = self.git("ls-remote", "--refs", self.remote, full_ref)
        if not output:
            return None
        rows = output.splitlines()
        if len(rows) != 1:
            raise SyntheticReviewError(f"Remote ref lookup was ambiguous: {full_ref}")
        sha, reported_ref = rows[0].split(maxsplit=1)
        if reported_ref != full_ref:
            raise SyntheticReviewError(f"Remote returned an unexpected ref: {reported_ref}")
        return _required_sha(sha, full_ref)


def _required_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SyntheticReviewError(f"{label} must be a nonempty string")
    return value.strip()


def _required_sha(value: object, label: str) -> str:
    result = _required_string(value, label).lower()
    if not SHA.fullmatch(result):
        raise SyntheticReviewError(f"{label} must be a full hexadecimal object ID")
    return result


def _fingerprint(value: object) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _safe_paths(paths: Sequence[str]) -> tuple[str, ...]:
    normalized: list[str] = []
    for raw in paths:
        path = PurePosixPath(raw)
        if path.is_absolute() or not path.parts or any(
            part in {"", ".", ".."} for part in path.parts
        ):
            raise SyntheticReviewError(
                f"Evidence path must be a safe repository-relative path: {raw!r}"
            )
        value = path.as_posix().rstrip("/")
        if value not in normalized:
            normalized.append(value)
    return tuple(normalized)


def _is_declared(path: str, declared: Sequence[str]) -> bool:
    return any(path == item or path.startswith(f"{item}/") for item in declared)


def _github_repository(remote_url: str) -> str | None:
    patterns = (
        r"^(?:https?://|ssh://git@)github\.com[/:]([^/]+/[^/]+?)(?:\.git)?$",
        r"^git@github\.com:([^/]+/[^/]+?)(?:\.git)?$",
    )
    for pattern in patterns:
        match = re.fullmatch(pattern, remote_url.strip())
        if match:
            return match.group(1).removesuffix(".git")
    return None


def _repository_for(context: BoundaryContext) -> RepositoryContext:
    return RepositoryContext(
        alias=context.repository_alias,
        path=context.repository_root,
        remote=context.remote,
        integration_branch=context.base_branch,
        release_branch=context.base_branch,
        slice_boundary_mode="synthetic-commit",
        feature_base_sha=context.feature_base_sha,
    )


def resolve_synthetic_context(
    repository_context: RepositoryContext,
    feature_id: str,
    *,
    git_executable: str = "git",
) -> BoundaryContext:
    if repository_context.slice_boundary_mode != "synthetic-commit":
        raise SyntheticReviewError(
            "Repository sliceBoundaryMode is not synthetic-commit"
        )
    repository = GitRepository(repository_context, git_executable)
    repository.require_clean()
    branch = repository.branch()
    if branch == repository_context.integration_branch:
        raise SyntheticReviewError(
            "Synthetic candidate must be on a topic branch, not the integration branch"
        )
    repository.git(
        "fetch",
        "--no-tags",
        repository.remote,
        repository_context.integration_branch,
    )
    base_ref = f"refs/remotes/{repository.remote}/{repository_context.integration_branch}"
    base_sha = _required_sha(repository.git("rev-parse", base_ref), "integration SHA")
    remote_sha = repository.remote_ref(
        f"refs/heads/{repository_context.integration_branch}"
    )
    if remote_sha != base_sha:
        raise SyntheticReviewError(
            "Fetched integration ref differs from the current remote integration ref"
        )
    head_sha = repository.head()
    merge_base = _required_sha(
        repository.git("merge-base", base_sha, head_sha), "merge base"
    )
    if merge_base != base_sha:
        raise SyntheticReviewError(
            "Candidate does not descend from the pinned integration commit"
        )
    review_id = f"{repository_context.alias}-{head_sha[:12]}"
    review_ref = (
        f"refs/heads/review/{feature_id}/{repository_context.alias}/{head_sha[:12]}"
    )
    repository.git("check-ref-format", review_ref)
    return BoundaryContext(
        repository_root=repository.root,
        repository_alias=repository_context.alias,
        remote=repository.remote,
        source="git",
        transport="synthetic-commit",
        base_branch=repository_context.integration_branch,
        base_sha=base_sha,
        head_branch=branch,
        head_sha=head_sha,
        merge_base_sha=merge_base,
        evaluated_source_sha=head_sha,
        feature_base_sha=repository_context.feature_base_sha,
        review={
            "mode": "synthetic-commit",
            "reviewId": review_id,
            "candidateSourceSha": head_sha,
            "reviewRef": review_ref,
        },
    )


def _require_context_current(
    context: BoundaryContext,
    repository: GitRepository,
    *,
    evidence_paths: Sequence[str] = (),
) -> tuple[str, str, tuple[str, ...], tuple[str, ...]]:
    if context.transport != "synthetic-commit":
        raise SyntheticReviewError("Synthetic command requires synthetic-commit context")
    repository.require_clean()
    if repository.branch() != context.head_branch:
        raise SyntheticReviewError("Local branch changed after context resolution")
    current_base = repository.remote_ref(f"refs/heads/{context.base_branch}")
    if current_base != context.base_sha:
        raise SyntheticReviewError(
            f"Integration branch moved: pinned {context.base_sha}, current {current_base}"
        )
    local_head = repository.head()
    declared = _safe_paths(evidence_paths)
    changed: tuple[str, ...] = ()
    if local_head != context.evaluated_source_sha:
        try:
            repository.git(
                "merge-base", "--is-ancestor", context.evaluated_source_sha, local_head
            )
        except SyntheticReviewError as error:
            raise SyntheticReviewError(
                "Final source does not descend from evaluatedSourceSha"
            ) from error
        changed = tuple(
            line
            for line in repository.git(
                "diff",
                "--name-only",
                "--no-renames",
                f"{context.evaluated_source_sha}..{local_head}",
            ).splitlines()
            if line
        )
        undeclared = [path for path in changed if not _is_declared(path, declared)]
        if undeclared:
            raise SyntheticReviewError(
                "Changes after evaluatedSourceSha include undeclared non-evidence paths: "
                + ", ".join(undeclared)
            )
        if not declared:
            raise SyntheticReviewError(
                "Source advanced after evaluation without declared evidence paths"
            )
    return local_head, repository.tree(local_head), declared, changed


def publish_review(
    context: BoundaryContext,
    *,
    evidence_paths: Sequence[str] = (),
    message: str = "Synthetic review commit",
    github_repository: str | None = None,
    git_executable: str = "git",
    environment: Mapping[str, str] | None = None,
) -> dict[str, object]:
    repository = GitRepository(_repository_for(context), git_executable)
    final_head, tree_sha, declared, changed = _require_context_current(
        context, repository, evidence_paths=evidence_paths
    )
    review_ref = _required_string(context.review.get("reviewRef"), "review.reviewRef")
    if repository.remote_ref(review_ref) is not None:
        raise SyntheticReviewError(
            f"Synthetic review ref already exists and will not be overwritten: {review_ref}"
        )
    remote_url = repository.git("remote", "get-url", repository.remote)
    github_name = github_repository or _github_repository(remote_url)
    if github_name is None:
        raise SyntheticReviewError(
            "Cannot derive a GitHub repository for the synthetic review URL"
        )
    commit_environment = dict(os.environ)
    if environment is not None:
        commit_environment.update(environment)
    review_sha = _required_sha(
        repository.git(
            "commit-tree",
            tree_sha,
            "-p",
            context.base_sha,
            "-m",
            message,
            environment=commit_environment,
        ),
        "synthetic review commit",
    )
    repository.git("push", repository.remote, f"{review_sha}:{review_ref}")
    if repository.remote_ref(review_ref) != review_sha:
        raise SyntheticReviewError("Published review ref does not name the synthetic commit")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "published",
        "transport": "synthetic-commit",
        "reviewId": context.reference,
        "contextFingerprint": _fingerprint(context.to_dict()),
        "candidateSourceSha": context.evaluated_source_sha,
        "finalHeadSha": final_head,
        "treeSha": tree_sha,
        "baseBranch": context.base_branch,
        "baseSha": context.base_sha,
        "reviewCommitSha": review_sha,
        "reviewRef": review_ref,
        "url": f"https://github.com/{github_name}/commit/{review_sha}",
        "githubRepository": github_name,
        "declaredEvidencePaths": list(declared),
        "evidenceChanges": list(changed),
        "comments": [],
        "integration": None,
    }


def _load_json(path: str | Path, label: str) -> object:
    source = Path(path).expanduser().resolve()
    try:
        return json.loads(source.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SyntheticReviewError(f"Cannot read {label} from {source}: {error}") from error


def _validate_receipt(
    context: BoundaryContext,
    value: object,
) -> dict[str, object]:
    if not isinstance(value, dict) or value.get("schemaVersion") != SCHEMA_VERSION:
        raise SyntheticReviewError("Synthetic review receipt schemaVersion must be 1")
    if value.get("transport") != "synthetic-commit":
        raise SyntheticReviewError("Receipt transport must be synthetic-commit")
    if value.get("contextFingerprint") != _fingerprint(context.to_dict()):
        raise SyntheticReviewError("Receipt context fingerprint differs from pinned context")
    if value.get("reviewId") != context.reference:
        raise SyntheticReviewError("Receipt reviewId differs from pinned context")
    for key in ("baseSha", "reviewCommitSha", "treeSha", "finalHeadSha"):
        value[key] = _required_sha(value.get(key), key)
    if value["baseSha"] != context.base_sha:
        raise SyntheticReviewError("Receipt baseSha differs from pinned context")
    if value.get("reviewRef") != context.review.get("reviewRef"):
        raise SyntheticReviewError("Receipt reviewRef differs from pinned context")
    return value


def capture_comments(
    context: BoundaryContext,
    receipt: object,
    *,
    gh_executable: str = "gh",
) -> dict[str, object]:
    normalized = _validate_receipt(context, receipt)
    repository = _required_string(
        normalized.get("githubRepository"), "githubRepository"
    )
    sha = str(normalized["reviewCommitSha"])
    result = subprocess.run(
        [
            gh_executable,
            "api",
            "--paginate",
            "--slurp",
            f"repos/{repository}/commits/{sha}/comments",
        ],
        cwd=str(context.repository_root),
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "gh api failed"
        raise SyntheticReviewError(detail)
    try:
        pages = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise SyntheticReviewError(f"gh returned invalid comment JSON: {error}") from error
    comments = []
    for page in pages:
        for item in page:
            comments.append(
                {
                    "id": item.get("id"),
                    "url": item.get("html_url"),
                    "author": item.get("user", {}).get("login"),
                    "path": item.get("path"),
                    "line": item.get("line") or item.get("position"),
                    "body": item.get("body"),
                    "createdAt": item.get("created_at"),
                }
            )
    output = dict(normalized)
    output["comments"] = comments
    output["commentsFingerprint"] = _fingerprint(comments)
    return output


def promote_review(
    context: BoundaryContext,
    receipt: object,
    acceptance: object,
    *,
    git_executable: str = "git",
) -> dict[str, object]:
    normalized = _validate_receipt(context, receipt)
    comments = normalized.get("comments")
    if not isinstance(comments, list) or normalized.get("commentsFingerprint") != _fingerprint(comments):
        raise SyntheticReviewError(
            "Commit comments must be captured and fingerprinted before promotion"
        )
    if not isinstance(acceptance, dict) or acceptance.get("accepted") is not True:
        raise SyntheticReviewError("Explicit acceptance with accepted=true is required")
    _required_string(acceptance.get("actor"), "acceptance.actor")
    review_sha = str(normalized["reviewCommitSha"])
    if _required_sha(
        acceptance.get("reviewCommitSha"), "acceptance.reviewCommitSha"
    ) != review_sha:
        raise SyntheticReviewError("Acceptance does not name the reviewed commit")
    repository = GitRepository(_repository_for(context), git_executable)
    repository.require_clean()
    if repository.branch() != context.head_branch:
        raise SyntheticReviewError("Local branch changed after context resolution")
    if repository.remote_ref(f"refs/heads/{context.base_branch}") != context.base_sha:
        raise SyntheticReviewError("Integration branch moved after review publication")
    review_ref = str(normalized["reviewRef"])
    if repository.remote_ref(review_ref) != review_sha:
        raise SyntheticReviewError("Review ref no longer names the reviewed commit")
    if repository.head() != normalized["finalHeadSha"]:
        raise SyntheticReviewError("Local finalized source changed after publication")
    if repository.tree() != normalized["treeSha"]:
        raise SyntheticReviewError("Finalized tree differs from the reviewed tree")
    commit = repository.git("cat-file", "-p", review_sha).splitlines()
    tree_lines = [line for line in commit if line.startswith("tree ")]
    parent_lines = [line for line in commit if line.startswith("parent ")]
    if tree_lines != [f"tree {normalized['treeSha']}"]:
        raise SyntheticReviewError("Synthetic commit tree differs from receipt")
    if parent_lines != [f"parent {context.base_sha}"]:
        raise SyntheticReviewError("Synthetic commit is not single-parented to pinned base")
    repository.git(
        "merge-base", "--is-ancestor", context.base_sha, review_sha
    )
    integration_ref = f"refs/heads/{context.base_branch}"
    repository.git("push", repository.remote, f"{review_sha}:{integration_ref}")
    if repository.remote_ref(integration_ref) != review_sha:
        raise SyntheticReviewError("Integration ref did not advance to reviewed commit")
    integration = {
        "schemaVersion": SCHEMA_VERSION,
        "status": "integrated",
        "transport": "synthetic-commit",
        "reviewId": context.reference,
        "reviewCommitSha": review_sha,
        "integrationBranch": context.base_branch,
        "previousIntegrationSha": context.base_sha,
        "integrationSha": review_sha,
        "acceptance": acceptance,
    }
    result = dict(normalized)
    result["status"] = "integrated"
    result["integration"] = integration
    result["integrationSha"] = review_sha
    return result


def _write_json(path: str | Path, value: object) -> None:
    target = Path(path).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    temporary.write_text(f"{json.dumps(value, indent=2)}\n", encoding="utf-8")
    temporary.replace(target)


def _print(value: object, output: str | None) -> None:
    if output:
        _write_json(output, value)
    print(json.dumps(value, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    resolve_parser = subparsers.add_parser("resolve")
    resolve_parser.add_argument("--cwd", default=".")
    resolve_parser.add_argument("--repository")
    resolve_parser.add_argument("--git-executable", default="git")
    resolve_parser.add_argument("--output")

    publish_parser = subparsers.add_parser("publish")
    publish_parser.add_argument("--context", required=True)
    publish_parser.add_argument("--evidence-path", action="append", default=[])
    publish_parser.add_argument("--message", default="Synthetic review commit")
    publish_parser.add_argument("--github-repository")
    publish_parser.add_argument("--git-executable", default="git")
    publish_parser.add_argument("--output")

    comments_parser = subparsers.add_parser("capture-comments")
    comments_parser.add_argument("--context", required=True)
    comments_parser.add_argument("--receipt", required=True)
    comments_parser.add_argument("--gh-executable", default="gh")
    comments_parser.add_argument("--output")

    promote_parser = subparsers.add_parser("promote")
    promote_parser.add_argument("--context", required=True)
    promote_parser.add_argument("--receipt", required=True)
    promote_parser.add_argument("--acceptance", required=True)
    promote_parser.add_argument("--git-executable", default="git")
    promote_parser.add_argument("--output")

    args = parser.parse_args()
    try:
        if args.command == "resolve":
            workflow = resolve_workflow_context(
                args.cwd,
                repository_alias=args.repository,
                git_executable=args.git_executable,
            )
            result = resolve_synthetic_context(
                workflow.repository,
                workflow.feature_id,
                git_executable=args.git_executable,
            ).to_dict()
        else:
            context = load_context(args.context)
            if args.command == "publish":
                result = publish_review(
                    context,
                    evidence_paths=args.evidence_path,
                    message=args.message,
                    github_repository=args.github_repository,
                    git_executable=args.git_executable,
                )
            elif args.command == "capture-comments":
                result = capture_comments(
                    context,
                    _load_json(args.receipt, "review receipt"),
                    gh_executable=args.gh_executable,
                )
            else:
                result = promote_review(
                    context,
                    _load_json(args.receipt, "review receipt"),
                    _load_json(args.acceptance, "acceptance evidence"),
                    git_executable=args.git_executable,
                )
        _print(result, args.output)
        return 0
    except (
        BoundaryContextError,
        SyntheticReviewError,
        WorkflowContextError,
    ) as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
