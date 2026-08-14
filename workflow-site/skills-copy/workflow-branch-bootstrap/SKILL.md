---
name: workflow-branch-bootstrap
description: "Create or repair the standard branch lifecycle docs for specced software work. Use when starting a feature branch, creating docs/issues/{branch}, bootstrapping spec.md, plan.md, issues.md, tracker.md, scratchpad.md, decisions.md, or bringing an existing branch folder up to workflow format."
---

# Workflow Branch Bootstrap

Read:

- `/Users/trent.brown/agentic-development-workflow/WORKFLOW.md`
- `/Users/trent.brown/agentic-development-workflow/commands/branch-bootstrap.md`

Use the bootstrap script when mechanical doc creation is appropriate:

```bash
python3 /Users/trent.brown/agentic-development-workflow/scripts/bootstrap_branch_docs.py
```

After creation, inspect the generated docs and replace TODOs only with
requirements or facts grounded in the user's request and repo context. Do not
invent a plan before AC and rubric are approved.
