#!/usr/bin/env python3
"""Triage gate: fail on any unreviewed '[ ] **Promote**' scratchpad entry.
Blocking counterpart to the warning in validate_branch_docs.py; run it at
every PR boundary after decision-triage."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("branch_dir", help="docs/issues/{branch} path")
    args = parser.parse_args()

    scratchpad = Path(args.branch_dir) / "scratchpad.md"
    failures = []

    if not scratchpad.exists():
        print("FAIL")
        print(f"- missing {scratchpad}")
        return 1

    text = scratchpad.read_text()
    entries = list(re.finditer(r"^## \[(\d+)\]\s*(.+)$", text, flags=re.MULTILINE))

    if entries:
        for i, match in enumerate(entries):
            start = match.start()
            end = entries[i + 1].start() if i + 1 < len(entries) else len(text)
            if "[ ] **Promote**" in text[start:end]:
                failures.append(f"entry [{match.group(1)}] '{match.group(2).strip()}' is untriaged")
    elif "[ ] **Promote**" in text:
        # Unreviewed marker outside a recognizable entry header still blocks.
        failures.append("untriaged '[ ] **Promote**' marker found")

    if failures:
        print("FAIL")
        for failure in failures:
            print(f"- {failure}")
    else:
        print("PASS")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
