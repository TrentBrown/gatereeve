# Review Boundary

Use when a coherent slice is ready for governed review. Pull requests are the
only active review mechanism. Read the repository's keepPullRequestsClosed
preference (default false); it applies to both slice and feature-final PRs.

1. Complete provisional verification, commit intended source, and push the
   delivery branch.
2. Prepare or reuse the exact PR and persist its context from a clean checkout:

   ```bash
   python3 "<plugin-root>/resources/scripts/pr_lifecycle.py" prepare \
     --cwd "$PWD" --title "Describe the change" --body-file /tmp/pr-body.md \
     --output /tmp/pr-context.json
   ```

   Add `--scope feature-final` for a final boundary. With the preference true,
   the helper immediately closes the PR, verifies closure, and pins that
   policy. Do not reopen for preparation or review. Existing manually prepared
   PRs can also use `pr_context.py resolve` after their state matches policy.

   Do not begin persistent boundary evidence before this succeeds. For a
   feature-final boundary, always use PR mode. The selected configured
   repository must already define its original `featureBaseSha`; when release
   differs from integration, the PR must be integration into release. Run
   `feature_final.py` with that persisted PR context and declare the packet
   `scope: feature-final` only after its ancestry and retention report pass.
3. Reconcile `issues.md` in the resolved cumulative feature home:
   - Completed work moves to `in-review` once its review surface exists.
   - New discovered work becomes new issues.
   - Drift between plan/issues/spec is resolved before PR review.
4. Update the cumulative `tracker.md` with plan steps covered, rubric criteria
   in scope or moved, and the DoD result.
5. For every gate, run `boundary_gate.py` with the same persisted context,
   boundary attempt ID via `--attempt-id`, and that gate's manifest name. Treat
   its `diffBaseSha`, `diffHeadSha`,
   `changedFiles`, and `outputPath` as authoritative. Do not let a gate infer
   its own upstream, branch, diff, feature folder, or filename.
   For `scope: feature-final`, pass `--scope feature-final`. Verification,
   spec evaluation, and judge then receive the complete-feature range; code
   review, pattern review, and explain-diff retain the focused final-slice
   range.
6. Execute and write the verification matrix to the `verification` gate's
   `outputPath`. Do not collapse this to "tests passed"; list exact commands and
   outcomes for every applicable category:
   - Build/typecheck.
   - Lint/format checks on changed files.
   - Unit tests for changed logic.
   - Integration tests for API/database/webhook/cross-repo flows.
   - End-to-end or Playwright/browser smoke tests for user-facing frontend
     workflows when practical.
   - Application runtime verification.
   - Known unrelated failures, with evidence that they are unrelated.
7. Run the deterministic branch-document validators from
   `<plugin-root>/resources/scripts/`; each must exit 0 or be explicitly waived:
   - `validate_branch_docs.py`
   - `lint_issues.py`
   - `lint_tracker.py`
   - `gate_triage.py` after decision triage
8. Run `pattern-review` when pattern rules are configured or the gate otherwise
   applies. Pass its gate context's pinned base and head to the deterministic
   helper and persist the report at its `outputPath`. Findings block review
   unless fixed, manually reviewed, or explicitly waived.
9. Run scoped `spec-evaluate`, write its report at the `specEvaluation`
   `outputPath`, and update tracker criteria from evidence.
10. Run `judge` for significant specced changes. A judge `FAIL` blocks review
    unless the user explicitly accepts the risk. Write the result at the
    `judge` `outputPath` and record its verdict in the tracker or PR body.
11. Run `workflow-pr-review` on the pinned boundary diff. Findings must include
    file/line references; if none exist, record residual risks and test gaps at
    the `codeReview` `outputPath`.
12. Run `explain-diff` against the same pinned diff after the review and
    evaluation artifacts are current. Persist it at the `explainDiff`
    `outputPath`.
13. Run `decision-triage`, then `gate_triage.py` to confirm zero untriaged
    entries remain.
14. Immediately before finalizing evidence, recheck the persisted context.
    Use `pr_context.py check-current`; governed module execution checks
    the PR through the same protocol guard. Any changed remote or
    local source invalidates affected gates.
15. Finalize `boundary.json`, the tracker Review Log packet link, and the review
    surface with summary, decisions, verification matrix, judge verdict,
    code-review result, explain-diff artifact, known failures, and manual checks.
    A feature-final PR description and completion report must also include the
    retention status from `feature_final.py`. If retention is not `tracked`,
    completion requires an explicit human retention decision; do not imply
    that the feature record was archived.
16. Validate the pending packet structurally, commit only declared evidence,
    push it while the PR remains in its configured review state, run
    `pr_context.py finalize` with each evidence path, and run `boundary_packet.py validate`
    from the clean final checkout.
17. Request human review only after the prior steps complete or are explicitly
    waived by the user. For governed features, every gate result must first be
    recorded with its current input fingerprint and the request must pass through
    the protocol adapter; direct artifact completion does not advance state.
18. After explicit human authorization to merge the exact reviewed final head,
    run `pr_lifecycle.py merge` with that head, an authorization label and each
    evidence path. It validates direction, identity and evidence before
    reopening, waits for reported checks, and uses GitHub's protected merge.
    Failure re-closes the unmerged PR. Record actual merge passage only through
    the protocol after reviewed-content integration is verified.
