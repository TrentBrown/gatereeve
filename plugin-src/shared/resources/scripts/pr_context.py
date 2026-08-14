#!/usr/bin/env python3
"""Resolve and verify one authoritative pull-request boundary context."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Callable, Mapping, Sequence

from workflow_context import RepositoryContext, resolve_workflow_context


SCHEMA_VERSION = 1
SHA = re.compile(r"^[0-9a-fA-F]{40,64}$")
CommandRunner = Callable[[str, Sequence[str], Path, Mapping[str, str] | None], str]


class PullRequestContextError(RuntimeError):
    """Raised when a pull request cannot provide a safe boundary context."""


def default_command_runner(
    executable: str,
    args: Sequence[str],
    cwd: Path,
    environment: Mapping[str, str] | None,
) -> str:
    result = subprocess.run(
        [executable, *args],
        cwd=str(cwd),
        check=False,
        capture_output=True,
        text=True,
        env=dict(environment) if environment is not None else None,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "command failed"
        raise PullRequestContextError(
            f"{executable} {' '.join(args)} failed: {detail}"
        )
    return result.stdout.strip()


def _required_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PullRequestContextError(f"{label} must be a nonempty string")
    return value.strip()


def _required_sha(value: object, label: str) -> str:
    sha = _required_string(value, label).lower()
    if not SHA.fullmatch(sha):
        raise PullRequestContextError(f"{label} must be a full hexadecimal object ID")
    return sha


def _required_number(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise PullRequestContextError(f"{label} must be a positive integer")
    return value


@dataclass(frozen=True)
class PullRequestSnapshot:
    repository: str
    number: int
    url: str
    state: str
    is_draft: bool
    base_branch: str
    base_sha: str
    head_branch: str
    head_sha: str

    @classmethod
    def from_dict(cls, value: object) -> "PullRequestSnapshot":
        if not isinstance(value, dict):
            raise PullRequestContextError("Pull-request data must be a JSON object")
        is_draft = value.get("isDraft")
        if not isinstance(is_draft, bool):
            raise PullRequestContextError("pullRequest.isDraft must be boolean")
        return cls(
            repository=_required_string(value.get("repository"), "pullRequest.repository"),
            number=_required_number(value.get("number"), "pullRequest.number"),
            url=_required_string(value.get("url"), "pullRequest.url"),
            state=_required_string(value.get("state"), "pullRequest.state").upper(),
            is_draft=is_draft,
            base_branch=_required_string(
                value.get("baseRefName"), "pullRequest.baseRefName"
            ),
            base_sha=_required_sha(value.get("baseRefOid"), "pullRequest.baseRefOid"),
            head_branch=_required_string(
                value.get("headRefName"), "pullRequest.headRefName"
            ),
            head_sha=_required_sha(value.get("headRefOid"), "pullRequest.headRefOid"),
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "repository": self.repository,
            "number": self.number,
            "url": self.url,
            "state": self.state,
            "isDraft": self.is_draft,
            "baseRefName": self.base_branch,
            "baseRefOid": self.base_sha,
            "headRefName": self.head_branch,
            "headRefOid": self.head_sha,
        }


@dataclass(frozen=True)
class PullRequestContext:
    repository_root: Path
    repository_alias: str
    remote: str
    source: str
    pull_request: PullRequestSnapshot
    merge_base_sha: str
    evaluated_source_sha: str
    feature_base_sha: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "source": self.source,
            "repositoryRoot": str(self.repository_root),
            "repositoryAlias": self.repository_alias,
            "remote": self.remote,
            "pullRequest": self.pull_request.to_dict(),
            "mergeBaseSha": self.merge_base_sha,
            "evaluatedSourceSha": self.evaluated_source_sha,
            "featureBaseSha": self.feature_base_sha,
        }

    @classmethod
    def from_dict(cls, value: object) -> "PullRequestContext":
        if not isinstance(value, dict) or value.get("schemaVersion") != SCHEMA_VERSION:
            raise PullRequestContextError(
                f"PR context schemaVersion must be {SCHEMA_VERSION}"
            )
        source = _required_string(value.get("source"), "source")
        if source not in {"github", "explicit"}:
            raise PullRequestContextError(f"Unsupported PR context source: {source}")
        pull_request = PullRequestSnapshot.from_dict(value.get("pullRequest"))
        evaluated_source_sha = _required_sha(
            value.get("evaluatedSourceSha"), "evaluatedSourceSha"
        )
        if evaluated_source_sha != pull_request.head_sha:
            raise PullRequestContextError(
                "evaluatedSourceSha must equal the originally resolved PR head"
            )
        raw_feature_base = value.get("featureBaseSha")
        feature_base_sha = (
            _required_sha(raw_feature_base, "featureBaseSha")
            if raw_feature_base is not None
            else None
        )
        return cls(
            repository_root=Path(
                _required_string(value.get("repositoryRoot"), "repositoryRoot")
            ).expanduser().resolve(),
            repository_alias=_required_string(
                value.get("repositoryAlias"), "repositoryAlias"
            ),
            remote=_required_string(value.get("remote"), "remote"),
            source=source,
            pull_request=pull_request,
            merge_base_sha=_required_sha(value.get("mergeBaseSha"), "mergeBaseSha"),
            evaluated_source_sha=evaluated_source_sha,
            feature_base_sha=feature_base_sha,
        )


class GitRepository:
    def __init__(
        self,
        repository: RepositoryContext,
        *,
        git_executable: str = "git",
        runner: CommandRunner = default_command_runner,
        environment: Mapping[str, str] | None = None,
    ) -> None:
        self.context = repository
        self.root = repository.path.resolve()
        self.remote = repository.remote
        self.git_executable = git_executable
        self.runner = runner
        self.environment = environment

    def git(self, *args: str) -> str:
        return self.runner(
            self.git_executable,
            ["-C", str(self.root), *args],
            self.root,
            self.environment,
        )

    def branch(self) -> str:
        branch = self.git("branch", "--show-current")
        if not branch:
            raise PullRequestContextError("A formal PR boundary cannot use detached HEAD")
        return branch

    def head(self) -> str:
        return _required_sha(self.git("rev-parse", "HEAD"), "local HEAD")

    def require_clean(self) -> None:
        status = self.git("status", "--porcelain=v1", "--untracked-files=all")
        if status:
            preview = "\n".join(status.splitlines()[:8])
            raise PullRequestContextError(
                "Target repository is dirty; commit or remove intended changes before "
                f"the PR boundary:\n{preview}"
            )

    def ensure_commit(self, sha: str, branch: str) -> None:
        try:
            self.git("cat-file", "-e", f"{sha}^{{commit}}")
            return
        except PullRequestContextError:
            self.git("fetch", "--no-tags", self.remote, branch)
        self.git("cat-file", "-e", f"{sha}^{{commit}}")

    def require_branch_name(self, branch: str, label: str) -> None:
        try:
            self.git("check-ref-format", "--branch", branch)
        except PullRequestContextError as error:
            raise PullRequestContextError(
                f"{label} is not a valid Git branch name: {branch!r}"
            ) from error

    def merge_base(self, base_sha: str, head_sha: str) -> str:
        return _required_sha(
            self.git("merge-base", base_sha, head_sha), "merge base"
        )

    def changed_paths(self, old_sha: str, new_sha: str) -> tuple[str, ...]:
        output = self.git("diff", "--name-only", "--no-renames", f"{old_sha}..{new_sha}")
        return tuple(line for line in output.splitlines() if line)

    def require_ancestor(self, old_sha: str, new_sha: str) -> None:
        try:
            self.git("merge-base", "--is-ancestor", old_sha, new_sha)
        except PullRequestContextError as error:
            raise PullRequestContextError(
                "Current PR head does not descend from evaluatedSourceSha"
            ) from error


def _github_repository_from_remote(remote_url: str) -> str | None:
    patterns = (
        r"^(?:https?://|ssh://git@)github\.com[/:]([^/]+/[^/]+?)(?:\.git)?$",
        r"^git@github\.com:([^/]+/[^/]+?)(?:\.git)?$",
    )
    for pattern in patterns:
        match = re.fullmatch(pattern, remote_url.strip())
        if match:
            return match.group(1).removesuffix(".git")
    return None


class PullRequestProvider:
    source = "explicit"

    def snapshot(self, selector: str | None = None) -> PullRequestSnapshot:
        raise NotImplementedError


class ExplicitPullRequestProvider(PullRequestProvider):
    source = "explicit"

    def __init__(self, data: object) -> None:
        self.data = data

    @classmethod
    def from_file(cls, path: str | Path) -> "ExplicitPullRequestProvider":
        source = Path(path).expanduser().resolve()
        try:
            return cls(json.loads(source.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError) as error:
            raise PullRequestContextError(
                f"Cannot read explicit PR data from {source}: {error}"
            ) from error

    def snapshot(self, selector: str | None = None) -> PullRequestSnapshot:
        snapshot = PullRequestSnapshot.from_dict(self.data)
        if selector and selector not in {str(snapshot.number), snapshot.url}:
            raise PullRequestContextError(
                f"Explicit PR data does not match selector {selector!r}"
            )
        return snapshot


class GitHubPullRequestProvider(PullRequestProvider):
    source = "github"

    def __init__(
        self,
        repository_root: str | Path,
        *,
        gh_executable: str = "gh",
        runner: CommandRunner = default_command_runner,
        environment: Mapping[str, str] | None = None,
    ) -> None:
        self.repository_root = Path(repository_root).resolve()
        self.gh_executable = gh_executable
        self.runner = runner
        self.environment = environment

    def gh(self, *args: str) -> str:
        return self.runner(
            self.gh_executable,
            list(args),
            self.repository_root,
            self.environment,
        )

    def snapshot(self, selector: str | None = None) -> PullRequestSnapshot:
        try:
            repository_payload = json.loads(
                self.gh("repo", "view", "--json", "nameWithOwner")
            )
            repository = _required_string(
                repository_payload.get("nameWithOwner"), "GitHub repository"
            )
            args = ["pr", "view"]
            if selector:
                args.append(selector)
            args.extend(
                [
                    "--repo",
                    repository,
                    "--json",
                    (
                        "number,url,state,isDraft,baseRefName,baseRefOid,"
                        "headRefName,headRefOid"
                    ),
                ]
            )
            payload = json.loads(self.gh(*args))
        except json.JSONDecodeError as error:
            raise PullRequestContextError(f"gh returned invalid JSON: {error}") from error
        payload["repository"] = repository
        return PullRequestSnapshot.from_dict(payload)


def _validate_snapshot_identity(
    snapshot: PullRequestSnapshot,
    repository: GitRepository,
) -> None:
    if snapshot.state != "OPEN":
        raise PullRequestContextError(
            f"Pull request #{snapshot.number} is {snapshot.state}, not OPEN"
        )
    if not snapshot.is_draft:
        raise PullRequestContextError(
            f"Pull request #{snapshot.number} must be draft when the boundary begins"
        )
    configured_repository = _github_repository_from_remote(
        repository.git("remote", "get-url", repository.remote)
    )
    if configured_repository and configured_repository.casefold() != snapshot.repository.casefold():
        raise PullRequestContextError(
            f"Pull request repository {snapshot.repository!r} does not match "
            f"{repository.remote} ({configured_repository})"
        )


def _validate_local_source(
    snapshot: PullRequestSnapshot,
    repository: GitRepository,
) -> None:
    repository.require_clean()
    local_branch = repository.branch()
    if local_branch != snapshot.head_branch:
        raise PullRequestContextError(
            f"Local branch {local_branch!r} differs from PR head branch "
            f"{snapshot.head_branch!r}"
        )
    local_head = repository.head()
    if local_head != snapshot.head_sha:
        raise PullRequestContextError(
            f"Local HEAD {local_head} differs from pushed PR head {snapshot.head_sha}; "
            "push committed work or update the checkout before continuing"
        )


def resolve_pull_request_context(
    repository_context: RepositoryContext,
    provider: PullRequestProvider,
    *,
    selector: str | None = None,
    git_executable: str = "git",
    runner: CommandRunner = default_command_runner,
    environment: Mapping[str, str] | None = None,
) -> PullRequestContext:
    repository = GitRepository(
        repository_context,
        git_executable=git_executable,
        runner=runner,
        environment=environment,
    )
    snapshot = provider.snapshot(selector)
    _validate_snapshot_identity(snapshot, repository)
    repository.require_branch_name(snapshot.base_branch, "PR base branch")
    repository.require_branch_name(snapshot.head_branch, "PR head branch")
    _validate_local_source(snapshot, repository)
    repository.ensure_commit(snapshot.base_sha, snapshot.base_branch)
    repository.ensure_commit(snapshot.head_sha, snapshot.head_branch)
    merge_base = repository.merge_base(snapshot.base_sha, snapshot.head_sha)
    return PullRequestContext(
        repository_root=repository.root,
        repository_alias=repository_context.alias,
        remote=repository.remote,
        source=provider.source,
        pull_request=snapshot,
        merge_base_sha=merge_base,
        evaluated_source_sha=snapshot.head_sha,
        feature_base_sha=repository_context.feature_base_sha,
    )


def _repository_for_context(context: PullRequestContext) -> RepositoryContext:
    return RepositoryContext(
        alias=context.repository_alias,
        path=context.repository_root,
        remote=context.remote,
        integration_branch=context.pull_request.base_branch,
        feature_base_sha=context.feature_base_sha,
    )


def verify_context_is_current(
    context: PullRequestContext,
    provider: PullRequestProvider,
    *,
    git_executable: str = "git",
    runner: CommandRunner = default_command_runner,
    environment: Mapping[str, str] | None = None,
) -> dict[str, object]:
    repository = GitRepository(
        _repository_for_context(context),
        git_executable=git_executable,
        runner=runner,
        environment=environment,
    )
    current = provider.snapshot(str(context.pull_request.number))
    _require_same_pull_request(context.pull_request, current)
    if repository.branch() != context.pull_request.head_branch:
        raise PullRequestContextError("Local branch changed after PR context resolution")
    if current.head_sha != context.evaluated_source_sha:
        raise PullRequestContextError(
            f"PR head became stale: evaluated {context.evaluated_source_sha}, "
            f"current remote head {current.head_sha}; rerun affected gates"
        )
    if repository.head() != context.evaluated_source_sha:
        raise PullRequestContextError(
            "Local HEAD changed after evaluation; rerun affected gates before finalizing"
        )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "current",
        "pullRequest": current.to_dict(),
        "evaluatedSourceSha": context.evaluated_source_sha,
    }


def _require_same_pull_request(
    expected: PullRequestSnapshot,
    current: PullRequestSnapshot,
) -> None:
    comparisons = (
        ("repository", expected.repository, current.repository),
        ("number", expected.number, current.number),
        ("URL", expected.url, current.url),
        ("base branch", expected.base_branch, current.base_branch),
        ("head branch", expected.head_branch, current.head_branch),
    )
    for label, old, new in comparisons:
        if old != new:
            raise PullRequestContextError(
                f"Pull-request {label} changed after context resolution: {old!r} -> {new!r}"
            )
    if current.state != "OPEN":
        raise PullRequestContextError(
            f"Pull request #{current.number} is no longer OPEN ({current.state})"
        )


def _normalize_evidence_paths(paths: Sequence[str]) -> tuple[str, ...]:
    normalized: list[str] = []
    for raw in paths:
        path = PurePosixPath(raw)
        if path.is_absolute() or not path.parts or any(part in {"", ".", ".."} for part in path.parts):
            raise PullRequestContextError(
                f"Evidence path must be a safe repository-relative path: {raw!r}"
            )
        value = path.as_posix().rstrip("/")
        if value not in normalized:
            normalized.append(value)
    return tuple(normalized)


def _is_declared(path: str, declared: Sequence[str]) -> bool:
    return any(path == item or path.startswith(f"{item}/") for item in declared)


def finalize_pull_request_context(
    context: PullRequestContext,
    provider: PullRequestProvider,
    *,
    evidence_paths: Sequence[str] = (),
    git_executable: str = "git",
    runner: CommandRunner = default_command_runner,
    environment: Mapping[str, str] | None = None,
) -> dict[str, object]:
    repository = GitRepository(
        _repository_for_context(context),
        git_executable=git_executable,
        runner=runner,
        environment=environment,
    )
    current = provider.snapshot(str(context.pull_request.number))
    _require_same_pull_request(context.pull_request, current)
    repository.require_clean()
    if repository.branch() != context.pull_request.head_branch:
        raise PullRequestContextError("Local branch changed after PR context resolution")
    local_head = repository.head()
    if local_head != current.head_sha:
        raise PullRequestContextError(
            f"Final local HEAD {local_head} differs from remote PR head {current.head_sha}"
        )

    declared = _normalize_evidence_paths(evidence_paths)
    changed: tuple[str, ...] = ()
    if local_head != context.evaluated_source_sha:
        repository.require_ancestor(context.evaluated_source_sha, local_head)
        changed = repository.changed_paths(context.evaluated_source_sha, local_head)
        undeclared = [path for path in changed if not _is_declared(path, declared)]
        if undeclared:
            raise PullRequestContextError(
                "Changes after evaluatedSourceSha include undeclared non-evidence paths: "
                + ", ".join(undeclared)
            )
        if not declared:
            raise PullRequestContextError(
                "PR head advanced after evaluation without declared evidence paths"
            )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "synchronized",
        "pullRequest": current.to_dict(),
        "evaluatedSourceSha": context.evaluated_source_sha,
        "finalHeadSha": local_head,
        "declaredEvidencePaths": list(declared),
        "evidenceChanges": list(changed),
    }


def load_context(path: str | Path) -> PullRequestContext:
    source = Path(path).expanduser().resolve()
    try:
        return PullRequestContext.from_dict(
            json.loads(source.read_text(encoding="utf-8"))
        )
    except (OSError, json.JSONDecodeError) as error:
        raise PullRequestContextError(f"Cannot read PR context from {source}: {error}") from error


def _write_json(path: str | Path, value: object) -> None:
    target = Path(path).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    temporary.write_text(f"{json.dumps(value, indent=2)}\n", encoding="utf-8")
    temporary.replace(target)


def _provider_for(
    explicit_path: str | None,
    repository_root: Path,
) -> PullRequestProvider:
    if explicit_path:
        return ExplicitPullRequestProvider.from_file(explicit_path)
    return GitHubPullRequestProvider(repository_root)


def _print_result(value: object, output: str | None) -> None:
    if output:
        _write_json(output, value)
    print(json.dumps(value, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    resolve_parser = subparsers.add_parser(
        "resolve", help="Resolve and preflight one draft pull request"
    )
    resolve_parser.add_argument("--cwd", default=".")
    resolve_parser.add_argument("--repository")
    resolve_parser.add_argument("--pr", help="PR number or URL; defaults to current branch")
    resolve_parser.add_argument("--pr-data", help="Explicit PR JSON instead of gh")
    resolve_parser.add_argument("--output")

    current_parser = subparsers.add_parser(
        "check-current", help="Fail if the pinned PR source changed"
    )
    current_parser.add_argument("--context", required=True)
    current_parser.add_argument("--pr-data", help="Explicit current PR JSON instead of gh")
    current_parser.add_argument("--output")

    finalize_parser = subparsers.add_parser(
        "finalize", help="Verify declared evidence deltas and final synchronization"
    )
    finalize_parser.add_argument("--context", required=True)
    finalize_parser.add_argument("--pr-data", help="Explicit final PR JSON instead of gh")
    finalize_parser.add_argument("--evidence-path", action="append", default=[])
    finalize_parser.add_argument("--output")

    args = parser.parse_args()
    try:
        if args.command == "resolve":
            workflow = resolve_workflow_context(
                args.cwd, repository_alias=args.repository
            )
            provider = _provider_for(args.pr_data, workflow.repository.path)
            context = resolve_pull_request_context(
                workflow.repository,
                provider,
                selector=args.pr,
            )
            _print_result(context.to_dict(), args.output)
            return 0

        context = load_context(args.context)
        provider = _provider_for(args.pr_data, context.repository_root)
        if args.command == "check-current":
            result = verify_context_is_current(context, provider)
        else:
            result = finalize_pull_request_context(
                context, provider, evidence_paths=args.evidence_path
            )
        _print_result(result, args.output)
        return 0
    except PullRequestContextError as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
