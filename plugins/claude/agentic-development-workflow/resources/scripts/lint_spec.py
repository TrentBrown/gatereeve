#!/usr/bin/env python3
"""Spec lint: AC entries present and concrete; rubric table parses and every
row has explicit pass/fail/evidence cells. Backs the spec validation gate."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("branch_dir", help="docs/issues/{branch} path")
    args = parser.parse_args()

    spec = Path(args.branch_dir) / "spec.md"
    failures = []
    warnings = []

    if not spec.exists():
        print("FAIL")
        print(f"- missing {spec}")
        return 1

    text = spec.read_text()

    if "## Acceptance Criteria" not in text:
        failures.append("missing '## Acceptance Criteria' section")
    else:
        acs = re.findall(r"^- \*\*(AC\d+)\.\*\*\s*(.*)$", text, flags=re.MULTILINE)
        if not acs:
            failures.append("no '- **ACn.** ...' entries found")
        seen_ac = set()
        for ac_id, body in acs:
            if ac_id in seen_ac:
                failures.append(f"duplicate id {ac_id}")
            seen_ac.add(ac_id)
            if not body.strip() or "TODO" in body:
                failures.append(f"{ac_id} is empty or still contains TODO")

    if "## Rubric" not in text:
        failures.append("missing '## Rubric' section")
    else:
        rows = re.findall(r"^\|\s*(R\d+)\s*\|(.+)$", text, flags=re.MULTILINE)
        if not rows:
            failures.append("no rubric rows ('| Rn | ...') found")
        seen_r = set()
        for rid, rest in rows:
            if rid in seen_r:
                failures.append(f"duplicate rubric id {rid}")
            seen_r.add(rid)
            cells = [c.strip() for c in rest.strip().strip("|").split("|")]
            if len(cells) < 4:
                failures.append(
                    f"{rid}: expected 4 cells (criterion/pass/fail/evidence), got {len(cells)}"
                )
                continue
            for label, cell in zip(["criterion", "pass", "fail", "evidence"], cells[:4]):
                if not cell or "TODO" in cell:
                    failures.append(f"{rid}: {label} cell is empty or TODO")

    if "## Changes" not in text:
        warnings.append("no '## Changes' section for amendments")

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
