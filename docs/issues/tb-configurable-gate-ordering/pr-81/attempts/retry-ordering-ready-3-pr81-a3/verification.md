# Verification - tb-configurable-gate-ordering

**Outcome:** PASS
**Scope:** FEATURE_FINAL, complete feature
**Pinned base:** 64db6b635f03018581a8977a7b6933bc59b2ccbd
**Pinned source:** 2615083f3e3151a3c75730ce3fefbe188177b302
**Tested implementation:** 2856d864708ce8c93f05593209d30c3969c783b5

Trusted Git comparison confirms the only delta from fully tested implementation to the pinned source is the four tracked readiness/advisory disposition records. Source, tests, build/config, module definitions and approved requirements are unchanged. This is fresh attempt evidence; no older formal gate PASS or fingerprint is reused.

| Category | Command / check | Result | Retained evidence |
|---|---|---|---|
| Full CLI/core | npm test --prefix cli (portable acceptance) | PASS410 tests | runtime/portable-acceptance-3.log |
| Full Desktop | npm test --prefix apps/desktop | PASS212 tests | runtime/desktop-tests-3.log |
| Workflow/pattern Python | Python unittest discovery in workflow and pattern test directories | PASS104+28 tests | runtime/portable-acceptance-3.log |
| Template tests | Python template unittest discovery | PASS2 tests | runtime/portable-acceptance-3.log |
| Dependency audit | npm audit --prefix cli --audit-level=high | PASS, zero vulnerabilities | runtime/portable-acceptance-3.log |
| Portable build | bash ci/portable-acceptance.sh; deterministic Codex/Claude builds, shared-file integrity and isolated structural Doctor | PASS | runtime/portable-acceptance-3.log |
| Syntax/docs | node --check changed JS; spec/branch/issues/tracker/decision validators; git diff --check | PASS | runtime/fast-checks-3.log |
| Integration | Actual core/manager/IPC/preload/DOM guards, stale/discard/confirmation/catalog/model/progress conflicts and own-byte rollback | PASS | runtime/host-conflict-regressions-3.log; runtime/desktop-tests-3.log |
| Browser visual | Local Desktop visual fixture: SVG exact arrows, labels, node inspection and named relationship disclosure | PASS simulated fixture | implementation browser observation, no installed activation claim |

No unrelated test failures. Core and package evidence are structural/runtime test proof, not release/publication or installed activation. Hosted PR checks separately report acceptance, containers, macOS package and Apple-Silicon/Intel packaged runtime SUCCESS at implementation head2856d86; exact final-head checks will be reverified after evidence finalization.
