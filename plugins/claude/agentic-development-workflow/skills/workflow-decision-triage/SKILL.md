---
name: workflow-decision-triage
description: "Triage software decision logs at a PR boundary. Use before opening or updating a PR when scratchpad.md entries need promotion to decisions.md, when checking unreviewed decision entries, or when preparing permanent decision records."
---

# Workflow Decision Triage

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Read:

- `<plugin-root>/resources/commands/decision-triage.md`

Triage is blocked while any scratchpad entry remains `[ ]`. Ask the user to mark
entries `[x]` or `[-]` when human judgment is needed.

Use the script after markings are resolved:

```bash
python3 "<plugin-root>/resources/scripts/decision_triage.py" --help
```
