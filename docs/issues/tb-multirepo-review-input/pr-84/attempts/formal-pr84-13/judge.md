# Independent workflow judgment: FAIL

Evaluated the full feature at `6bb9263184aa3b9fd7bae09dc0e5df35abb7b05d` against the bound approved specification and design. **20 criteria pass; R18 fails.** Scope passes; gap and contradiction checks fail.

The specification, design, inventory, full Verification report, patch chunks and runtime attachment were read. Their checked digests match the supplied bindings. The inventory contains 307 entries: 50 additions, 100 modifications and 157 deletions, with no binary changes or renames. Review covered the complete feature and relevant shared implementation.

## Criterion results

| Criterion | Result | Assessment and evidence |
|---|---|---|
| R1 | PASS | Planning authority and all four milestone predicates remain enforced; corrective work remains available. `current/core.js:174,465,528`; authority and completion fixtures. |
| R2 | PASS | Readiness launches nothing; explicit execution uses genuine evidence inputs without a scheduling DAG or remediation count cap. `current/core.js:256`; `current/execution.js:250`; repeated-readiness and beyond-64-history fixtures. |
| R3 | PASS | Canonical local records support single-repository and shared-parent layouts, including no-Git, tracked, ignored and untracked records. Resolver, store and layout integration fixtures. |
| R4 | PASS | Source endpoints, raw requirements, repository identity, scope and approval references are bound and rechecked. `current/evidence.js:60,150,194`; drift and repository-root fixtures. |
| R5 | PASS | Capture rejects unsafe paths and substitutions; isolated exports exclude retained session history and unselected scope. `current/store.js:10,33`; `current/execution.js:70`; adversarial isolation fixtures. |
| R6 | PASS | Exclusive publication, reference closure and durable reconciliation prevent partial/conflicting proof admission. Failed spec evidence remains required for retention. `current/store.js:67,236,265`; retention and crash fixtures. |
| R7 | PASS | Local packet/finalization validation derives recorded evidence inventory while preserving application cleanliness and integration checks. `current/core.js:263`; `current/actions.js:21,107`. |
| R8 | PASS | Fresh evaluator qualification and separate code/spec verdicts are validated. Missing or forged proof remains unavailable. `current/execution.js:111,453`; grouped-verdict fixtures and formal live-evaluator evidence. |
| R9 | PASS | All enabled obligation classes remain explicit, including separate Judge and truthful runner receipts. `current/contracts.js:40`; `current/core.js:406`; inspected former default inventory. |
| R10 | PASS | Execution-service reuse preserves original references across equivalent candidates and attempts. `current/evidence.js:178`; `current/execution.js:404`; launch-count and equivalent-commit fixtures. |
| R11 | PASS | Relevant source, requirement, dependency, environment, consumed-evidence and expiry changes invalidate affected proof. `current/core.js:311`; mutation and historical-loss fixtures. |
| R12 | PASS | Delta admission requires recorded ancestry, changed-path coverage and examined interactions. `current/execution.js:243,373`; cross-repository/base/target fixtures. |
| R13 | PASS | Claims are labeled, relevant failures and limits retained, affected closures reconsidered, and unaffected closures carried with justification. `current/execution.js:211,283`; disposition/history fixtures. |
| R14 | PASS | New supported defects remain reportable; blocking findings require scoped source and an approved criterion or gate rule. `current/execution.js:192`; discovery and reopening fixtures. |
| R15 | PASS | Scoped decisions reconcile retries and interrupted continuations while retaining actual provenance and old/new commitments. `current/core.js:123,174`; amendment and interruption fixtures. |
| R16 | PASS | Exceptions preserve original outcomes and do not imply merge authority or actual integration. `current/contracts.js:97`; `current/actions.js:58,107`; exception-risk fixtures. |
| R17 | PASS | Protected adapters recheck the core and action state. Native hook coverage is honestly labeled as handler-tested with host activation unverified. `current/actions.js:51`; `current-hook.test.js`; Verification limitations. |
| R18 | FAIL | Desktop rejects qualifying native validator evidence, ignores discovered Python configuration, and cannot execute its ASAR-contained pattern helper through external Python. Findings F1–F3. |
| R19 | PASS | Current CLI/native entry points replace legacy execution paths and provide resume guidance without pilot or benchmark prerequisites. Inventory, `cli/src/index.js`, current adapter and workflow policy. |
| R20 | PASS | Resume preserves historical files, durably establishes current activation and grants no authority from old events. `current/core.js:77,92`; `current/store.js:157,192`; resume fixtures. |
| R21 | PASS | Receipts expose available timing/usage honestly, preserve unknown metrics and distinguish exceptions. Existing project-use guidance adds no metrics gate. Provider metrics, result inspection and workflow policy. |

## Findings

### F1 — Desktop rejects valid native validator receipts

`python-guards.js:56-82` binds the complete shipped helper tree. Canonical source includes 26 helpers; desktop staging includes 16. Consequently, identical validator execution cannot have the same binding across those consumers.

A read-only reproduction ran actual canonical spec validation using `/opt/homebrew/bin/python3`. Validation returned PASS, and canonical `assertTrustedPythonProof` accepted its receipt. The staged desktop implementation rejected that same receipt with **“Trusted validator proof is stale or unavailable”**, using the same interpreter and environment.

This affects ordinary milestone observation through `current/core.js:478` and reconciliation admission through line 391. Desktop therefore displays missing proof for evidence accepted by the native core.

### F2 — Desktop ignores its discovered Python executable

`apps/desktop/main/index.js:91-105` discovers compatible Python and passes its path into `createProtocolAdapter`. The adapter at `main/protocol-adapter.js:7` discards that option, and current observation constructs the core without Python runtime options. Validator checks instead resolve bare `python3` from PATH.

Executable discovery deliberately searches Homebrew and user directories outside PATH. In such a GUI environment, Setup can recognize a compatible interpreter while evidence observation uses another interpreter or reports Python unavailable. The README’s Python-free observation claim also conflicts with the new observation path.

### F3 — Packaged pattern revalidation invokes an ASAR-internal script

`current/core.js:384` recomputes pattern inputs when observing retained pattern evidence. `current/pattern-inputs.js:8,16` passes its adjacent script path directly to external Python. Packaging at `macos-package-contract.mjs:154-156` leaves `resources/scripts` inside `app.asar`; only PTY binaries and provider files are unpacked.

External Python cannot read that archive-internal path as a filesystem script. A packaged desktop observing an established pattern result therefore cannot validate its applicability. This is a source-traced defect; no packaged runtime reproduction was performed during this review.

## Explicit checks

- **Scope: PASS.** Changes fit the approved protocol, helpers, distribution and necessary consumer cutover. No unsupported release or deployment action was identified.
- **Gaps: FAIL.** Desktop consumer tests start a DESIGNING run, and the smoke fixture creates only interview/design documents plus `run.start`. The bound screenshot also shows DESIGNING. These checks do not exercise observation of actual validator or pattern evidence and miss F1–F3.
- **Contradictions: FAIL.** The promised shared current-proof view conflicts with incompatible desktop validator bindings. `apps/desktop/README.md:49-51` claims Python-free observation, while milestone and pattern applicability checks invoke Python.

## Verification assessment

The full digest-bound Verification report was read, and `runtime.png` was resolved by its attachment filename, hash-checked and inspected. The report records passing CLI, desktop, Python, live-evaluator and local package/runtime checks. Those full suites were not rerun here. The additional read-only validator reproduction demonstrates a reachable consumer failure that their reported coverage does not establish.

The report’s explicit limits—unverified installed-host interception, no native Intel runtime claim, unavailable current hosted CI, and no publication or external-backup claim—remain limits rather than invented pre-merge requirements. The overall failure follows from R18 and the supported consumer gaps and contradictions above.