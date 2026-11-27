# Plan - tb-convergence-severity-calibration

**Feature:** `tb-convergence-severity-calibration`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-27

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

One PR, one slice. Instruction changes first (small, in files #142 also
edits, so limited to the instruction strings and the version constant), then
the parser checks and the versioning, then documentation, fixtures and the
desktop restage. Focused tests per step; the CLI suite, the desktop check and
the Python script tests before review; hosted CI once after review converges.

## Steps

- **P1.** Severity rule, failure-model rule and light documentation bar in the
  code reviewer instructions (`execution.js`: `instructions`,
  `briefInstructions`; `REVIEW_CONTRACT_VERSION`) and the planning reviewer
  instructions (`delegation.js`). Contract text tests in
  `cli/test/reviewer-contract.test.js` (or a new focused test file).
  **Advances:** R1, R2, R6, R8.
- **P2.** `planning.js`: failure-model section check and unbounded-wording
  lint as a rules pass separate from fact extraction; `planning-facts/2`;
  `validatePlanning(body, { legacy })` returns warnings for old runs; the
  portable `planning-lint.js` applies the rules. Unit tests in
  `cli/test/current-planning.test.js`. **Advances:** R3, R4, R5.
- **P3.** `core.js`: decide grandfathering from the run's recorded spec
  validations (exact spec bytes, including amendment validations) and from a
  `run.resume-current` whose `planning.implementation` approval names the
  current commitments; pass it to `validatePlanning`; retain the warnings and
  `grandfathered: true` in the proof and return the warnings from
  `spec.validate`. Core tests through `spec.validate` and
  `run.resume-current` (implementation-approval and design-only).
  **Advances:** R5.
- **P4.** Spec template section; `spec-draft.md`, `spec-validate.md`,
  `light-run.md` and PROTOCOL.md text. **Advances:** R3, R6, R7.
- **P5.** Test fixture specs gain a failure model; restage the desktop
  protocol copy; run the CLI, desktop and Python checks. **Advances:** R8.

- **P6.** Delivery: commit, candidate, local Verification, paired boundary
  review rounds, push, open the PR with "Closes #143" and the decisions made
  for Trent, hosted CI as the final Verification, `review.publish`, and stop
  at a ready, unmerged PR. **Advances:** R8.

## Verification

- Focused: `cli/test/current-planning.test.js`,
  `cli/test/reviewer-contract.test.js`, the core spec-validation tests.
- Broad: the CLI test suite (Mac exclusions per local quirks), the desktop
  contract check, the Python script tests.
- Hosted Plugin CI after review converges.
- **Final step:** Run full rubric evaluation and produce the completion report.
