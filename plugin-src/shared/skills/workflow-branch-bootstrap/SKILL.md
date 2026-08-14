---
name: workflow-branch-bootstrap
description: "Create or repair cumulative feature lifecycle docs for specced software work. Use when starting a feature or sequential delivery branch, resolving docs/issues/{featureId}, bootstrapping spec.md, plan.md, issues.md, tracker.md, scratchpad.md, decisions.md, or bringing an existing feature folder up to workflow format."
---

# Workflow Branch Bootstrap

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Read:

- `<plugin-root>/resources/policy/WORKFLOW.md`
- `<plugin-root>/resources/policy/WORKSPACE-CONTEXT.md`
- `<plugin-root>/resources/commands/branch-bootstrap.md`

Use the bootstrap script when mechanical doc creation is appropriate:

```bash
python3 "<plugin-root>/resources/scripts/bootstrap_branch_docs.py"
```

After creation, inspect the generated docs and replace TODOs only with
requirements or facts grounded in the user's request and repo context. Do not
invent a plan before AC and rubric are approved.
