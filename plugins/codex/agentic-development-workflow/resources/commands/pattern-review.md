# Pattern Review

Use this as the pattern-review gate before human review or at PR boundaries.
The command reviews the formal boundary's pinned diff, or the current branch
diff for a standalone invocation, against active pattern-review rules and
persists a report before declaring the gate passed.

Input:

- Optional target repo or worktree path.
- If no argument is provided, use the current Git repository.
- At a formal PR boundary, the persisted PR context supplied by the boundary
  orchestrator is required.

Procedure:

1. Load and follow the `pattern-review` skill.
2. At a formal boundary, resolve the `patternReview` gate with
   `boundary_gate.py`. Run the deterministic helper with its exact values:

   ```bash
   python3 "<plugin-root>/resources/scripts/pattern_tool.py" review-inputs \
     --cwd <repositoryRoot> \
     --base <diffBaseSha> \
     --head <diffHeadSha>
   ```

   Persist the report at the returned `outputPath`. Never infer another base,
   head, feature folder, or filename. Outside a formal boundary, run the helper
   without `--head` and retain its normal repository/upstream fallback.
3. If no applicable `.pattern-review` directory is found after the normal scope
   walk, fail and tell the caller to run `/pattern-init <intended-scope>`.
4. Display the `.pattern-review` directories found in the rule stack before
   evaluating rules so the caller can spot an unexpected scope.
5. If no active rules are found in an existing scope, write a
   `PASS_WITH_WARNINGS` report stating
   that the gate is not meaningfully configured and recommend `pattern-extract`.
6. Evaluate deterministically triggered rules and make explicit trigger
   decisions for agentic rules.
7. For triggered reviews, inspect the changed files and return `pass`, `fail`,
   `warning`, `not_applicable`, or `needs_manual_review` with evidence.
8. Block on unresolved manual reviews and blocker failures unless the user
   explicitly waives them.
9. Persist the final report before declaring completion. At a formal boundary,
   use the resolved packet `outputPath`; otherwise use
   `docs/issues/<featureId>/pattern-review.md` as the legacy standalone path.
10. If the gate fails, fix the implementation or record a manual review/waiver,
   then rerun.

Output:

- The active packet's `pattern-review.md` at a formal boundary, or an explicitly
  named standalone report path
- Final verdict: `PASS`, `PASS_WITH_WARNINGS`, `PASS_WITH_WAIVERS`, or `FAIL`
