#!/usr/bin/env python3
"""Append a structured decision entry to a branch scratchpad."""

from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path


ENTRY_RE = re.compile(r"^## \[(\d+)\] ", re.MULTILINE)


def next_number(text: str) -> int:
    numbers = [int(match.group(1)) for match in ENTRY_RE.finditer(text)]
    return max(numbers, default=0) + 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--branch-dir", required=True, help="docs/issues/{branch} path")
    parser.add_argument("--title", required=True)
    parser.add_argument("--confidence", choices=["HIGH", "LOW"], default="HIGH")
    parser.add_argument("--blast-radius", required=True)
    parser.add_argument("--triggered-by", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--alternatives", default="None recorded.")
    args = parser.parse_args()

    branch_dir = Path(args.branch_dir)
    scratchpad = branch_dir / "scratchpad.md"
    branch = branch_dir.name
    if scratchpad.exists():
        text = scratchpad.read_text()
    else:
        text = (
            f"# Decision Scratchpad - {branch}\n\n"
            f"**Branch start:** {dt.date.today().isoformat()}\n"
        )

    n = next_number(text)
    entry = f"""

## [{n}] {args.title}

[ ] **Promote**

**Confidence:** {args.confidence}

**Blast Radius:** {args.blast_radius}

{args.body}

**Triggered by:** {args.triggered_by}

**Alternatives considered:**
{args.alternatives}
"""
    scratchpad.write_text(text.rstrip() + entry + "\n")
    print(f"Recorded decision [{n}] in {scratchpad}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
