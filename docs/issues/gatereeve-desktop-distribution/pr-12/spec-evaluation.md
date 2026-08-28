# Specification Evaluation - PR #12

**Scope:** Apple trust boundary P6 / I-9 keychain-discoverability follow-up

**Pinned range:** `8a93f4a1ad31f5b77fdea061ff6c8a7f9b5d82df..6d3ef5da66e2286e5067b23df70fc1cef12ded8c`

## Definition of Done

- **Build status:** PASS - hosted universal macOS packaging passes.
- **Lint status:** PASS - YAML parse, feature-document validators, focused
  workflow contract, and `git diff --check` pass.
- **Tests written:** The coordinated-workflow contract now requires both
  temporary search-list extension and cleanup restoration.
- **Test suite status:** PASS with one local environment limit - all thirteen
  hosted checks pass; local portable acceptance passes 116/117 tests and cannot
  start one unrelated test because `unzip` is absent.
- **Integration verified:** The deterministic workflow contract and every
  ordinary hosted job pass. The corrected protected Apple job is necessarily a
  post-merge rehearsal.
- **Application runs:** Yes - the exact universal development DMG passes native
  governed-fixture smoke on Apple Silicon and Intel.
- **Pending manual verification:** Approve and observe the corrected protected
  nonpublishing rehearsal from merged `main`.

## Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| AC5 - Apple trust and credential readiness | ADVANCED / NOT YET | The live rehearsal isolated a keychain lookup defect after successful credential validation. The fix exposes only the ephemeral identity during signing, preserves runner defaults, and restores state during unconditional cleanup. Actual signing, notarization, and public trust proof remain pending. |
| AC6 - Coordinated and recoverable releases | ADVANCED / NOT YET | The protected preparation remains exact-source, nonpublishing, approval-gated, and recoverable. A successful corrected rehearsal and later public convergence remain. |

## Rubric

| # | Criterion | Result | Scope | Notes |
|---|---|---|---|---|
| R5 | Apple trust | NOT YET | P6 plus P8/P10 | The credential path is valid and the observed keychain lookup defect is corrected; protected signing and notarization must still be rerun. |
| R6 | Coordinated release and recovery | NOT YET | P5, P6, P8, P10 | Candidate preparation and native checks remain green; live trusted preparation and later publication evidence remain. |

No acceptance criterion is contradicted and no publication authority is added.
The correction is reviewable, but I-9 and R5 remain open until the protected
rehearsal succeeds.
