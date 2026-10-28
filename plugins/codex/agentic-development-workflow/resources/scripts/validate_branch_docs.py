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
