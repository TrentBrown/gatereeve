---
name: handoff
description: "Write an inter-agent handoff document. Use when work transfers to a different agent, persona, or tool (planner to implementer, Claude to Codex, etc.), or when the user says /handoff or hand this off."
---

A handoff transfers work to a different agent. It is ALWAYS interactive.

Before writing, ask briefly (a mini-grill, one or two questions):

1. Who is the recipient and what is their objective?
2. Is anything load-bearing that is not obvious from the work so far?

Then write the handoff file:

- Location: `.handoffs/` in the current worktree root (create if absent).
  The directory is gitignored globally; never commit it.
- Filename: `HANDOFF-{recipient}-{YYYY-MM-DDTHHMM}.md`.
- Header metadata: timestamp, repo, branch, originating session/agent,
  recipient, recipient's objective.
- Sections, all required (write "none" rather than omitting):
  - `## Goal / intent`
  - `## Current state`
  - `## Decisions and rationale`
  - `## Dead ends already tried`
  - `## Open questions`
  - `## Exact next action`
  - `## Relevant paths and commands`

Reference the branch scratchpad/decisions files for decision detail rather
than duplicating them. Keep the handoff resumption-focused: what the
recipient needs in order to continue, not a narrative of the session.
