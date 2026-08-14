#!/usr/bin/env python3
"""Emit the minimal cross-platform workflow activation context."""

from __future__ import annotations

import json


ACTIVATION_CONTEXT = (
    "For non-trivial software work, load the software-development-workflow "
    "skill unless the user explicitly asks to bypass it."
)


def build_output() -> dict[str, object]:
    return {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": ACTIVATION_CONTEXT,
        }
    }


def main() -> None:
    print(json.dumps(build_output(), separators=(",", ":")))


if __name__ == "__main__":
    main()
