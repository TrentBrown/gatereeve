FAIL — 16 criteria PASS; R1, R4, R10, R16, and R17 FAIL.

The approved specification, design, inventory, patch index and chunks, full Verification report, and runtime.png attachment were read. Their supplied hashes and lengths matched. The assembled feature patch matched its declared 3,040,994-byte material hash. The inventory contains 306 text-file changes and no binary entries. Review covered the whole feature, including shared core and distributed consumers.

The formal report records 265 CLI passes with one optional skip, 172 desktop passes, 58 Python passes, native plugin builds, an actual fresh evaluator fixture, and packaged ARM64 desktop runtime smoke. The screenshot was inspected. These results support substantial implementation coverage, but do not cover the failures below. Hosted CI, Intel runtime, live installed-host interception, and live hosted merging have the report's stated limits.

| Criterion | Result | Evidence and assessment |
|---|---|---|
| R1 — Planning and milestone authority | FAIL | `current/core.js:349-357` checks one state, reloads another, and records passage for the latter. An in-memory probe recorded acceptance for unready candidate B using A's check. |
| R2 — Model-led execution | PASS | `core.js:212-218` records readiness without evaluation. `execution.js:240-272` permits explicit gate selection while retaining real input requirements; no round counter exists. |
| R3 — Canonical layouts | PASS | Resolver/local-store behavior and `current-core.test.js:71`, `:283`, `:539` cover repository-local/shared-parent records and optional Git tracking. |
| R4 — Exact source and requirements | FAIL | Preparation binds exact bytes, but `core.js:349-357` can admit a replacement candidate with broader repository or criterion scope using another candidate's check. |
| R5 — Containment and isolation | PASS | `store.js:10-48` rejects unsafe capture paths; `execution.js:70-106` exports declared scope; provider adapters configure fresh restricted execution. Adversarial fixtures cover these paths. |
| R6 — Publication and retention | PASS | Exclusive publication, verified closure, sequenced events, uncertain-job reconciliation, and historical-loss tests preserve truthful local proof. Cleanup guidance requires explicit retention decisions. |
| R7 — Local finalization | PASS | `execution.js:504-520` derives inventories from retained references. Source cleanliness, remote synchronization, and assessed targets remain checked without evidence commits. |
| R8 — Independent grouped verdicts | PASS | `execution.js:109-145` validates execution identity; `:407-415` validates each verdict separately. Grouped-contract tests and the retained live code-review fixture provide the stated evidence. |
| R9 — Obligation inventory | PASS | `contracts.js:41-55` preserves the enabled default obligations and roles. `execution.js:148-180` records actual mechanical command outcomes and outputs. |
| R10 — Equivalent-input reuse | FAIL | Closing a finding changes automatic history selection, defeating literal history equality at `execution.js:371-373`. Repository and grouped-gate order also change identities without semantic input changes. |
| R11 — Relevant changes and uncertainty | PASS | `core.js:267-295` rechecks source, requirements, support, environment, pattern inputs, consumed proof, and declared external validity. Mutation fixtures cover meaningful changes and missing bytes. |
| R12 — Delta coverage | PASS | `execution.js:40-48`, `:230-235`, and `:334-345` retain prior proof and require changed-path and interaction coverage, including cross-repository and target changes. |
| R13 — History and dispositions | PASS | Packets distinguish claims, findings, and limits. `execution.js:200-224` requires open/affected dispositions and supports justified closure carry-forward. The reuse defect is scored under R10. |
| R14 — New discovery and blocking | PASS | Instructions require new discovery; `execution.js:189-195` binds blocking findings to current source and approved criteria or gate rules. |
| R15 — Scoped human decisions | PASS | Decisions preserve actual instruction/context and optional provenance. Pending-decision, combined-amendment, interruption, and retry fixtures cover repeat-safe application. |
| R16 — Exceptions and integration | FAIL | `actions.js:49-82` can execute A's captured merge action after B becomes current and receives different authority. `:99-119` can then record integration against B. |
| R17 — Enforcement coverage | FAIL | Hook limits are honestly stated, but both milestone passage and protected merge lose candidate/action bindings across asynchronous work. Existing PR-drift tests do not cover current-state replacement. |
| R18 — Consumers and ceremony | PASS | CLI/plugins/desktop use the current core and remove ordering controls. All 23 staged desktop protocol files matched canonical source. Built-consumer smoke is retained. The environment documentation contradiction is reported separately. |
| R19 — Direct cutover | PASS | The inventory and patch remove old orchestration modules. Current adapters reject unsupported active contracts with resume guidance; no converter, pilot, or benchmark gate was found. |
| R20 — Current resumption | PASS | Durable run creation and immutable successor activations preserve old records. Observed approvals restore qualified authority without replaying old passage. Resume/interruption fixtures cover this behavior. |
| R21 — Practical observations | PASS | Receipts retain available timestamps, metrics, outcomes, and provenance; unknown metrics remain null. Guidance supports real-project iteration without an added metrics gate. |

Supported findings:

1. **Candidate replacement can bypass milestone checking.** `core.js:351` obtains eligibility, then `:353` reloads state and `:357` appends against that newer state. A concurrent replacement therefore avoids the journal's stale-event-count protection. A read-only probe of the actual method recorded acceptance for B although the returned check named A and B was unready. This affects R1, R4, and R17.

2. **Superseded merge authority can survive the hosted-check wait.** `actions.js:49-55` retains A's action and authorization. The check at `:71` only establishes general eligibility of the current candidate. It does not prove that the captured action is still authorized for that candidate. A read-only dependency-injected probe changed current authority to B with squash during waiting; the adapter still issued A's `--merge` and returned an INTEGRATED record for B. This affects R16 and R17.

3. **A closing PASS unnecessarily requests another evaluation.** Equivalent closed findings are omitted from automatic history at `execution.js:303-310`. The closing PASS originally consumed that history, so the equality check at `:373` skips it. An in-memory probe confirmed that an applicable PASS proceeded to JOB_STARTED. A related request repeating the retained fix claim failed at `:332` with 'Disposition claim lacks a retained finding' because automatic selection had omitted its report. This violates R10.

4. **Selection order causes avoidable refreshes.** `evidence.js:165-168` hashes repository order, and `execution.js:59` hashes grouped gate order. Probes confirmed different identities for the same reversed repository set and for code/spec versus spec/code. Neither changes the selected content or obligations. This violates R10.

5. **Environment guidance is contradictory.** `PROTOCOL.md:126-128` says incidental CLI/Desktop environment variables do not invalidate proof. `environment.js:53-67` hashes every inherited value, and `core.js:276` rejects changed identity. The guide's later text at `:186-188` and the CLI README describe that stricter implemented behavior.

Scope check: PASS. The changes remain within approved core/storage, native/CLI, necessary desktop, packaging, and local verification scope. No unsupported publication, deployment, migration converter, or benchmark gate was identified.

Gap check: FAIL. Concurrent candidate replacement, authority replacement during hosted waiting, and reuse after finding closure are required scenarios missing from the supplied passing verification.

Contradiction check: FAIL. The native protocol guide makes incompatible claims about environment applicability.

No repository files were edited and no network tools were used. The additional probes were read-only in-memory checks with mocked state or injected dependencies; they were not live hosted operations or a rerun of the full test suites.