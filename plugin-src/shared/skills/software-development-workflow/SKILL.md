---
name: software-development-workflow
description: "Portable software development lifecycle workflow. Use for non-trivial coding work, specced feature work, branch lifecycle docs, acceptance criteria, implementation plans, issue breakdowns, trackers, decision logs, PR boundaries, completion reports, commits, and PR reviews."
---

# Software Development Workflow

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder with that absolute path before
opening files or running commands, and quote the resolved path.

Follow the canonical workflow at:

`<plugin-root>/resources/policy/WORKFLOW.md`

For feature identity, sequential delivery branches, multi-repository selection,
or cumulative document placement, also load:

`<plugin-root>/resources/policy/WORKSPACE-CONTEXT.md`

Load that file before substantial implementation, branch planning, workflow doc
maintenance, PR boundary work, or completion reporting.

## Command Map

Load the specific command file when the task matches:

- Branch start or missing docs: `<plugin-root>/resources/commands/branch-bootstrap.md`
- Draft AC/rubric: `<plugin-root>/resources/commands/spec-draft.md`
- Validate spec before planning: `<plugin-root>/resources/commands/spec-validate.md`
- Draft implementation plan: `<plugin-root>/resources/commands/plan.md`
- Evaluate implementation against rubric: `<plugin-root>/resources/commands/spec-evaluate.md`
- Independent compliance pass: `<plugin-root>/resources/commands/judge.md`
- Record decision: `<plugin-root>/resources/commands/decision-record.md`
- Triage decisions: `<plugin-root>/resources/commands/decision-triage.md`
- PR boundary: `<plugin-root>/resources/commands/pr-boundary.md`
- Commit: `<plugin-root>/resources/commands/commit.md`
- PR/code review: `<plugin-root>/resources/commands/pr-review.md`
- Pattern rule-scope initialization: `<plugin-root>/resources/commands/pattern-init.md`
- Pattern rule extraction: `<plugin-root>/resources/commands/pattern-extract.md`
- Pattern review gate: `<plugin-root>/resources/commands/pattern-review.md`
- Pattern proposal promotion: `<plugin-root>/resources/commands/pattern-promote.md`

Deferred pattern-review maintenance surfaces exist for learning from downstream
findings and auditing rule-set health, but they are not part of the default v1
workflow. Use `<plugin-root>/resources/commands/pattern-learn.md` or
`<plugin-root>/resources/commands/pattern-audit.md` only
when the user explicitly asks for those later maintenance workflows.

## Scripts

Use scripts from `<plugin-root>/resources/scripts/`
for deterministic mechanics:

- `bootstrap_branch_docs.py`
- `pr_context.py`
- `boundary_gate.py`
- `boundary_packet.py`
- `feature_final.py`
- `decision_record.py`
- `decision_triage.py`
- `validate_branch_docs.py`

Use templates from `<plugin-root>/resources/templates/`
when creating branch docs.
