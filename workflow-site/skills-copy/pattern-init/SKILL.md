---
name: pattern-init
description: "Initialize a pattern-review rule scope. Use before pattern-extract, pattern-promote, pattern-audit, or pattern-review when a repo, client directory, worktree, or parent scope does not yet have a .pattern-review directory and empty lifecycle YAML files."
---

# Pattern Init

Use this to intentionally create a `.pattern-review` scope. Scope creation is a
governance decision; do it before extraction when no existing pattern-review
directory should receive proposals.

Deterministic helper:

```bash
python3 /Users/trent.brown/agentic-development-workflow/scripts/pattern_tool.py init <target>
```

Workflow:

1. Choose the directory that should own the rules. For a per-repo primitive,
   initialize the repo root. For a client-level rule set, initialize the shared
   parent directory that sits above peer repos.
2. Run the helper against that target.
3. Confirm the helper created or found:
   - `.pattern-review/rules.yaml`
   - `.pattern-review/proposals.yaml`
   - `.pattern-review/deferred.yaml`
   - `.pattern-review/rejected.yaml`
   - `.pattern-review/README.md`
4. Do not add active rules during init. `rules.yaml` starts empty; use
   `pattern-extract` and `pattern-promote` for rule creation.
5. If the target already has lifecycle files, leave them intact and report them
   as existing. Do not overwrite rule state during init.
