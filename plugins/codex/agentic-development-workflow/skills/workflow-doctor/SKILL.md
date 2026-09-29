---
name: workflow-doctor
description: Diagnose whether an installed Agentic Software Development Workflow plugin is ready. Use after installation, setup, or updates, and when workflow activation, skills, resources, prerequisites, policy configuration, or duplicate legacy installs may be broken.
---

# Workflow Doctor

Run the bundled deterministic readiness checks and preserve their failure
status. Optional specialist integrations are informational and never block
readiness.

## Procedure

1. Resolve `<plugin-root>` from the real path of this `SKILL.md` as described in
   `<plugin-root>/resources/RESOURCE-ROOT.md`.
2. Determine whether the current session contains this exact injected policy:

   `For non-trivial software work, load the software-development-workflow skill unless the user explicitly asks to bypass it.`

3. Run:

```bash
python3 "<plugin-root>/resources/scripts/workflow_doctor.py" \
  --plugin-root "<plugin-root>" \
  --repository "<current-repository>"
```

Append `--activation-observed` only when the exact policy in step 2 is present
in the current session context. Its absence is a real activation failure; do
not infer activation merely because this skill was invoked explicitly.

4. Report every failing check with the helper's remediation. Do not replace a
   nonzero result with a conversational pass.
5. When all required checks pass, state that this harness is ready. Report
   optional integrations separately.

The helper is read-only. Use `workflow-setup` to repair profile or branch-prefix
configuration, the native plugin manager to repair installation or enablement,
and the Codex `/hooks` surface to review and trust a skipped Codex hook.
