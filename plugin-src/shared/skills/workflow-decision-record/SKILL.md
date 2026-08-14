---
name: workflow-decision-record
description: "Record a software development decision in the resolved docs/issues/{featureId}/scratchpad.md. Use when a decision trigger fires: cross-repo change, schema change, dependency change, security change, API contract change, incidental bug fix, scope expansion, surprising implementation choice, hidden invariant, or explicit user request to record a decision."
---

# Workflow Decision Record

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Read:

- `<plugin-root>/resources/policy/WORKFLOW.md`
- `<plugin-root>/resources/commands/decision-record.md`

Use the script for mechanical appends when useful:

```bash
python3 "<plugin-root>/resources/scripts/decision_record.py" --help
```

Record decisions when they happen. New entries start unreviewed with
`[ ] **Promote**`.
