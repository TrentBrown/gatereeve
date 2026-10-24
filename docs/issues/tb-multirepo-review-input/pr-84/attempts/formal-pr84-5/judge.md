**FAIL — pinned feature `b1bade8610c1b72b299abad2bf8cf2fb2e9fe1d0`, FEATURE_FINAL.** Ten criteria fail; eleven pass.

The approved specification and design, all 306 inventory entries, the indexed patch material, full bound Verification and `runtime.png` were inspected. Supplied document/attachment digests matched. All 47 patch chunks passed offset, length and hash checks; the assembled patch matched its declared 3,057,260-byte digest. The 23 staged desktop protocol files also matched canonical source.

| Criterion | Result | Assessment |
|---|---|---|
| R1 | FAIL | Evidence-admission defects undermine protected milestone eligibility. |
| R2 | PASS | Readiness launches nothing; explicit work ordering and unlimited remediation remain. |
| R3 | PASS | Canonical local and parent layouts do not require evidence commits. |
| R4 | PASS | Generated candidates bind exact requirements, authority, repositories, source and target. |
| R5 | FAIL | Executable lifecycle records bypass reviewer-history exclusion. |
| R6 | FAIL | Failed spec-validation references are omitted from loss and retention checks. |
| R7 | PASS | Local packet/finalization mechanisms preserve application and PR checks. |
| R8 | FAIL | Invented independent execution receipts can qualify unrecorded results. |
| R9 | FAIL | Verification proof can qualify without executed checks or runner receipts. |
| R10 | PASS | Equivalent legitimate inputs reuse original results without rewriting provenance. |
| R11 | PASS | Normal applicability binds relevant source, environment and dependency changes. |
| R12 | FAIL | Delta ancestry can rely on an unrecorded, fabricated prior PASS. |
| R13 | FAIL | Raw history can enter source exports outside bounded packet controls. |
| R14 | PASS | New defects remain reportable; blocking findings require approved criteria. |
| R15 | PASS | Gate-level decisions and amendments retain provenance and reconcile retries. |
| R16 | FAIL | Waivers ignore finding restrictions and changed execution-risk scope. |
| R17 | FAIL | Actual native-host interception and denial are not established by supplied tests. |
| R18 | PASS | Current CLI/native/desktop consumers share the core and remove ordering controls. |
| R19 | FAIL | Public version-1 receipt contracts remain incompatible with current receipts. |
| R20 | PASS | Resume preserves old files and establishes current authority without replay. |
| R21 | PASS | Available execution metrics and outcomes remain honest, without a benchmark gate. |

**F1 — Fabricated proof admission.** `current/core.js:252–295` validates hashes and asserted receipt fields, but does not require the result to belong to `state.results`, a recorded execution job or retained service outcome. Its calculated position may be `-1`. Hash-valid in-memory probes returned `PASS` for an invented independent result and for Verification with zero checks and no runner receipts. Explicit consumed references (`current/execution.js:269`) and delta priors (`:348`) use this qualification. Delta priors are added to history after the normal recorded-history membership check. These are admission probes and source traces; no real milestone or external action was executed.

**F2 — Executable history leakage.** `current/evidence.js:92` includes every non-100644 blob regardless of `excluded()`. A tracked `docs/issues/other/events.jsonl` at mode 100755 therefore exposes its raw bytes even though the classifier recognizes it as retained history. Reports and retained objects have the same bypass. `current/execution.js:74,92` copies these bytes into current and prior base/head/target views. This violates both input isolation and bounded reviewer knowledge.

**F3 — Waiver scope broadens silently.** Waiver creation binds candidate content (`current/core.js:178`); lookup checks only gate and subject/content identity (`current/contracts.js:90`). Finding restrictions and changed check/runtime assumptions do not participate. A probe confirmed that a waiver carrying `findings=[F1]` still applies to a gate reporting F1 and F2. `current/core.js:335` then satisfies the entire gate. Preserving the original FAIL does not prevent this authority expansion.

**F4 — Incompatible distributed receipt contracts.** The public index still exports the version-1 receipt validators. They require numeric version 1 and `read-only-pinned/denied/disposable`, while current execution emits `2.0.0` and `read-only/deny/isolated`. Applying the exported validator to the actual provider receipt embedded in bound Verification produced `Agent workflow receipt version or kind is unsupported`. Adapter tests continue using version-1 requests, so their success does not establish the promised single current contract.

**F5 — Failed validation evidence is outside retention checks.** `VALIDATION_FAILED` retains document/proof references, but `historyGaps()` traverses only results (`current/core.js:363`). The retention closure (`current/execution.js:531`) also omits `validationFailures`. A probe containing a missing failed-spec proof returned an empty gap list without validating that reference. Later successful validation cannot make the historical failure bytes intact or disclose their loss.

**F6 — Native-host enforcement evidence is incomplete.** `cli/test/current-hook.test.js` reads the manifests but directly invokes the handler with synthesized payloads. It does not establish that either native host activates the plugin, dispatches the matcher and enforces the denial. The matrix labels this action `hook-deny-and-route`, while Verification explicitly does not claim installed-host activation. This is an evidence gap; the handler itself was not shown to malfunction.

**Scope check: PASS.** The changed work remains within the approved cutover, evidence, consumer, packaging and documentation scope. No unauthorized publication or unrelated product expansion was identified.

**Gap check: FAIL.** Execution provenance, executable-history filtering, failed-validation retention, waiver applicability and native-host enforcement evidence remain incomplete.

**Contradiction check: FAIL.** Accepted fabricated receipt assertions, executable history exports, gate-wide waiver lookup and incompatible public receipt contracts contradict the approved guarantees.

The full Verification report was considered: it reports 278 CLI passes with one optional live skip, 172 desktop passes, 58 Python passes, plugin validation/builds and an actual universal macOS package with ARM64 runtime. Its carried live evaluator receipt is adapter evidence from earlier source, not current grouped acceptance. Public release, live hosted merge and installed-host activation are not claimed. This audit used read-only inspection, digest/projection checks and in-memory probes; it did not rerun write-producing suites or perform network/host actions.