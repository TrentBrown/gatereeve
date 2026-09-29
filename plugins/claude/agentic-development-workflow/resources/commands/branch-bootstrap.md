# Branch Bootstrap

Use this when starting a specced feature, beginning a sequential delivery
branch, or repairing missing workflow docs.

1. Resolve workspace context with
   `scripts/workflow_context.py resolve --cwd <working-path> --json`.
   Configured mode uses the stable `featureId` from the nearest ancestor
   `.agentic-workflow.json`; legacy mode uses the current Git branch.
2. Confirm a configured current branch is either the exact feature ID or a
   sequential branch named `<featureId>-<ordinal>-<description>`.
3. Query the plugin protocol adapter. For a missing new feature, initialize it
   through `feature.init`; this atomically creates the model lock, journal, and
   active `interview.md` and enters `DESIGNING`. If the resolved feature is
   legacy, do not adopt it implicitly.
4. As governed phases pass, create the applicable missing workflow docs from
   templates:
   - `interview.md`
   - `spec.md`
   - `plan.md`
   - `issues.md`
   - `tracker.md`
   - `scratchpad.md`
   - `decisions.md`
5. Draft acceptance criteria and rubric only after the design gate passes.
   When drafting, use `design.md` as the controlling input and `interview.md`
   as required supporting material. Otherwise leave clear TODOs.
6. Do not invent implementation plan detail before AC and rubric are approved.
   When creating `plan.md`, use `spec.md` as the controlling input and
   `design.md` plus `interview.md` as required supporting material.
7. Run `scripts/validate_branch_docs.py docs/issues/{featureId}` and fix structural
   gaps.

Useful script:

```bash
python3 "<plugin-root>/resources/scripts/bootstrap_branch_docs.py"
```

The Python bootstrap remains a legacy/repair helper. It is not the passage
authority for a governed feature.
