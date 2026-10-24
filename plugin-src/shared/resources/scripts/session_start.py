#!/usr/bin/env python3
"""Emit the minimal cross-platform workflow activation context."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path


ACTIVATION_CONTEXT = (
    "For non-trivial software work, load the software-development-workflow "
    "skill unless the user explicitly asks to bypass it."
)


def discover_status_context(cwd: str | None = None) -> str | None:
    node = shutil.which("node")
    adapter = Path(__file__).resolve().parents[1] / "protocol" / "plugin-adapter.js"
    if node is None or not adapter.is_file():
        return None
    try:
        result = subprocess.run(
            [node, str(adapter), "status", "--cwd", cwd or os.getcwd()],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
        if result.returncode != 0:
            return None
        envelope = json.loads(result.stdout)
        data = envelope.get("data", {})
        mode = data.get("mode")
        if mode == "governed":
            current = data["current"]
            blocked = [item["name"] for item in data.get("milestones", []) if not item["allowed"]]
            return (
                f"GateReeve current run: feature={data['featureId']}; phase={current['phase']}; "
                f"blocked milestones={','.join(blocked) or 'none'}. "
                "Work freely within the authorized phase. Required milestone passage uses the core. "
                "Readiness does not launch review. SessionStart is guidance, not action interception."
            )
        if mode == "current-entry":
            return (
                "GateReeve current run needed: preserve existing documents and old runtime files. "
                "Use run.resume-current with observed approvals; do not replay old events or "
                "restart unchanged planning. Ask only for missing authority."
            )
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError, KeyError, TypeError):
        return None
    return None


def build_output(status_context: str | None = None) -> dict[str, object]:
    context = ACTIVATION_CONTEXT
    if status_context:
        context = f"{context} {status_context}"
    return {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }


def main() -> None:
    print(
        json.dumps(
            build_output(discover_status_context()),
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
