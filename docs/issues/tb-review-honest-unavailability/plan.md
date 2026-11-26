# Plan - tb-review-honest-unavailability

**Feature:** `tb-review-honest-unavailability`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-25

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies the re-measurement and the settled decisions D1–D6.

## Strategy

One slice and one PR. Edit only the protocol source under
`plugin-src/shared/resources/protocol/current/` (`execution.js`,
`boundary-review.js`, `core.js`) and `PROTOCOL.md`, then restage the desktop
mirror. Write a test first for each behavior in
`cli/test/current-boundary-review.test.js`, using the existing paired-review
fixture. Keep message changes additive: each keeps its leading sentence, so
existing assertions still match.

## Steps

- **P1.** Extract the consumed-proof resolution and verification requirement
  into one exported helper that raises `VERIFICATION_REQUIRED`. Call it from
  `executeBoundaryReviews` before `REVIEW_ROUND_STARTED` and from
  `executeGatesPrepared`. **Advances:** R1.
- **P2.** Tag errors thrown before job admission as refusals. Record the
  provider failure category on results. Classify the `BOUNDARY_REVIEWED`
  outcome rows. **Advances:** R2.
- **P3.** Move the per-reviewer round count to just before the provider
  launch. Skip the `BOUNDARY_REVIEWED` count when every outcome is
  `refused`. **Advances:** R3.
- **P4.** In `executeBoundaryReviews`, retry a `transient-service-failure`
  once, before the repair decision. The retry uses its own operation identity
  (distinct from the first attempt and the repair turn) on the same round
  baseline. **Advances:** R4, R5.
- **P5.** Name the field path or ID in each touched rejection, including the
  claim wording. **Advances:** R6.
- **P6.** Update `PROTOCOL.md`, fix the stale "Claude-only" sentence, and
  restage the desktop mirror. **Advances:** R7.
- **P7.** Record the measurement in the feature docs (already done in
  `interview.md`). **Advances:** R8.

## Verification

- Focused: `node --test cli/test/current-boundary-review.test.js cli/test/reviewer-contract.test.js cli/test/round-policy.test.js`.
- Broad: `npm test --prefix cli`, then hosted CI on the PR as the final
  Verification.
- **Final step:** Run full rubric evaluation and produce the completion report.
