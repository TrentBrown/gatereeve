---
name: software-development-workflow
description: "Home-level software development lifecycle workflow. Use for non-trivial coding work, specced feature work, branch lifecycle docs, acceptance criteria, implementation plans, issue breakdowns, trackers, decision logs, PR boundaries, completion reports, commits, and PR reviews."
---

# Software Development Workflow

Follow the canonical workflow at:

`/Users/trent.brown/agentic-development-workflow/WORKFLOW.md`

Load that file before substantial implementation, branch planning, workflow doc
maintenance, PR boundary work, or completion reporting.

## Command Map

Load the specific command file when the task matches:

- Branch start or missing docs: `commands/branch-bootstrap.md`
- Draft AC/rubric: `commands/spec-draft.md`
- Validate spec before planning: `commands/spec-validate.md`
- Draft implementation plan: `commands/plan.md`
- Evaluate implementation against rubric: `commands/spec-evaluate.md`
- Independent compliance pass: `commands/judge.md`
- Record decision: `commands/decision-record.md`
- Triage decisions: `commands/decision-triage.md`
- PR boundary: `commands/pr-boundary.md`
- Commit: `commands/commit.md`
- PR/code review: `commands/pr-review.md`
- Pattern rule-scope initialization: `commands/pattern-init.md`
- Pattern rule extraction: `commands/pattern-extract.md`
- Pattern review gate: `commands/pattern-review.md`
- Pattern learning from downstream findings: `commands/pattern-learn.md`
- Pattern proposal promotion: `commands/pattern-promote.md`
- Pattern rule-set audit: `commands/pattern-audit.md`

## Scripts

Use scripts from `/Users/trent.brown/agentic-development-workflow/scripts/`
for deterministic mechanics:

- `bootstrap_branch_docs.py`
- `decision_record.py`
- `decision_triage.py`
- `validate_branch_docs.py`

Use templates from `/Users/trent.brown/agentic-development-workflow/templates/`
when creating branch docs.
