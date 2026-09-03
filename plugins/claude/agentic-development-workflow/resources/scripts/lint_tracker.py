#!/usr/bin/env python3
"""Tracker lint: rubric statuses must be PASS / NOT YET / FAIL. With --final,
zero NOT YET and zero FAIL may remain. Backs the per-PR and final gates."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


VALID_STATUS = {"PASS", "NOT YET", "FAIL"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("branch_dir", help="docs/issues/{branch} path")
    parser.add_argument(
        "--final",
        action="store_true",
        help="feature-completion mode: NOT YET and FAIL statuses are failures",
    )
    args = parser.parse_args()

    tracker = Path(args.branch_dir) / "tracker.md"
    failures = []
    warnings = []

    if not tracker.exists():
        print("FAIL")
        print(f"- missing {tracker}")
        return 1

    text = tracker.read_text()

    if "## Rubric Status" not in text:
        failures.append("missing '## Rubric Status' section")
    if "## PR Log" not in text:
        warnings.append("missing '## PR Log' section")

    rows = re.findall(r"^\|\s*(R\d+)\s*\|(.+)$", text, flags=re.MULTILINE)
    if not rows and "## Rubric Status" in text:
        failures.append("no rubric rows ('| Rn | ...') found")

    seen = set()
    for rid, rest in rows:
        if rid in seen:
            failures.append(f"duplicate rubric id {rid}")
        seen.add(rid)
        cells = [c.strip() for c in rest.strip().strip("|").split("|")]
        if len(cells) < 2:
            failures.append(f"{rid}: row has no status cell")
            continue
        status = cells[1]
        if status not in VALID_STATUS:
            failures.append(
                f"{rid}: invalid status '{status}' (valid: PASS, NOT YET, FAIL)"
            )
        elif args.final and status in {"NOT YET", "FAIL"}:
            failures.append(f"{rid}: status {status} not allowed at feature completion")
        elif status == "FAIL":
            warnings.append(f"{rid} is FAIL - criterion regressed or unmet by completed work")

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
