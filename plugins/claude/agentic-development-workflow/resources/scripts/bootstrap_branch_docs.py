#!/usr/bin/env python3
"""Create missing workflow docs in the resolved cumulative feature folder."""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
from pathlib import Path

from workflow_context import (
    WorkflowContextError,
    find_workspace_config,
    resolve_workflow_context,
    validate_delivery_branch,
    validate_feature_id,
)


REQUIRED = [
    "interview.md",
    "spec.md",
    "plan.md",
    "issues.md",
    "tracker.md",
    "scratchpad.md",
    "decisions.md",
]


def current_branch(repository: Path) -> str:
    result = subprocess.run(
        ["git", "-C", str(repository), "branch", "--show-current"],
        check=False,
        capture_output=True,
        text=True,
    )
    branch = result.stdout.strip()
    if not branch:
        raise SystemExit("Could not determine branch. Pass --branch.")
    return branch


def workflow_root() -> Path:
    return Path(__file__).resolve().parents[1]


def render(template: str, branch: str, date: str) -> str:
    return template.replace("{branch}", branch).replace("{date}", date)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--branch",
        help="Legacy explicit feature ID. Defaults to resolved workflow context.",
    )
    parser.add_argument("--feature-id", help="Explicit feature ID for unconfigured setup.")
    parser.add_argument("--repository", help="Configured repository alias.")
    parser.add_argument("--root", default=".", help="Workspace or repository path.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files.")
    args = parser.parse_args()

    if args.branch and args.feature_id:
        parser.error("Use only one of --branch or --feature-id")

    date = dt.date.today().isoformat()
    start = Path(args.root).resolve()
    explicit_feature_id = args.feature_id or args.branch
    if explicit_feature_id:
        try:
            feature_id = validate_feature_id(explicit_feature_id)
            config_path = find_workspace_config(start)
            if config_path is not None:
                context = resolve_workflow_context(
                    start,
                    repository_alias=args.repository,
                )
                if feature_id != context.feature_id:
                    raise WorkflowContextError(
                        f"Explicit feature ID {feature_id!r} does not match authoritative "
                        f"configured featureId {context.feature_id!r}"
                    )
                branch_dir = context.feature_home
                validate_delivery_branch(
                    feature_id,
                    current_branch(context.repository.path),
                )
            else:
                branch_dir = start / "docs" / "issues" / feature_id
        except WorkflowContextError as error:
            parser.error(str(error))
    else:
        try:
            context = resolve_workflow_context(start, repository_alias=args.repository)
            feature_id = context.feature_id
            branch_dir = context.feature_home
            if context.mode == "configured":
                validate_delivery_branch(
                    feature_id,
                    current_branch(context.repository.path),
                )
        except WorkflowContextError as error:
            parser.error(str(error))

    template_dir = workflow_root() / "templates"
    branch_dir.mkdir(parents=True, exist_ok=True)

    created = []
    skipped = []
    for name in REQUIRED:
        target = branch_dir / name
        if target.exists() and not args.force:
            skipped.append(str(target))
            continue
        template = (template_dir / name).read_text()
        target.write_text(render(template, feature_id, date))
        created.append(str(target))

    print(f"Feature docs: {branch_dir}")
    if created:
        print("Created/updated:")
        for path in created:
            print(f"  {path}")
    if skipped:
        print("Skipped existing:")
        for path in skipped:
            print(f"  {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
