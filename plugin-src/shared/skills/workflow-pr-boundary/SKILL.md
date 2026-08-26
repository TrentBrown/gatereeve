---
name: workflow-pr-boundary
description: "Run the software workflow PR boundary process. Use when a code slice is ready for a PR or draft PR update, when reconciling issues.md and tracker.md, running scoped verification, triaging decisions, preparing PR text, or moving issues to in-review."
---

# Workflow PR Boundary

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Read:

- `<plugin-root>/resources/policy/WORKFLOW.md`
- `<plugin-root>/resources/commands/pr-boundary.md`
- `<plugin-root>/resources/PROTOCOL.md`

At a boundary, reconcile docs before presenting the work as ready. Keep PR log
entries append-only unless correcting a clear mistake.

The formal boundary must resolve one persisted PR context, route every gate
through `boundary_gate.py`, commit only declared evidence after the pinned
source, and pass both PR-context finalization and packet validation before
requesting human review.

For governed features, begin a boundary attempt, record every gate result and
fingerprint, and request human review through the plugin protocol adapter.
Direct prose or artifact creation cannot advance boundary state.

For the last sequential PR, resolve `feature_final.py` from that same pinned
context and pass `--scope feature-final` to every gate. Preserve
complete-feature evaluation alongside focused final-slice review, and surface
any required human retention decision.
