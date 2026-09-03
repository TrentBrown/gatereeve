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
            projection = data["projection"]
            feature = projection["feature"]["state"]
            active_slice = projection.get("activeSliceId") or "none"
            blockers = len(data.get("blockers", []))
            return (
                f"GateReeve state: governed; feature={projection['featureId']}; "
                f"phase={feature}; activeSlice={active_slice}; blockers={blockers}. "
                "Treat the plugin protocol core as the reeve before recording passage."
            )
        if mode == "legacy":
            return (
                "GateReeve state: legacy feature; it may finish without governance. "
                "Do not silently adopt or reconstruct its history."
            )
        if mode == "missing":
            return (
                "GateReeve state: no feature record. New non-trivial features initialize "
                "governance before design work."
            )
        if mode == "inconsistent":
            return (
                f"GateReeve state: inconsistent ({data.get('reason', 'unknown reason')}); "
                "ordinary workflow passage is blocked."
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
