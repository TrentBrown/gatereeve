#!/usr/bin/env python3
"""Prepare ordinary PRs, optionally closed until an explicitly authorized merge."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from pr_context import (
    GitHubPullRequestProvider, GitRepository, PullRequestContext,
    PullRequestContextError, _github_repository_from_remote, _print_result,
    finalize_pull_request_context, load_context, require_current_policy,
    resolve_pull_request_context,
)
from workflow_context import WorkflowContextError, resolve_workflow_context


def prepare_pull_request(repository, provider, *, title: str, body_file: str,
                         scope: str = "slice") -> PullRequestContext:
    git = GitRepository(repository)
    git.require_clean()
    head = git.branch()
    base = (repository.release_branch or repository.integration_branch
            if scope == "feature-final" else repository.integration_branch)
    if not base or head == base:
        raise PullRequestContextError("Preparation requires distinct head and configured base branches")
    if (scope == "feature-final" and base != repository.integration_branch
            and head != repository.integration_branch):
        raise PullRequestContextError("Feature-final PR must run from configured integration to release")
    name = _github_repository_from_remote(git.git("remote", "get-url", repository.remote))
    if not name:
        raise PullRequestContextError("Selected remote must identify a GitHub repository")
    if not title.strip() or not Path(body_file).is_file():
        raise PullRequestContextError("A PR title and readable body file are required")
    # Search all states: a closed PR must not look like a missing PR.
    rows = json.loads(provider.gh("pr", "list", "--repo", name, "--head", head,
                                  "--state", "all", "--limit", "100",
                                  "--json", "number,baseRefName,headRefName,state"))
    rows = [row for row in rows if row["baseRefName"] == base
            and row["headRefName"] == head and row["state"] != "MERGED"]
    if len(rows) > 1:
        raise PullRequestContextError("Multiple unmerged PRs match; resolve the ambiguity before preparation")
    if rows:
        selector = str(rows[0]["number"])
    else:
        selector = provider.gh("pr", "create", "--repo", name, "--draft", "--head", head,
                               "--base", base, "--title", title, "--body-file", str(Path(body_file).resolve()))
    # Close first, even when a newly created PR subsequently fails source validation.
    snapshot = provider.snapshot(selector)
    if (snapshot.repository != name or snapshot.head_branch != head or snapshot.base_branch != base):
        raise PullRequestContextError("Selected PR does not match the requested repository and branches")
    if repository.keep_pull_requests_closed:
        if snapshot.state == "OPEN":
            provider.gh("pr", "close", str(snapshot.number), "--repo", name)
        if provider.snapshot(str(snapshot.number)).state != "CLOSED":
            raise PullRequestContextError("Could not verify PR closure; it may still be visible in the open queue")
    return resolve_pull_request_context(repository, provider, selector=str(snapshot.number))


def require_merge_direction(source: str, target: str) -> None:
    if source == "development" or source.startswith("development-"):
        raise PullRequestContextError(f"Forbidden merge direction: {source} -> {target}; development is an integration sink")
    if source == target:
        raise PullRequestContextError("Merge source and target must differ")


def require_authorized_identity(context, current, reviewed_head):
    expected = context.pull_request
    for field in ("repository", "number", "url", "base_branch", "base_sha", "head_branch"):
        if getattr(current, field) != getattr(expected, field):
            raise PullRequestContextError(f"PR {field} changed before merge; review must be refreshed")
    if current.state != "OPEN" or current.head_sha != reviewed_head:
        raise PullRequestContextError("PR is not open at the authorized head")


def merge_pull_request(context: PullRequestContext, provider, *, reviewed_head: str,
                       authorization: str, method: str = "merge",
                       evidence_paths: Sequence[str] = ()) -> dict:
    if not authorization.strip():
        raise PullRequestContextError("Explicit human merge authorization is required")
    if method not in {"merge", "squash", "rebase"}:
        raise PullRequestContextError("Unsupported merge method")
    require_merge_direction(context.pull_request.head_branch, context.pull_request.base_branch)
    require_current_policy(context)
    synchronized = finalize_pull_request_context(context, provider, evidence_paths=evidence_paths)
    if synchronized["finalHeadSha"] != reviewed_head:
        raise PullRequestContextError("Current PR head differs from the explicitly accepted reviewed head")
    number = str(context.pull_request.number)
    name = context.pull_request.repository
    opened = False
    try:
        if context.keep_pull_requests_closed:
            # Set cleanup obligation before the call: a network failure may follow a successful reopen.
            opened = True
            provider.gh("pr", "reopen", number, "--repo", name)
        current = provider.snapshot(number)
        require_authorized_identity(context, current, reviewed_head)
        if current.is_draft:
            provider.gh("pr", "ready", number, "--repo", name)
        status = json.loads(provider.gh("pr", "view", number, "--repo", name,
                                       "--json", "statusCheckRollup"))
        if status["statusCheckRollup"]:
            provider.gh("pr", "checks", number, "--repo", name, "--watch")
        require_current_policy(context)
        require_authorized_identity(context, provider.snapshot(number), reviewed_head)
        # GitHub enforces required checks/reviews. Do not use --admin, --auto, or bypass rules.
        provider.gh("pr", "merge", number, "--repo", name, f"--{method}",
                    "--match-head-commit", reviewed_head)
        final = provider.snapshot(number)
        if final.state != "MERGED":
            raise PullRequestContextError("Merge did not complete; no protocol passage may be recorded")
        return {"status": "merged", "pullRequest": final.to_dict(),
                "reviewedHeadSha": reviewed_head, "authorization": authorization}
    except BaseException as error:
        if context.keep_pull_requests_closed and opened:
            try:
                final = provider.snapshot(number)
                if final.state == "OPEN":
                    provider.gh("pr", "close", number, "--repo", name)
                if provider.snapshot(number).state not in {"CLOSED", "MERGED"}:
                    raise PullRequestContextError("PR remains open")
            except Exception as cleanup_error:
                raise PullRequestContextError(
                    f"Merge failed ({error}); could not verify re-closure ({cleanup_error}). Check PR #{number} immediately"
                ) from error
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--cwd", default=".")
    prepare.add_argument("--repository")
    prepare.add_argument("--title", required=True)
    prepare.add_argument("--body-file", required=True)
    prepare.add_argument("--scope", choices=["slice", "feature-final"], default="slice")
    prepare.add_argument("--output")
    merge = commands.add_parser("merge")
    merge.add_argument("--context", required=True)
    merge.add_argument("--reviewed-head", required=True)
    merge.add_argument("--authorization", required=True,
                       help="Label for explicit human authorization observed by the cooperative agent")
    merge.add_argument("--method", choices=["merge", "squash", "rebase"], default="merge")
    merge.add_argument("--evidence-path", action="append", default=[])
    merge.add_argument("--output")
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            workflow = resolve_workflow_context(args.cwd, repository_alias=args.repository)
            provider = GitHubPullRequestProvider(workflow.repository.path)
            result = prepare_pull_request(workflow.repository, provider, title=args.title,
                                          body_file=args.body_file, scope=args.scope).to_dict()
        else:
            context = load_context(args.context)
            provider = GitHubPullRequestProvider(context.repository_root)
            result = merge_pull_request(context, provider, reviewed_head=args.reviewed_head,
                                        authorization=args.authorization, method=args.method,
                                        evidence_paths=args.evidence_path)
        _print_result(result, args.output)
        return 0
    except (PullRequestContextError, WorkflowContextError, ValueError, OSError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
