# Plan - tb-waiver-light-friction

**Feature:** `tb-waiver-light-friction`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-25

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Test first against the real core (the failing waiver test already reproduces
the refusal), then make the smallest protocol change per item, then sync the
desktop copy and run the CLI suite.

## Steps

- **P1.** Verification waiver covers coverage and CI-scope checks in
  `core.js` `checkObserved`; record `waivedCoverage`, decision `observed` and a
  named refusal. **Advances:** R1, R2, R3.
- **P2.** Light commitment subject persists across findings-log-only brief
  changes in `core.js` `commitments()`. **Advances:** R4.
- **P3.** `run.start` writes `featureBaseSha` in `workspace.js`; update the
  workspace-config tests. **Advances:** R5.
- **P4.** Update `PROTOCOL.md` (decisions, light rigor, workspace
  configuration), copy protocol sources to `apps/desktop/resources`, run the
  suite. **Advances:** R6.

## Verification

- **Final step:** Run full rubric evaluation and produce the completion report.
