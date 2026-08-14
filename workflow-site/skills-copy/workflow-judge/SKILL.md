---
name: workflow-judge
description: "Independent compliance evaluation for specced software work. Use for LLM-as-judge style review, PR boundary verification, final feature verification, rubric compliance checks, scope creep checks, gap checks, or contradiction checks against spec.md."
---

# Workflow Judge

Read:

- `/Users/trent.brown/agentic-development-workflow/commands/judge.md`

Keep the judge pass isolated from implementation rationale. If subagents are
available and the user has authorized parallel agent work, use one. Otherwise
perform the isolated evaluation yourself from the spec and changed files only.
