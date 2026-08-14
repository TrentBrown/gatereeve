---
name: workflow-decision-record
description: "Record a software development decision in docs/issues/{branch}/scratchpad.md. Use when a decision trigger fires: cross-repo change, schema change, dependency change, security change, API contract change, incidental bug fix, scope expansion, surprising implementation choice, hidden invariant, or explicit user request to record a decision."
---

# Workflow Decision Record

Read:

- `/Users/trent.brown/agentic-development-workflow/WORKFLOW.md`
- `/Users/trent.brown/agentic-development-workflow/commands/decision-record.md`

Use the script for mechanical appends when useful:

```bash
python3 /Users/trent.brown/agentic-development-workflow/scripts/decision_record.py --help
```

Record decisions when they happen. New entries start unreviewed with
`[ ] **Promote**`.
