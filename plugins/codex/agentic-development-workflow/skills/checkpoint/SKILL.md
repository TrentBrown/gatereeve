---
name: checkpoint
description: "Freeze session state for later resumption. Use when the user says /checkpoint, when a workflow gate passes, or proactively before context compaction when the context window nears exhaustion."
---

A checkpoint freezes the current session state so a fresh session can resume
at low context utilization. It may run silently (no questions needed).

Write two files in the current worktree root:

1. `CHECKPOINT.md` - the stable latest pointer; overwrite it.
2. `.checkpoints/CHECKPOINT-{YYYY-MM-DDTHHMM}.md` - timestamped archive copy.

Both are gitignored globally; never commit them.

Header metadata: timestamp, repo, branch, originating session/agent, and
trigger (`at-will` | `gate:{name}` | `pre-compaction`).

Sections, all required (write "none" rather than omitting):

- `## Goal`
- `## Current position`
- `## In-flight work`
- `## Exact next action`
- `## Open questions`
- `## Relevant paths and commands`

Capture STATE, not reasoning: reference the branch scratchpad/decisions
files for decisions rather than duplicating them. On resumption, a fresh
session reads `CHECKPOINT.md` first.

Do not use checkpointing as a substitute for maintaining workflow artifacts.
During a Grill Me interview, keep `interview.md` current explicitly; the
checkpoint only preserves resumability.
