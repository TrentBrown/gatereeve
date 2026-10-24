**FAIL — pinned feature acceptance**

Reviewed `643e3ea2b03f19b66595219c4f8df934596aa436` → `b1d83440b4c44b77793895ef3297be2e9462d46a` at FEATURE_FINAL scope. All 21 frozen rubric IDs were evaluated. The approved spec/design, inventory, full digest-bound Verification report, and `runtime.png` attachment were read. The 46 patch chunks were verified and assembled to the declared material hash. The inventory contains 306 files: 99 modified, 157 deleted, and 50 added, with no binaries or renames.

The formal Verification report records 252 CLI passes, 172 desktop checks, 62 Python passes, native package checks, a universal macOS build, ARM64 packaged runtime smoke, and a fresh native Codex evaluator receipt. Its limits are explicit: no exact-current hosted CI, repeated native Intel launch, or live installed-host hook activation. The live evaluator receipt covers a small code-only fixture. These results do not establish the uncovered paths below. Full suites were not rerun; additional diagnostics were read-only.

For source references below, `P` means `plugin-src/shared/resources/protocol/current/`.

| ID | Result | Assessment and evidence |
|---|---|---|
| R1 | FAIL | Stale Verification can remain eligible after a relevant inherited environment change. `P/environment.js:51-69`, `P/core.js:253-255,298-309`; F2. |
| R2 | PASS | Readiness launches no evaluator, independent work has no universal ordering, typed Verification inputs remain, and no round cap exists. `P/core.js:184-190`, `P/execution.js:232-255`; current-core readiness and alternate-order fixtures. |
| R3 | PASS | Canonical records work independently of application Git, including parent/no-Git and tracked/ignored layouts. `context.js:resolveWorkflowContext`, current-core layout and local-finalization fixtures. |
| R4 | PASS | Source endpoints, exact requirements, scope, criteria, and authority references are retained and checked. `P/evidence.js:sourceCandidate/checkCandidate`, `P/core.js:176-182`. |
| R5 | FAIL | Old review packets and other features' journals/objects enter ordinary source export. `P/evidence.js:13-34`, `P/execution.js:60-66`; F1. |
| R6 | FAIL | Exclusive publication and integrity checks exist, but failed spec proof is discarded and reconciliation proof becomes orphaned. `P/core.js:164-174`, `P/execution.js:420-449`; F3. |
| R7 | PASS | Current packet/retention operations validate recorded closure locally, while application cleanliness and PR/integration checks remain. `P/execution.js:coreEvidence`, `P/evidence.js:assertClean`, `P/actions.js`. |
| R8 | FAIL | Separate verdict and fresh-receipt machinery works, but reviewer input isolation fails through tracked history. `P/execution.js:97-134`, grouped-verdict tests, bound live receipt; F1. |
| R9 | PASS | The old default obligations map to explicit current gates, including separate Judge and actual runner proof. Deleted default-policy patch and `P/contracts.js:GATES`. |
| R10 | FAIL | Identical-tree SHA reuse works, but unrelated tracked reports/journals enter content identity and force reruns. `P/evidence.js:13-34,contentIdentity`, `P/core.js:263`; F1. |
| R11 | FAIL | Undeclared variables affect inherited runner execution without affecting applicability. `P/environment.js:53-55`, `P/execution.js:151-152`; F2. |
| R12 | PASS | Delta records bind prior proof and candidates, cover changed paths/interactions, and preserve provenance. `P/execution.js:changedPaths/validateVerdict/input.prior`; cross-repository and base-only delta fixtures. |
| R13 | FAIL | Explicit history selection and dispositions are bounded, but ordinary source export bypasses those bounds. `P/execution.js:selectedHistory`, `P/evidence.js:13-34`; F1. |
| R14 | PASS | New findings and old-class instances remain reportable; blocking findings require approved criteria and in-scope source. `P/execution.js:169-225` and new-discovery/disposition fixtures. |
| R15 | FAIL | Combined decisions are validated before durable recording, leaving no incomplete operation after failure/interruption. `P/core.js:134-162`; F4. |
| R16 | PASS | Current exceptions preserve FAIL/UNAVAILABLE, have content scope, and do not infer merge authority; integration is observed separately. `P/contracts.js:waiverFor`, `P/core.js:150-159,307-319`, `P/actions.js:observeIntegration`. |
| R17 | FAIL | The new adapter/hooks consult the core, but the shipped Python merge API does not. `scripts/pr_lifecycle.py:80-117`, its successful API test, and workflow inventory; F5. |
| R18 | FAIL | Consumers share the current core and remove ordering controls, but failed reconciliation loses its useful validator cause and linked receipt. `P/execution.js:420-449`; F3. |
| R19 | FAIL | The legacy CLI dispatch refuses execution while the inventoried, importable legacy merge implementation remains operational. `scripts/pr_lifecycle.py:80-130,153-159`; F5. |
| R20 | PASS | Resume preserves old files, establishes durable current activation, uses observed authority, and does not replay old passes. `P/core.js:73-110`, `P/store.js` activation methods and resume fixtures. |
| R21 | PASS | Available metrics and outcomes remain inspectable; missing metrics are null and no benchmark/pilot gate was added. `local-agent-adapters.js:providerMetrics/receiptFor`, `P/adapter.js:readCurrent`, workflow observation guidance. |

**Supported findings**

1. **F1 — Tracked history bypasses reviewer isolation and reuse boundaries.** `P/evidence.js:13-21` filters only a short list beneath the active feature. Direct read-only calls confirmed that `code-review.md`, `pr-12/judge.json`, `advisory/round-1.md`, and `workflow-model.lock.json` remain included. Other features' `events.jsonl` and `.gatereeve-current/objects/*` also remain included. `P/execution.js:63-66` exports those captured files without bounded history selection or claim labeling. Their bytes also enter source identity, so unrelated record changes invalidate otherwise equivalent proof. This violates C2-C4 even though the explicit history packet has appropriate controls.

2. **F2 — Environment-sensitive failures can reuse an earlier PASS.** `P/environment.js:53-55` defaults `environmentKeys` to an empty list, while `P/execution.js:151-152` inherits the process environment. A read-only diagnostic ran the same Node check with `GATEREEVE_CHECK_MODE=1` and `=0`: exits were 0 and 1, but both fingerprints were `sha256:f7c8ab196a7561f316bc1ee250f2e459bb92d6b37d052caf46cca75cc33a93c9`. `P/core.js:253-255` therefore cannot distinguish these relevant inputs, and the reuse path can retain the old PASS. The existing environment test covers declared variables and incidental changes, not this counterexample.

3. **F3 — Failed validator evidence is discarded or orphaned.** `P/core.js:171-174` throws on failed specification validation before retaining the proof or appending an outcome. A read-only in-memory harness with unavailable Python observed zero proof publications and zero events; diagnostics existed only in the transient error. Reconciliation separately stores its proof at `P/execution.js:448`, then throws without attaching it to the result. The catch at lines 420-430 keeps only a generic UNAVAILABLE summary and lacks the failed receipt reference and useful validator details. Failure history is consequently incomplete even though successful evidence publication is carefully protected.

4. **F4 — Combined decisions lack durable incomplete status.** An amendment that also authorizes implementation runs validation at `P/core.js:145-148`, before `DECIDED` is appended at line 162. Failure or interruption leaves no retained instruction or pending continuation, despite the error describing authorization as retained. Waiver-plus-acceptance likewise checks continuation before recording the instruction. Successful repeat handling does not cover this C5 interruption requirement.

5. **F5 — A parallel legacy merge API survives distribution.** `scripts/pr_lifecycle.py:80-117` still exposes `merge_pull_request`, which can reopen, ready, check, and merge a PR using a nonempty authorization label and Git/PR checks without current milestone admission. The file remains in `workflow-inventory.json:219`; `test_pr_lifecycle.py:159-171` successfully invokes the API without current-run gate evidence. The feature patch retires only command-line dispatch at line 159. This is a remaining callable GateReeve merge implementation outside the shared core. No hosted merge was performed during this review.

| Explicit check | Result | Explanation |
|---|---|---|
| Scope | PASS | Changes stay within the approved core, consumers, projections, packaging, documentation, and verification scope. |
| Gaps | FAIL | F1-F5 leave required isolation, applicability, retention, interruption recovery, and direct-cutover behavior incomplete. |
| Contradictions | FAIL | Actual export/reuse/decision behavior contradicts C2-C5, and the retained legacy merge API contradicts the one-current-path requirement in C6. |

The Verification report and attachment hashes match their bound references. Its successful checks remain useful evidence, but the supported counterexamples prevent feature acceptance.