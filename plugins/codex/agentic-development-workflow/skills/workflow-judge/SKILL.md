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

Formal Judge runs use the GateReeve `gatereeve/judge` agent workflow. They must
execute in a fresh, read-only context with zero inherited implementation turns.
If the configured adapter cannot prove that isolation, leave the gate UNSET and
report it as unavailable. Never fall back to evaluating in the implementation
thread.

At a formal PR boundary, consume the pinned inputs and the validated `judge.json`
root artifact produced by the governed runtime. GateReeve alone records passage.
