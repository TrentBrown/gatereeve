---
name: workflow-setup
description: Configure the installed Agentic Software Development Workflow policy profile and developer-specific branch prefix. Use after first installing or resetting the plugin, when changing between portable-core and QualityCode policy, or when applying an explicit repository-local override.
---

# Workflow Setup

Configure the workflow through namespaced Git settings. Never infer a branch
prefix from the current user, machine, repository, or another developer.

## Procedure

1. Resolve `<plugin-root>` from the real path of this `SKILL.md` as described in
   `<plugin-root>/resources/RESOURCE-ROOT.md`.
2. If the user did not select a profile, ask them to choose `quality-code`
   or `portable-core`.
3. If the user did not provide a branch prefix, ask for it. Do not supply a
   maintainer-specific default.
4. Use global scope unless the user explicitly requests a repository-local
   override. For local scope, confirm the target repository.
5. Run the deterministic helper:

```bash
python3 "<plugin-root>/resources/scripts/workflow_setup.py" \
  --plugin-root "<plugin-root>" \
  --profile "<profile>" \
  --branch-prefix "<prefix>"
```

For an explicit repository override, append:

```text
--scope local --repository "<repository-path>"
```

6. Report the recorded scope, profile, and prefix. Recommend a fresh agent
   session followed by `workflow-doctor` after first-run setup.

Do not edit personal instruction files or platform configuration as part of
this skill.
