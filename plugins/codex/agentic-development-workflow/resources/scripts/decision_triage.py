#!/usr/bin/env python3
"""Promote checked scratchpad decisions into decisions.md."""

from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path


SECTION_RE = re.compile(r"^## \[(\d+)\] (.+?)\n(?P<body>.*?)(?=^## \[\d+\] |\Z)", re.MULTILINE | re.DOTALL)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--branch-dir", required=True, help="docs/issues/{branch} path")
    parser.add_argument("--pr", default="", help="PR number or URL to annotate promoted entries")
    args = parser.parse_args()

    branch_dir = Path(args.branch_dir)
    scratchpad = branch_dir / "scratchpad.md"
    decisions = branch_dir / "decisions.md"
    if not scratchpad.exists():
        raise SystemExit(f"Missing scratchpad: {scratchpad}")

    text = scratchpad.read_text()
    existing_text = decisions.read_text() if decisions.exists() else ""
    existing_titles = set(
        re.findall(r"^## (?!\[)(.+?)\s*$", existing_text, flags=re.MULTILINE)
    )
    unreviewed = []
    promoted = []
    for match in SECTION_RE.finditer(text):
        marker_line = next((line.strip() for line in match.group("body").splitlines() if "**Promote**" in line), "")
        title = match.group(2).strip()
        if marker_line.startswith("[ ]"):
            unreviewed.append(f"[{match.group(1)}] {title}")
        elif marker_line.startswith("[x]"):
            if title in existing_titles:
                continue
            body = match.group("body")
            body = re.sub(r"^\[x\] \*\*Promote\*\*\n+", "", body, count=1, flags=re.MULTILINE)
            promoted.append((title, body.strip()))

    if unreviewed:
        print("Unreviewed decisions block triage:")
        for item in unreviewed:
            print(f"  {item}")
        return 2

    if not promoted:
        print("No promoted decisions found.")
        return 0

    if existing_text:
        out = existing_text.rstrip()
    else:
        out = f"# Decisions - {branch_dir.name}\n\n"

    date = dt.date.today().isoformat()
    pr_line = f" PR: {args.pr}." if args.pr else ""
    for title, body in promoted:
        out += f"\n\n---\n\n## {title}\n\n{body}\n\n**Promoted:** {date}.{pr_line}"

    decisions.write_text(out + "\n")
    print(f"Promoted {len(promoted)} decision(s) to {decisions}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
