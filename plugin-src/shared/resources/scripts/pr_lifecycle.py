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
                         scope: str = "slice", expected_pr: int | None = None) -> PullRequestContext:
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
    if expected_pr is not None and (len(rows) != 1 or rows[0]["number"] != expected_pr):
        raise PullRequestContextError("Retry requires the exact existing unmerged PR; no PR was created")
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
            raise ValueError("Legacy merge entry is retired. Use the current plugin adapter merge.prepare, scoped human.decide, and merge.execute so current milestone proof is enforced.")
        _print_result(result, args.output)
        return 0
    except (PullRequestContextError, WorkflowContextError, ValueError, OSError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    raise SystemExit(main())
