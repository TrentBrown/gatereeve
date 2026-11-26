# Spec - tb-waiver-light-friction

**Feature:** `tb-waiver-light-friction`
**Created:** 2026-11-25

## Summary

Closes GitHub issue #145: an explicit human waiver gets past the verification
coverage check and is recorded honestly; a light run's findings log grows
without re-authorization; `run.start` writes the feature base sha.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** With a candidate whose latest verification passes but leaves prior
  checks uncovered (a narrower reused run) and whose paired review has one
  UNAVAILABLE reviewer, a human `waive` of `review` and `verification` with
  `actions: ["accept"]` is recorded, and the acceptance milestone is allowed
  and passes, in both light and full rigor.
- **AC2.** In that waived acceptance, the review outcome stays `UNAVAILABLE`,
  the verification outcome stays `PASS` and carries `waivedCoverage` naming the
  uncovered prior behavior, both carry their exception, the acceptance
  `MILESTONE` record retains them, and the `waive` decision records the
  observed outcome of each waived gate.
- **AC3.** Without a verification waiver the same candidate's acceptance is
  still blocked by the uncovered-coverage message, and a waive-and-accept that
  is still blocked names what is missing in its refusal.
- **AC4.** In a supervised light run, appending to the brief's findings log
  after `authorize-implementation` keeps implementation authority (the
  implementation milestone stays allowed and `candidate.prepare` succeeds)
  with no new decision; a change outside the findings log still requires a new
  `authorize-implementation`.
- **AC5.** When `run.start` writes the minimal workspace configuration, it
  includes `featureBaseSha` equal to the merge base of `HEAD` and the default
  branch, and a FEATURE-scope `candidate.prepare` from that base succeeds
  straight after `run.start` with no hand edit.
- **AC6.** The desktop copy of the protocol matches the canonical source and
  the CLI test suite passes.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1 waiver accepted | Test shows waive+accept recorded and acceptance passes for light and full | Decision refused or acceptance blocked | `cli/test/current-waivers.test.js` |
| R2 | AC2 honest record | Test asserts UNAVAILABLE review, PASS verification with `waivedCoverage`, exceptions, MILESTONE outcomes and decision `observed` | Any waived fact missing or rewritten | `cli/test/current-waivers.test.js` |
| R3 | AC3 no waiver, no pass | Test shows blocked acceptance without verification waiver and a refusal naming missing items | Acceptance allowed without waiver, or bare refusal | `cli/test/current-waivers.test.js` |
| R4 | AC4 findings log | Test shows authority kept after a log append and lost after a scope edit | Re-authorization needed for a log append, or a scope edit keeps authority | `cli/test/current-waivers.test.js` |
| R5 | AC5 feature base | Test shows written `featureBaseSha` and FEATURE `candidate.prepare` after `run.start` | No base written or FEATURE prepare refused | `cli/test/current-workspace-config.test.js` |
| R6 | AC6 parity and suite | Copies match and `npm test --prefix cli` passes | Copy drift or failing suite | Parity test and CI run |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
