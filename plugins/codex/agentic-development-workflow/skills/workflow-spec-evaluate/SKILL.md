---
name: workflow-spec-evaluate
description: "Evaluate implementation against a software spec and rubric. Use before declaring specced work complete, at PR boundaries, when updating tracker.md rubric status, or when producing a completion report with build, lint, tests, integration, app runtime, AC, and rubric evidence."
---

# Workflow Spec Evaluate

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Read:

- `<plugin-root>/resources/policy/WORKFLOW.md`
- `<plugin-root>/resources/commands/spec-evaluate.md`

Run applicable DoD commands yourself when feasible. Mark blocked checks as
pending manual verification with exact steps. Update `tracker.md` only from
evidence, not belief.

At a formal PR boundary, consume the `specEvaluation` result from
`boundary_gate.py` and persist the report at its exact packet `outputPath`.
Do not infer the feature folder or reuse a top-level report.
