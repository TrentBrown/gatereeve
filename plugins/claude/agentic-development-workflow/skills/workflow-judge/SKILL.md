---
name: workflow-judge
description: "Independent compliance evaluation for specced software work. Use for LLM-as-judge style review, PR boundary verification, final feature verification, rubric compliance checks, scope creep checks, gap checks, or contradiction checks against spec.md."
---

# Workflow Judge

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Read:

- `<plugin-root>/resources/commands/judge.md`

Keep the judge pass isolated from implementation rationale. If subagents are
available and the user has authorized parallel agent work, use one. Otherwise
perform the isolated evaluation yourself from the spec and changed files only.

At a formal PR boundary, consume the `judge` result from `boundary_gate.py`,
evaluate only its pinned base/head diff, and persist the result at its exact
packet `outputPath`.
