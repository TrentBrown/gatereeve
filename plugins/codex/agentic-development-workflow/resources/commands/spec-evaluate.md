# Spec Evaluate

Use before declaring a specced task done and at every PR boundary.

At a formal PR boundary, first resolve the `specEvaluation` gate through
`boundary_gate.py`. Use its cumulative `featureHome`, pinned source context,
and exact `outputPath`. Do not derive the feature folder from the delivery
branch or choose a top-level report name. Outside a formal boundary, retain the
normal cumulative-feature or legacy branch-folder behavior.

1. Read `spec.md`, `plan.md`, `issues.md`, and `tracker.md`.
2. Determine scope:
   - Per-PR: criteria mapped to completed/in-review issues or completed plan
     steps should be evaluated for PASS/FAIL. Future criteria remain `NOT YET`.
   - Final: every criterion must be PASS or FAIL; zero `NOT YET` may remain.
3. Run applicable DoD commands and record a verification matrix:
   - Build/typecheck command and result.
   - Lint/format command and result.
   - Unit test commands and result.
   - Integration test commands and result for changed API/database/webhook or
     cross-repo flows.
   - End-to-end or Playwright/browser smoke test commands and result for
     user-facing frontend workflows when practical.
   - Runtime/manual app verification result.
   - Any skipped category, with `N/A` or an explicit blocker reason.
4. Evaluate AC with concrete evidence.
5. Evaluate rubric with concrete evidence.
6. Update `tracker.md` when criteria move to PASS or FAIL.
7. Persist the evaluation at the formal gate `outputPath` when one was
   supplied.
8. Do not declare completion if any in-scope criterion fails.

Completion report format is defined in `WORKFLOW.md`.
