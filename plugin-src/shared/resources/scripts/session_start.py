#!/usr/bin/env python3
"""Report GateReeve run state as SessionStart context.

SessionStart reports the run's dials, phase and blockers and points to the
procedure that fits them. It does not prescribe the full workflow for every
session: a light run is pointed only at the light-run procedure. It is
guidance, not action interception, and never fails the session.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any


RESOURCES = Path(__file__).resolve().parents[1]
ADAPTER = RESOURCES / "protocol" / "plugin-adapter.js"
LIGHT_PROCEDURE = RESOURCES / "commands" / "light-run.md"
FULL_WORKFLOW = RESOURCES / "policy" / "WORKFLOW.md"
DEFAULT_DIALS = {"rigor": "full", "autonomy": "supervised"}
TIMEOUT_SECONDS = 5

ASK_UP_FRONT = (
    'Before starting non-trivial software work, ask the human "full or light?" and '
    "record the answer as the run's explicit rigor choice at run.start. Light and "
    "delegated exist only as explicit per-run choices; no configuration changes "
    "the defaults. Skip GateReeve only if the user explicitly asks to bypass it."
)
HAND_BACK_TRIGGERS = (
    "a scope-changing amend, an agent hand-back (uncertainty is always allowed), "
    "an external merge blocker, or loss of release-branch protection"
)
GUIDANCE_NOTE = "SessionStart is guidance, not action interception."
RUN_START_CONFIGURES = (
    "Delivery needs a workspace configuration: in a repository with a GitHub remote and "
    "no .agentic-workflow.json, run.start writes a minimal one (the default branch as "
    "integration and release, excluded locally, never committed); a configuration naming "
    "another feature stops run.start until the human confirms or replaces it."
)


def read_status(cwd: str | None = None) -> dict[str, Any] | None:
    """Return the adapter status data, or None when it cannot be read safely."""
    node = shutil.which("node")
    if node is None or not ADAPTER.is_file():
        return None
    try:
        result = subprocess.run(
            [node, str(ADAPTER), "status", "--cwd", cwd or os.getcwd()],
            check=False,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            return None
        envelope = json.loads(result.stdout)
        data = envelope.get("data") if isinstance(envelope, dict) else None
        return data if isinstance(data, dict) else None
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError, ValueError):
        return None


def _text(value: Any, fallback: str = "unknown") -> str:
    return value if isinstance(value, str) and value else fallback


def _dials(data: dict[str, Any]) -> dict[str, str]:
    dials = data.get("dials")
    if not isinstance(dials, dict):
        return dict(DEFAULT_DIALS)
    # Anything unreadable is reported at the built-in default, never as light
    # or delegated.
    rigor = dials.get("rigor") if dials.get("rigor") in ("full", "light") else "full"
    autonomy = dials.get("autonomy") if dials.get("autonomy") in ("supervised", "delegated") else "supervised"
    return {"rigor": rigor, "autonomy": autonomy}


def _blockers(data: dict[str, Any]) -> str:
    messages = [
        _text(item.get("message"), "")
        for item in data.get("blockers") or []
        if isinstance(item, dict) and item.get("message")
    ]
    current = data.get("current") if isinstance(data.get("current"), dict) else {}
    if current.get("paused"):
        messages.append("work is explicitly paused until a recorded human instruction continues it")
    pending = current.get("pendingDecisions") or []
    if pending:
        messages.append(f"{len(pending)} pending human instruction(s)")
    return "; ".join(messages) or "none"


def _blocked_milestones(data: dict[str, Any]) -> str:
    names = [
        _text(item.get("name"))
        for item in data.get("milestones") or []
        if isinstance(item, dict) and not item.get("allowed")
    ]
    return ",".join(names) or "none"


def _branches(data: dict[str, Any]) -> tuple[str, str]:
    branches = [item for item in data.get("branches") or [] if isinstance(item, dict)]
    integration = ", ".join(sorted({_text(item.get("integrationBranch")) for item in branches})) or "the integration branch"
    release = ", ".join(sorted({_text(item.get("releaseBranch")) for item in branches})) or "the release branch"
    return integration, release


def _workspace_note(data: dict[str, Any] | None, run: bool) -> str | None:
    """The status workspace message, or the run-start rule when status has none."""
    workspace = data.get("workspace") if data else None
    if isinstance(workspace, dict):
        message = workspace.get("message")
        return message if isinstance(message, str) and message else None
    return None if run else RUN_START_CONFIGURES


def no_run_context(data: dict[str, Any] | None, reason: str | None = None) -> str:
    feature = f" for feature {data['featureId']}" if data and isinstance(data.get("featureId"), str) else ""
    prefix = f"GateReeve: no current run{feature}." if reason is None else f"GateReeve run state unavailable ({reason})."
    parts = [
        prefix,
        f"A new run starts at the built-in defaults: rigor={DEFAULT_DIALS['rigor']}, autonomy={DEFAULT_DIALS['autonomy']}.",
        ASK_UP_FRONT,
        "For full rigor, load the software-development-workflow skill; for light rigor, "
        f"follow the light-run procedure at {LIGHT_PROCEDURE}.",
    ]
    note = _workspace_note(data, run=False)
    if note:
        parts.append(note)
    artifacts = data.get("artifacts") if data else None
    if isinstance(artifacts, list) and any(isinstance(item, dict) and item.get("exists") for item in artifacts):
        parts.append(
            "Existing feature documents were found: if this continues earlier work, use "
            "run.resume-current with observed approvals; do not replay old events or restart "
            "unchanged planning."
        )
    parts.append(GUIDANCE_NOTE)
    return " ".join(parts)


def run_context(data: dict[str, Any]) -> str:
    dials = _dials(data)
    current = data.get("current") if isinstance(data.get("current"), dict) else {}
    parts = [
        f"GateReeve current run: feature={_text(data.get('featureId'))}; "
        f"rigor={dials['rigor']}; autonomy={dials['autonomy']}; "
        f"phase={_text(current.get('phase'))}; blockers={_blockers(data)}; "
        f"blocked milestones={_blocked_milestones(data)}."
    ]
    if dials["rigor"] == "light":
        parts.append(
            f"This is a light run: follow the light-run procedure at {LIGHT_PROCEDURE}. "
            "Its sole planning commitment is brief.md; the acceptance gates are the same as full. "
            "Rigor can rise to full but never falls within a run."
        )
    else:
        parts.append(
            "This is a full run: load the software-development-workflow skill and follow "
            f"{FULL_WORKFLOW}."
        )
    if dials["autonomy"] == "delegated":
        integration, release = _branches(data)
        parts.append(
            "Autonomy is delegated: planning decisions may be recorded as delegated only after an "
            "independent evaluator PASS on the artifact; acceptance and protected merge are "
            f"delegated only for SLICE PRs into {integration} with every required gate PASS. "
            f"Merges into {release} still need a per-PR human instruction. Hand back to "
            f"supervised and stop for the human on {HAND_BACK_TRIGGERS}."
        )
    note = _workspace_note(data, run=True)
    if note:
        parts.append(note)
    parts.append(
        "Work freely within the authorized phase; milestone passage uses the core and readiness "
        f"does not launch review. {GUIDANCE_NOTE}"
    )
    return " ".join(parts)


def render_context(data: dict[str, Any] | None) -> str:
    """Build SessionStart context from adapter status data; never raises."""
    try:
        if data is None:
            return no_run_context(None, "the GateReeve adapter status could not be read here")
        if data.get("mode") == "governed" and isinstance(data.get("current"), dict):
            return run_context(data)
        return no_run_context(data)
    except Exception:  # noqa: BLE001 - SessionStart must never fail the session.
        return no_run_context(None, "the GateReeve status could not be interpreted")


def discover_status_context(cwd: str | None = None) -> str:
    return render_context(read_status(cwd))


def build_output(context: str) -> dict[str, object]:
    return {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }


def main() -> None:
    try:
        context = discover_status_context()
    except Exception:  # noqa: BLE001 - SessionStart must never fail the session.
        context = no_run_context(None, "SessionStart could not read run state")
    print(json.dumps(build_output(context), separators=(",", ":")))


if __name__ == "__main__":
    main()
