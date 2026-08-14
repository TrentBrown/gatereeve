---
name: workflow-decision-triage
description: "Triage software decision logs at a PR boundary. Use before opening or updating a PR when scratchpad.md entries need promotion to decisions.md, when checking unreviewed decision entries, or when preparing permanent decision records."
---

# Workflow Decision Triage

Read:

- `/Users/trent.brown/agentic-development-workflow/commands/decision-triage.md`

Triage is blocked while any scratchpad entry remains `[ ]`. Ask the user to mark
entries `[x]` or `[-]` when human judgment is needed.

Use the script after markings are resolved:

```bash
python3 /Users/trent.brown/agentic-development-workflow/scripts/decision_triage.py --help
```
