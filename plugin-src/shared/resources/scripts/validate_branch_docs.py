#!/usr/bin/env python3
"""Lightweight structural validation for workflow branch docs."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


REQUIRED = [
    "interview.md",
    "design.md",
    "spec.md",
    "plan.md",
    "issues.md",
    "tracker.md",
    "scratchpad.md",
    "decisions.md",
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("branch_dir", help="docs/issues/{branch} path")
    args = parser.parse_args()

    branch_dir = Path(args.branch_dir)
    failures = []
    warnings = []

    for name in REQUIRED:
        path = branch_dir / name
        if not path.exists():
            failures.append(f"missing {path}")
        elif not path.read_text().lstrip().startswith("# "):
            warnings.append(f"{path} does not start with an H1")

    spec = branch_dir / "spec.md"
    if spec.exists():
        spec_text = spec.read_text()
        for heading in ["Acceptance Criteria", "Rubric"]:
            if heading not in spec_text:
                failures.append(f"{spec} missing {heading}")

    issues = branch_dir / "issues.md"
    if issues.exists():
        issues_text = issues.read_text()
        for issue in re.finditer(r"^## (I-\d+) ", issues_text, flags=re.MULTILINE):
            start = issue.start()
            next_issue = issues_text.find("\n## I-", start + 1)
            body = issues_text[start: next_issue if next_issue != -1 else len(issues_text)]
            if "**Plan steps:**" not in body:
                failures.append(f"{issue.group(1)} missing Plan steps")
            if "**Rubric criteria:**" not in body:
                failures.append(f"{issue.group(1)} missing Rubric criteria")

    scratchpad = branch_dir / "scratchpad.md"
    if scratchpad.exists() and "[ ] **Promote**" in scratchpad.read_text():
        warnings.append(f"{scratchpad} has unreviewed decisions")

    interview = branch_dir / "interview.md"
    if interview.exists():
        interview_text = interview.read_text()
        if "**Status:**" not in interview_text:
            warnings.append(f"{interview} missing status line")
        if len(interview_text.strip().splitlines()) < 6:
            warnings.append(f"{interview} looks unusually thin for a completed interview")

    if failures:
        print("FAIL")
        for failure in failures:
            print(f"- {failure}")
    else:
        print("PASS")

    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"- {warning}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
