---
name: software-development-workflow
description: "Portable software development lifecycle workflow. Use for non-trivial coding work, specced feature work, branch lifecycle docs, acceptance criteria, implementation plans, issue breakdowns, trackers, decision logs, review boundaries, completion reports, commits, and code reviews."
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
maintenance, review-boundary work, or completion reporting.

For workflow-state observation, preflight, or passage, also load:

`<plugin-root>/resources/PROTOCOL.md`

New features are governed by default. State-affecting skills must use the
plugin-local protocol adapter for governed features; the optional PATH CLI is
not a prerequisite. Existing work resumes through the current entry without interpreting old events. Never claim a
gate passed merely from prose when the protocol rejects or has not recorded the
passage.

## Command Map

Load the specific command file when the task matches:

- Branch start or missing docs: `<plugin-root>/resources/commands/branch-bootstrap.md`
- Draft AC/rubric: `<plugin-root>/resources/commands/spec-draft.md`
- Validate spec before planning: `<plugin-root>/resources/commands/spec-validate.md`
- Draft implementation plan: `<plugin-root>/resources/commands/plan.md`
- Post-merge completion recovery: `<plugin-root>/resources/commands/completion-recovery.md`
- Evaluate implementation against rubric: `<plugin-root>/resources/commands/spec-evaluate.md`
- Independent compliance pass: `<plugin-root>/resources/commands/judge.md`
- Record decision: `<plugin-root>/resources/commands/decision-record.md`
- Triage decisions: `<plugin-root>/resources/commands/decision-triage.md`
- Explicit slice readiness/advisory discovery: `<plugin-root>/resources/commands/advisory-review.md`
- Review boundary: `<plugin-root>/resources/commands/pr-boundary.md`
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

## Mechanics

For large temporary builds or disposable verification profiles, follow
`<plugin-root>/resources/STORAGE.md`. Prefer owned scratch helpers/commands over
ad hoc temporary directories. Export required evidence before cleanup; preserve
active sessions and release recovery outputs. Cleanup preview and Doctor storage
findings are advisory, not new workflow gates.

Use current protocol operations for execution, decisions, retained evidence and
passage. Portable scripts remain useful for specification/issues/tracker lint,
trusted workspace/PR resolution, pattern rules and document authoring. Do not use
retired boundary/journal helpers to create current passage. Individual commits
remain model-led work inside the authorized phase.

Use templates from `<plugin-root>/resources/templates/`
when creating branch docs.

For revised ready candidates, use the current protocol operations in
`resources/PROTOCOL.md`. The model chooses execution order within the authorized
phase. Readiness never automatically launches review; required evidence and
human authority remain enforced at milestones. Old runtime records are retained,
not replayed; resume unchanged planning with observed approvals.
