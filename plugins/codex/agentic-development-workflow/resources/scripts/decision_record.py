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
    parser.add_argument("--answered-by", choices=["human", "agent"], default="agent",
                        help="Who answered: human, or agent for a self-answered decision (goal autonomy)")
    parser.add_argument("--reversibility", default=None, help="For agent entries: whether and how the choice can be undone")
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
    reversibility = f"\n**Reversibility:** {args.reversibility}\n" if args.reversibility else ""
    entry = f"""

## [{n}] {args.title}

[ ] **Promote**

**Answered by:** {args.answered_by}

**Confidence:** {args.confidence}
{reversibility}
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
