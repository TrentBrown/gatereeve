# Independent code review — formal-pr84-5

**Verdict: PASS. No supported material code findings remain in the assessed candidate.** This verdict is separate from spec evaluation, independent Judge, milestone passage and any merge or release authorization.

## Pinned scope and method

- Base: `643e3ea2b03f19b66595219c4f8df934596aa436`.
- Candidate: `b1bade8610c1b72b299abad2bf8cf2fb2e9fe1d0`; supplied verification identifies substantive source commit `2efaee31903fdbbf59c56f4171d62672c51665f9` and subsequent readiness-only changes.
- Source inspected exclusively in `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-ZVZP4I/repository` (**snapshot**), with `/tmp/gr-context5-codeReview.json` and `/tmp/gr-review-view-5.json` identifying the assessment. The closed PR's older hosted head is not substituted.
- Approved requirements: `docs/issues/tb-multirepo-review-input/spec.md`, SHA256 `2b2f80e655e4a038ddfa77f88dd764a32a2ce8a41ae8678822a3d2f346e5446e`; `design.md`, SHA256 `7639b18419a60766a19aad4b3b90b5c92aa21120a03ea1518d8d3a7232698fd2`. Both hashes checked directly.

Reviewed the full current protocol change and its reachable source capture, independent execution, history/disposition handling, applicability, runner evidence, publication/retention, human decisions, protected merge and current consumer interactions. Earlier observations were leads rather than acceptance authority. Source, supplied patches and tests were inspected; no implementation edits, network or subagents were used. Only these authorized report files are written. The independent focused rerun used disposable test repositories and injected external/provider adapters, importing the pinned implementation; its fixtures were cleaned by test teardown.

## Current findings

No actionable supported defect was found. The previously reported admission/recovery defects have corresponding implementation changes and meaningful negative/positive regressions. The assessment does not infer correctness solely from the supplied green test counts.

For the following references, **C** is `plugin-src/shared/resources/protocol/current/` and **T** is `cli/test/current-core.test.js`, relative to the snapshot.

| Area | Current evidence and disposition |
| --- | --- |
| Reopened findings and delta history (CR4-1) | C/execution.js:348–355 deduplicates the prior and sorts the complete history by durable result position after adding it. Historical context uses its original result hash for ordering. The validator's ordered disposition fold therefore cannot treat an old closure as newer than a reopening. T:1200 rejects missing, unaffected and present dispositions for unchanged/changed-source delta cases; a supported new closure passes. Independently rerun: PASS. |
| Malformed unexecuted checks (CR4-2) | C/core.js:231–250 derives obligations from retained runner receipts, not malformed declarations. C/execution.js:173–177,428–433,454–467 retains a runner reference for completed or partial execution. Missing args, string args and a non-string member retain their diagnostics without establishing impossible command identities. T:1188 confirms a corrected command regains satisfied verification. Executed failures remain coverage obligations. Independently rerun: PASS. |
| Latest closing-review reuse | C/execution.js:363–392 separates explicit requested history from automatically derived history. The latest gate result must still qualify, with matching configuration, consumed proof, claims and explicit history. Its own closure no longer creates an avoidable new execution, while a newer failed/unavailable result prevents reaching back to an old PASS. T:1244 covers both empty and explicit fix claims, original reference reuse and refusal to resurrect an older PASS. Independently rerun: PASS. |
| Canonical selection order | C/evidence.js:141,165–168 canonicalizes selected repository order; C/execution.js:59 canonicalizes gate-rule order. T:1261 proves reversed repository selection preserves candidate identity and reversed code/spec request order reuses the original separate verdicts in requested order. Independently rerun: PASS. |
| Milestone check binding | C/core.js:350–361 returns the checked run/event identity and rejects a different state before passage; store append also compares the expected event sequence. T:1228 replaces the candidate during an otherwise passing check and verifies no acceptance passage. Independently rerun: PASS. |
| Merge action and observation binding | C/actions.js:45–96 captures one original state, checks it before reopening, after hosted checks and immediately before the write, and passes it into observation. C/actions.js:107–132 refuses attribution to a replacement candidate and appends against the original expected state. Tests at T:384 cover source/target/PR drift, an assessed advanced target, and candidate replacement before and after the write. All six independently rerun cases PASS. |
| Combined decisions and append response window | C/core.js:120–127,142–188 keeps the checked state and allows its own pending event to advance it. C/core.js:382–388 projects the response only through the appended event sequence, so a concurrent later pause cannot enter the final decision's state. T:1281 covers both after-pending/before-response and after-validation races, retains the pending instruction and records no approval. Existing interruption/retry tests preserve the one-instruction contract. Both race cases independently rerun: PASS. |
| Retained history and original modes | C/evidence.js:24–50 recognizes nested reserved explain-diff reports while preserving ordinary HTML, executable files and unknown configuration as source. C/execution.js:62–95 exports original base/head/target modes and kinds for current and prior snapshots, with instructions explaining materialized read-only files. T:956,995,1118 covers tracked/untracked history, ordinary app.html/configuration and mode-only changes. |
| Previously repaired surrounding protections | Original feature base and assessed target remain separate; base/head/target all influence content/delta qualification. Current completion commitments, ancestor-symlink checks, nested dependency and full inherited-environment binding, failed validator diagnostics, original exception outcomes and Python packaging closure remain present. The legacy Python merge executor is absent, and supported consumers route through the current core. Environment documentation now matches conservative full inherited-environment invalidation. |

The pass is based on these interactions plus the broader source/requirements assessment, rather than just closure of named earlier issues. No additional material correctness, security or regression finding was supported by the inspected evidence.

## Independently executed focused validation

Ran directly from the read-only snapshot:

```sh
PYTHONDONTWRITEBYTECODE=1 node --test --test-name-pattern='delta prior cannot|corrected runner configuration|qualified closure reuses|repository order and grouped|milestone passage rejects|decision passage cannot|protected merge' cli/test/current-core.test.js
```

**Actual result: 17 tests, 17 PASS, 0 FAIL, 0 SKIP; exit 0; 103589.833958 ms.** This includes six protected-merge cases, three malformed-check corrections, two reopened-delta cases, one milestone race, two closure-reuse cases, one selection-order case and two decision races. The merge fixtures use local bare repositories with URL rewriting and injected GitHub responses; no hosted merge or network action was performed.

## Supplied execution evidence and residual limits

Inspected raw log endings confirming current CLI **278 PASS / 0 FAIL / 1 optional live SKIP** (279 total), desktop **172 PASS / 0 FAIL**, and Python **58 PASS**. The supplied current matrix also records plugin lint/build/native validation, focused/authority regressions and current document checks. These full suites were inspected rather than rerun by this assessor.

The OpenAI receipt is **carried third-round evidence**, executed on substantive source `b94a792`, not a newly executed attempt-5 provider run. It records a passing target-aware code fixture using bundled Codex CLI 0.163.0-alpha.11.2, gpt-6.1-sol/high, fresh context `01a16b89-fa92-7681-85dd-ea36c8179d05`, zero inherited turns and actual digest bindings. The carried receipt's instruction digest equals the current evaluator instruction digest: `sha256:7a40ac53bc9304c001ac034fe748826666a3cb674c0eea55200bb2e26af3c20d`, independently checked. This supports unchanged adapter/instruction behavior; current deterministic tests cover changed state/history/reuse semantics. It does not establish feature acceptance or a live grouped code/spec run, and does not replace the separately running current native Judge.

The current rebuilt universal app/DMG has retained successful mounted package verification and native ARM64 governed runtime. DMG SHA256 `784065b6f8813554ccbc1ff7be787d9a2221e83ec81b91f66ac789ad1ba3ba7f`; signing is development ad-hoc. Native Intel execution, notarization, installation and publication are not claimed. Exact-current hosted CI is not claimed while PR84 is closed with its older hosted diff. The unrelated unavailable historical Homebrew publication artifact does not create release authority.

Supported hooks have packaged subprocess/direct-command routing coverage; arbitrary shell commands and live installed-host activation remain outside demonstrated interception. Empty pattern policy supplies no substantive pattern-rule coverage. GitHub has no target compare-and-swap in this adapter, so source matching plus an immediate pre-write target/PR recheck is the stated protection; the code does not claim an atomic remote transaction. These bounded limits do not add release, installation, benchmark or production requirements to the approved pre-merge scope.
