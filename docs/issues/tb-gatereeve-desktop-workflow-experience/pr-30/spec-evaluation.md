# PR #30 Specification Evaluation - Alert and attention policy

**Evaluation scope:** P7 / I-7 against pinned diff
`68e0c17c9274401cc938ae8c01b84f935a4128fe..f1af98bc9175aec38b4236c744972614ed9ce46f`.

## Definition of Done

- **Build status:** PASS - protocol staging completed as the Desktop test preflight; no separate renderer build/typecheck script exists.
- **Lint status:** PASS - pinned diff passes `git diff --check`.
- **Tests written:** alert-policy unit matrix, renderer locality and current-guidance integration assertions, accessibility contract updates, and visual fixture scenario coverage.
- **Test suite status:** PASS - `cd apps/desktop && npm test`; 110 passed, 0 failed.
- **Integration verified:** Yes - production renderer modules were exercised through the full Desktop suite and deterministic visual fixture.
- **Application runs:** N/A for this renderer-only slice - fixture-first verification is approved; final Electron runtime verification remains P8/I-8.
- **Pending manual verification:** Review the default and seven alternate visual-fixture query scenarios before merge; P8 retains full runtime, minimum-width, and reduced-motion verification.

## Acceptance Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC7 | Exception-only alerts, object-local conditions, and current-state guidance | PASS for P7 slice | `presentation.js:27`, `index.html:84`, `renderer.js:330`, `renderer.js:631`, `presentation.test.js:111`, and `renderer.test.js:338` prove consolidated/deduplicated alerts, quiet Sources, removed Attention UI, local gate conditions, conditional expandable guidance, and selection independence. |
| AC8 | Accessible meanings and interactions affected by P7 | PASS for P7 slice | Native `details`/`summary`, `role="alert"`, text-bearing Setup/gate/action states, accessibility contract tests, and all 110 Desktop tests pass. Full assembled-layout/runtime obligations remain P8. |

## Rubric

| # | Criterion | Result | Scope | Notes |
|---|---|---|---|---|
| R7 | Alert policy | PASS for P7 implementation; overall `NOT YET` | P7 / I-7 | The exception matrix and current-guidance invariants pass automated tests and the eight-scenario visual fixture. Overall tracker status stays `NOT YET` until P8 running-app visual verification. |
| R8 | Accessibility and constrained layout | PASS for P7 changes; overall `NOT YET` | P7 contribution | New disclosures and semantics are keyboard-native and text-bearing. P8 retains minimum-size, reduced-motion, and assembled-runtime checks. |

No in-scope failure blocks PR #30 review.
