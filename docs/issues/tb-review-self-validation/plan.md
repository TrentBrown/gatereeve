# Plan - tb-review-self-validation

**Feature:** `tb-review-self-validation`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-26

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen shape, constraints, and boundaries.
- `interview.md` supplies the tally and the settled decisions D1-D8.

## Strategy

One slice and one PR. Edit the protocol source under
`plugin-src/shared/resources/protocol/` (`current/execution.js`,
`current/boundary-review.js`, `local-agent-adapters.js`, `agent-workflow.js`,
`current/evidence.js`, new `current/verdict-check-server.js`, new
`current/review-packet.js`, new `DEFINITION-OF-DONE.md`), the metrics
projection (`performance/workflow-projection.js`, `performance/fleet.js`),
`PROTOCOL.md`, `commands/pr-review.md`, policy pointers and the spec
template, then restage the desktop mirror. New tests go in
`cli/test/self-validation.test.js` and `cli/test/review-packet.test.js`;
paired-round and projection behavior extend the existing suites.

## Steps

- **P1.** Extract `checkReviewOutput(output, context)` from
  `executeGatesPrepared` and call it from the execution. **Advances:** R1.
- **P2.** `verdict-check-server.js`: stdio MCP server, one read-only tool,
  bounded input, per-gate report. **Advances:** R2.
- **P3.** Wiring: adapter capability, context file in the sealed view,
  `packet.selfValidation`, `request.selfValidation`, Claude and Codex
  arguments, receipt `isolation.selfValidation`, evaluator instruction.
  **Advances:** R3, R4.
- **P4.** `not-assessed` for peer findings in `checkVerdict`. **Advances:** R5.
- **P5.** Attempt kind through the review baseline, receipt `attempt`,
  outcome-row `attempts`, projection fields. **Advances:** R6.
- **P6.** `DEFINITION-OF-DONE.md`, `review-packet.js` incorporation,
  execution input and reuse binding, view files, packet field, instruction.
  **Advances:** R7.
- **P7.** `afterMergeCriteria`, candidate selection rules, packet field,
  instruction. **Advances:** R8.
- **P8.** Fixtures for R1-R8.
- **P9.** `PROTOCOL.md`, `commands/pr-review.md` guidance, template and policy
  pointers, desktop restage. **Advances:** R9.

## Verification

Focused: `node --test` on the touched test files. Broad: the CLI test suite
through CI (`ci` workflow) after review convergence. Local runs set
`GIT_CONFIG_GLOBAL=/dev/null`; the idle-inhibitor tests are left to CI on the
Mac.
