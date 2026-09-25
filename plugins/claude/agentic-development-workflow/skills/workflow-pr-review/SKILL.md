---
name: workflow-pr-review
description: "Review software pull requests or local diffs. Use when the user asks for PR review, code review, pre-human-review checks, review artifact creation, bug/regression/security/test-gap findings, or spec compliance review of a PR diff."
---

# Workflow PR Review

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Read:

- `<plugin-root>/resources/policy/WORKFLOW.md`
- `<plugin-root>/resources/commands/pr-review.md`

Use a code-review stance. Findings come first, ordered by severity, with
file/line references. If there are no findings, say that and list residual
risks or test gaps.

At a formal PR boundary, consume the `codeReview` result from
`boundary_gate.py`, review only its pinned base/head diff, and persist the
result at its exact packet `outputPath`.
