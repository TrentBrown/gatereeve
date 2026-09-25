#!/usr/bin/env python3
"""Issues lint: unique IDs, valid status values, and every issue references at
least one plan step and one rubric criterion. Backs the issues gate."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


VALID_STATUS = {"open", "in-progress", "blocked", "in-review", "closed"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("branch_dir", help="docs/issues/{branch} path")
    args = parser.parse_args()

    issues = Path(args.branch_dir) / "issues.md"
    failures = []
    warnings = []

    if not issues.exists():
        print("FAIL")
        print(f"- missing {issues}")
        return 1

    text = issues.read_text()
    matches = list(re.finditer(r"^## (I-\d+) ", text, flags=re.MULTILINE))
    if not matches:
        failures.append("no '## I-{n}' issue blocks found")

    seen = set()
    for i, match in enumerate(matches):
        issue_id = match.group(1)
        if issue_id in seen:
            failures.append(f"duplicate id {issue_id}")
        seen.add(issue_id)

        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end]

        status = re.search(r"\*\*Status:\*\*\s*(.+)$", body, flags=re.MULTILINE)
        if not status:
            failures.append(f"{issue_id} missing Status")
        elif status.group(1).strip() not in VALID_STATUS:
            failures.append(
                f"{issue_id} invalid status '{status.group(1).strip()}' "
                f"(valid: {', '.join(sorted(VALID_STATUS))})"
            )

        plan = re.search(r"\*\*Plan steps:\*\*\s*(.+)$", body, flags=re.MULTILINE)
        if not plan:
            failures.append(f"{issue_id} missing Plan steps")
        elif not re.search(r"\bP\d+\b", plan.group(1)):
            failures.append(f"{issue_id} references no plan step (Pn)")

        rubric = re.search(r"\*\*Rubric criteria:\*\*\s*(.+)$", body, flags=re.MULTILINE)
        if not rubric:
            failures.append(f"{issue_id} missing Rubric criteria")
        elif not re.search(r"\bR\d+\b", rubric.group(1)):
            failures.append(f"{issue_id} references no rubric criterion (Rn)")

        if not re.search(r"\*\*Depends on:\*\*", body):
            warnings.append(f"{issue_id} missing Depends on")
        if not re.search(r"\*\*PR:\*\*", body):
            warnings.append(f"{issue_id} missing PR field")

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
