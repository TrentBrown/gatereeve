from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[1] / "session_start.py"
sys.path.insert(0, str(SCRIPT.parent))

import session_start  # noqa: E402
from session_start import discover_status_context, render_context  # noqa: E402


LIGHT_PROCEDURE = str(session_start.LIGHT_PROCEDURE)
FULL_WORKFLOW_SKILL = "software-development-workflow"


def milestone(name: str, allowed: bool) -> dict[str, object]:
    return {"name": name, "allowed": allowed, "missing": [] if allowed else ["fixture gap"]}


def governed(rigor: str, autonomy: str, *, phase: str = "IMPLEMENTING", **extra: object) -> dict[str, object]:
    """Adapter status data for a current run, shaped like currentSnapshot()."""
    data: dict[str, object] = {
        "schemaVersion": 1,
        "contract": "gatereeve/current/7",
        "mode": "governed",
        "featureId": "fixture-feature",
        "current": {"phase": phase, "paused": False, "pendingDecisions": []},
        "dials": {"rigor": rigor, "autonomy": autonomy},
        "dialDefaults": {"rigor": "full", "autonomy": "supervised"},
        "branches": [{"alias": "app", "integrationBranch": "fixture-integration", "releaseBranch": "main"}],
        "milestones": [
            milestone("implementation", True),
            milestone("acceptance", False),
            milestone("merge", False),
            milestone("completion", False),
        ],
        "blockers": [],
        "artifacts": [],
    }
    data.update(extra)
    return data


NO_RUN = {
    "schemaVersion": 1,
    "contract": "gatereeve/current/7",
    "mode": "current-entry",
    "featureId": "fixture-feature",
    "current": None,
    "dials": None,
    "dialDefaults": {"rigor": "full", "autonomy": "supervised"},
    "milestones": [],
    "blockers": [{"type": "current-entry", "message": "Resume with the current protocol."}],
    "artifacts": [{"id": "spec.md", "exists": False}],
}


class SessionStartStateTests(unittest.TestCase):
    def assert_states_dials(self, context: str, rigor: str, autonomy: str) -> None:
        self.assertIn(f"rigor={rigor}", context)
        self.assertIn(f"autonomy={autonomy}", context)

    def test_no_run_states_defaults_and_up_front_question(self) -> None:
        context = render_context(NO_RUN)
        self.assertIn("no current run for feature fixture-feature", context)
        self.assert_states_dials(context, "full", "supervised")
        self.assertIn('ask the human "full or light?"', context)
        self.assertIn("no configuration changes the defaults", context)
        self.assertIn(LIGHT_PROCEDURE, context)
        self.assertNotIn("run.resume-current", context)

    def test_no_run_with_existing_documents_mentions_resumption(self) -> None:
        data = dict(NO_RUN, artifacts=[{"id": "design.md", "exists": True}])
        context = render_context(data)
        self.assertIn('"full or light?"', context)
        self.assertIn("run.resume-current", context)

    def test_light_run_reports_state_and_light_procedure_only(self) -> None:
        context = render_context(governed("light", "supervised"))
        self.assert_states_dials(context, "light", "supervised")
        self.assertIn("phase=IMPLEMENTING", context)
        self.assertIn("blockers=none", context)
        self.assertIn("blocked milestones=acceptance,merge,completion", context)
        self.assertIn(LIGHT_PROCEDURE, context)
        self.assertNotIn(FULL_WORKFLOW_SKILL, context)
        self.assertNotIn("WORKFLOW.md", context)
        self.assertNotIn("Hand back", context)

    def test_full_run_reports_state_and_full_workflow(self) -> None:
        blocker = {"type": "external-blocker", "message": "PR #4 is blocked by a hosting rule (required-review)"}
        context = render_context(governed("full", "supervised", phase="ACCEPTING", blockers=[blocker]))
        self.assert_states_dials(context, "full", "supervised")
        self.assertIn("phase=ACCEPTING", context)
        self.assertIn("blockers=PR #4 is blocked by a hosting rule (required-review)", context)
        self.assertIn(FULL_WORKFLOW_SKILL, context)
        self.assertIn(str(session_start.FULL_WORKFLOW), context)
        self.assertNotIn(LIGHT_PROCEDURE, context)
        self.assertNotIn("delegated only", context)

    def test_delegated_runs_add_scope_and_hand_back_triggers(self) -> None:
        for rigor in ("full", "light"):
            with self.subTest(rigor=rigor):
                context = render_context(governed(rigor, "delegated"))
                self.assert_states_dials(context, rigor, "delegated")
                self.assertIn("SLICE PRs into fixture-integration", context)
                self.assertIn("Merges into main still need a per-PR human instruction", context)
                for trigger in ("scope-changing amend", "agent hand-back", "external merge blocker", "loss of release-branch protection"):
                    self.assertIn(trigger, context)
                if rigor == "light":
                    self.assertIn(LIGHT_PROCEDURE, context)
                    self.assertNotIn(FULL_WORKFLOW_SKILL, context)

    def test_paused_and_pending_decisions_are_blockers(self) -> None:
        data = governed("full", "supervised")
        data["current"] = {"phase": "IMPLEMENTING", "paused": True, "pendingDecisions": [{}]}
        context = render_context(data)
        self.assertIn("explicitly paused", context)
        self.assertIn("1 pending human instruction(s)", context)

    def test_unreadable_dials_never_report_light_or_delegated(self) -> None:
        context = render_context(governed("lite", "autonomous"))
        self.assert_states_dials(context, "full", "supervised")
        context = render_context(dict(governed("light", "delegated"), dials=None))
        self.assert_states_dials(context, "full", "supervised")

    def test_failure_modes_produce_a_short_safe_message(self) -> None:
        for data in (None, {"mode": "governed", "current": {}, "blockers": 5}):
            with self.subTest(data=repr(data)[:40]):
                context = render_context(data)  # type: ignore[arg-type]
                self.assertIn("GateReeve", context)
                self.assertIn('"full or light?"', context)
                self.assertLess(len(context), 1200)
        with mock.patch.object(session_start.shutil, "which", return_value=None):
            self.assertIsNone(session_start.read_status("/nonexistent"))
        failed = subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr="boom")
        with mock.patch.object(session_start.subprocess, "run", return_value=failed):
            self.assertIsNone(session_start.read_status("/nonexistent"))
        garbage = subprocess.CompletedProcess(args=[], returncode=0, stdout="not json", stderr="")
        with mock.patch.object(session_start.subprocess, "run", return_value=garbage):
            self.assertIsNone(session_start.read_status("/nonexistent"))
        with mock.patch.object(session_start.subprocess, "run", side_effect=subprocess.TimeoutExpired("node", 5)):
            self.assertIsNone(session_start.read_status("/nonexistent"))
            self.assertIn("could not be read", discover_status_context("/nonexistent"))


class SessionStartHookTests(unittest.TestCase):
    def test_emits_one_session_start_payload(self) -> None:
        with tempfile.TemporaryDirectory(prefix="gatereeve session start ") as root:
            result = subprocess.run(
                [sys.executable, str(SCRIPT)],
                check=True,
                capture_output=True,
                text=True,
                cwd=root,
            )
        payload = json.loads(result.stdout)
        self.assertEqual(set(payload), {"hookSpecificOutput"})
        self.assertEqual(payload["hookSpecificOutput"]["hookEventName"], "SessionStart")
        context = payload["hookSpecificOutput"]["additionalContext"]
        self.assertIn('"full or light?"', context)
        self.assertIn("explicitly asks to bypass", context)

    def test_reports_real_adapter_status_for_no_run_and_governed_run(self) -> None:
        node = shutil.which("node")
        git = shutil.which("git")
        if node is None or git is None:
            self.skipTest("Node and Git are required")
        with tempfile.TemporaryDirectory(prefix="gatereeve session start ") as root:
            repository = Path(root)
            subprocess.run([git, "-C", root, "init", "-b", "session-feature"], check=True, capture_output=True)
            subprocess.run([git, "-C", root, "config", "user.name", "Session Test"], check=True)
            subprocess.run([git, "-C", root, "config", "user.email", "session@example.test"], check=True)
            (repository / "README.md").write_text("fixture\n", encoding="utf-8")
            subprocess.run([git, "-C", root, "add", "README.md"], check=True)
            subprocess.run([git, "-C", root, "commit", "-m", "fixture"], check=True, capture_output=True)

            no_run = discover_status_context(root)
            self.assertIn("no current run for feature session-feature", no_run)
            self.assertIn('"full or light?"', no_run)
            feature_home = repository / "docs" / "issues" / "session-feature"
            feature_home.mkdir(parents=True)
            (feature_home / "interview.md").write_text("# legacy\n", encoding="utf-8")
            self.assertIn("run.resume-current", discover_status_context(root))

            shutil.rmtree(feature_home)
            request = {
                "operation": "run.start",
                "input": {"implementers": ["session-test"]},
                "cwd": root,
                "actor": {"kind": "agent", "label": "session test"},
                "operationId": "session-init",
            }
            initialized = subprocess.run(
                [node, str(session_start.ADAPTER)],
                input=json.dumps(request),
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertTrue(json.loads(initialized.stdout)["ok"])
            context = discover_status_context(root)
            self.assertIn("GateReeve current run:", context)
            self.assertIn("rigor=full; autonomy=supervised; phase=DESIGNING", context)
            self.assertIn(FULL_WORKFLOW_SKILL, context)

            # A light run started through the real adapter.
            subprocess.run([git, "-C", root, "switch", "-c", "light-feature"], check=True, capture_output=True)
            light = dict(
                request,
                operationId="session-light",
                input={
                    "implementers": ["session-test"],
                    "rigor": {
                        "value": "light",
                        "reason": "Small change",
                        "authority": {
                            "kind": "human-confirmed",
                            "instruction": "Light for this one.",
                            "context": "session test conversation",
                        },
                    },
                },
            )
            started = subprocess.run(
                [node, str(session_start.ADAPTER)],
                input=json.dumps(light),
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertTrue(json.loads(started.stdout)["ok"], started.stdout)
            context = discover_status_context(root)
            self.assertIn("rigor=light; autonomy=supervised", context)
            self.assertIn(LIGHT_PROCEDURE, context)
            self.assertNotIn(FULL_WORKFLOW_SKILL, context)


if __name__ == "__main__":
    unittest.main()
