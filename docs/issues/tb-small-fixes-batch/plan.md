# Plan - tb-small-fixes-batch

**Feature:** `tb-small-fixes-batch`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-25

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.
- `brief.md` records the light-run phase that preceded the rigor change; its
  non-draft items carry over unchanged.

## Strategy

One PR from `tb-small-fixes-batch` into `main`. Keep the already-implemented
light-run fixes (P1, P4-P6). Replace the withdrawn "explain the draft
requirement" change with the approved relaxation (P2, P3). Regenerate the
staged desktop protocol copy, then run focused suites locally and hosted CI
once after paired review converges.

## Steps

- **P1.** `paginatedItems` helper with `--paginate --jq`; use it in
  `validation-scope.js` and `performance/import.js`. **Advances:** R1.
- **P2.** `merge.prepare` accepts any open PR; remove draft restoration from
  `merge()` cleanup and `protectedMerge` recovery; `goal.park` accepts any open
  PR. Tests for ready PRs, a failed-then-retried merge, a draft flip after
  authorization, and parking on a ready PR. **Advances:** R2, R3, R4.
- **P3.** Update PROTOCOL.md, WORKFLOW.md, light-run.md, pr-boundary.md and the
  CLI README. **Advances:** R5.
- **P4.** Isolation-evidence execution records. **Advances:** R6.
- **P5.** Scratch inventory device bound and tombstone race. **Advances:** R7.
- **P6.** PERFORMANCE.md line, `REGENERABLE` pin, `escalationRoots`.
  **Advances:** R8.
- **P7.** `stage:protocol` for the desktop copy; focused local suites.
  **Advances:** R1-R8.

## Verification

- **Final step:** Run full rubric evaluation and produce the completion report.
