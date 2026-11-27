# Plan - tb-review-verdict-normalization

**Feature:** `tb-review-verdict-normalization`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-26

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen shape, constraints, and boundaries.
- `interview.md` supplies the re-tally and the settled decisions D1–D10.

## Strategy

One slice and one PR. Edit the protocol source under
`plugin-src/shared/resources/protocol/` (`local-agent-adapters.js`,
`current/execution.js`, `current/boundary-review.js`), the metrics projection
(`performance/workflow-projection.js`, `performance/fleet.js`), `PROTOCOL.md`
and `commands/pr-review.md`, then restage the desktop mirror. Unit fixtures go
in a new `cli/test/verdict-normalization.test.js`; paired-round behavior uses
the existing fixture in `cli/test/current-boundary-review.test.js`.

## Steps

- **P1.** Prose unwrap in `parseObject`, only when the caller passes a list
  to record `prose-unwrapped` rows in. The adapters pass one only when
  `runStage` receives an `onNormalized` hook and report the rows through it;
  the stage-result shape is unchanged. `independent()` passes the hook and
  adds the rows to each verdict of the execution. **Advances:** R1.
- **P2.** Schema-guided `stripUnknown` before `validateJsonSchema`, and the
  envelope strip. **Advances:** R2.
- **P3.** `checkVerdict`: PASS with blocking finding → FAIL; `present`
  non-blocking accepted; undisclosed disposition dropped; field paths on the
  unaffected-open and criterion-outcome errors. **Advances:** R3, R5, R6, R7.
- **P4.** `validateFormatRepair`: outcome allowance and omitted dispositions.
  **Advances:** R4.
- **P5.** Stale claims dropped before packet assembly and recorded on results.
  **Advances:** R6.
- **P6.** `rejectionRule` on contract UNAVAILABLE results; per-rule
  observations in the metrics projection. **Advances:** R8.
- **P8.** Tally fixtures. **Advances:** R9.
- **P9.** `PROTOCOL.md`, `commands/pr-review.md`, desktop restage.
  **Advances:** R10.

## Verification

Focused: `node --test` on the touched test files. Broad: the CLI test suite
through CI (`ci` workflow) after review convergence. Local runs set
`GIT_CONFIG_GLOBAL=/dev/null`; the idle-inhibitor tests are left to CI on the
Mac.
