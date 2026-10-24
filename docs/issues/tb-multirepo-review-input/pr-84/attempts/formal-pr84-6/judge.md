**FAIL** — R1, R6, R11 and R17 fail because journal suffix loss can restore obsolete milestone eligibility.

Reviewed the whole feature at `dc9732c821dc3363c69f4de0115c7ccd80b8bc30`, against base `643e3ea2b03f19b66595219c4f8df934596aa436`. The bound specification, design, inventory, full Verification record, runtime attachment, patch index and all ordered patch chunks matched their supplied digests. The assembled patch also matched its declared digest. The inventory contains 307 entries: 100 modified, 157 deleted and 50 added, with no binary entries or renames.

**F1 — Missing journal suffixes can resurrect an earlier PASS or erase a human pause.**

`plugin-src/shared/resources/protocol/current/store.js:214-232` validates the events present in the directory, including their sequence and predecessor hashes. It does not verify an expected terminal event. Removing the last event therefore leaves a valid earlier prefix.

`current/core.js:19-44` reconstructs results and pause state from that prefix. Its evidence-loss barrier examines only surviving projected result references (`current/core.js:433-448`). Consequently, removing a newer failed `JOB_FINISHED` event makes that failure disappear from current history even when its failed service outcome remains retained. The reverse result selection at `current/core.js:391-408` can then select an older PASS. Removing a terminal `PAUSED` event likewise restores unpaused state without a continuation decision.

Read-only in-memory checks using the pinned implementation produced:

- Complete journal: selected outcome `FAIL`.
- Terminal failure event removed: selected outcome `PASS`, while the newer retained job still contained `FAIL`.
- Complete pause history: `paused=true`.
- Terminal pause event removed: `paused=false`.

There is also a related interruption window: `current/execution.js:465-471` saves the result and job before appending `JOB_FINISHED`. Retained job reconciliation occurs on execution retry (`current/execution.js:395-404`), rather than during milestone eligibility checks. Protected merge checks call the same core (`current/actions.js:51-60`, `:76-90`), so their rechecks do not repair this underlying state rollback.

These checks used in-memory evidence storage and source tracing; no files were changed and no hosted action was executed. Existing missing-failure tests at `cli/test/current-core.test.js:750-768` delete result/output objects, which leaves references available for loss detection. They do not cover loss of the terminal journal event itself.

Canonical protocol references in the table below are under `plugin-src/shared/resources/protocol/`.

| ID | Result | Assessment and principal evidence |
|---|---|---|
| R1 | FAIL | Lost failure/pause events can restore passage without refreshed proof or continuation authority. `current/store.js:214-232`; `current/core.js:362-408`. |
| R2 | PASS | Readiness launches no reviewer; execution uses genuine proof inputs and has no round cap. `current/core.js:221-226`; `current/execution.js:243-280`; readiness fixture at `cli/test/current-core.test.js:61`. |
| R3 | PASS | Local and parent records work independently of Git tracking and evidence commits. `current/store.js:87-143`; layout/finalization fixtures at test lines 71, 283 and 549. |
| R4 | PASS | Exact requirement bytes, authority, repository identity and base/head/target snapshots are bound and checked. `current/evidence.js:sourceCandidate`, `checkCandidate`; drift fixtures at test lines 845 and 1006. |
| R5 | PASS | Safe capture and selected reviewer exports reject unsafe paths and use fresh read-only provider contexts with denied network policy. `current/store.js:10-48`; `current/execution.js:70-147`; `local-agent-adapters.js`. |
| R6 | FAIL | Individual objects are protected, but suffix loss and unreconciled retained job outcomes can expose an earlier PASS. `current/store.js:214-232`; `current/execution.js:395-404`, `:465-471`. |
| R7 | PASS | Packet inventories use validated references; source cleanliness, synchronization and reviewed-content integration remain checked. `current/execution.js:518-534`; `current/evidence.js:assertClean`; `current/actions.js`. |
| R8 | PASS | Fresh evaluator receipts and separate code/spec verdicts are validated; absent verdicts and unrecorded copied proof do not qualify. `current/execution.js:119-145`, `:418-428`; `current/core.js:264-296`. |
| R9 | PASS | Required default obligations remain individually represented, with Judge separate and actual runner receipts required. `current/contracts.js:34-55`; `current/core.js:316-325`. |
| R10 | PASS | Equivalent content reuses original proof and provenance across bookkeeping commits. `current/evidence.js:contentIdentity`; `current/execution.js:371-393`; test line 537. |
| R11 | FAIL | Missing journal suffix bytes escape the evidence-loss barrier and permit reuse despite unknown newer history. `current/core.js:283-290`, `:433-448`. |
| R12 | PASS | Delta proof requires qualified ancestry, changed-path coverage and interaction assessment, including base/target changes. `current/execution.js:233-237`, `:340-352`; tests at lines 500, 861 and 1006. |
| R13 | PASS | Recorded history labels claims and limits, requires affected/open finding dispositions, and permits justified batch carry-forward of unaffected closures. `current/execution.js:198-229`, `:282-339`. |
| R14 | PASS | New instances remain reportable; blocking findings require approved criteria and current source evidence. `current/execution.js:53-55`, `:191-197`. |
| R15 | PASS | Scoped decisions retain observed provenance and old/new commitments; pending records and retries avoid repeated approval. `current/core.js:119-200`; tests at lines 1074, 1097 and 1277. |
| R16 | PASS | Normal exception paths preserve verdicts, show accepted risks separately, bind scope transitively and observe actual integration. `current/contracts.js:waiverFor`; `current/core.js:329-360`; `current/actions.js:107-129`. |
| R17 | FAIL | Adapters recheck the shared core, but that core can admit rolled-back failure/pause state. Host coverage labels themselves are honest. `current/actions.js:51-90`; `current/contracts.js:106-118`. |
| R18 | PASS | CLI/native/desktop use the current core, remove incidental ordering and generate routine records. All 23 staged protocol files matched canonical bytes and projection digests. Consumer tests and runtime evidence support normal operation. |
| R19 | PASS | Distribution uses current operations; legacy execution/model paths are removed and unsupported operations receive current-entry guidance. `index.js`; `plugin-adapter.js`; inventory; `current/core.js:465-496`. |
| R20 | PASS | Resume durably establishes current runs, preserves old files and uses observed authority rather than replaying old passes. `current/core.js:74-112`; `current/store.js:146-195`; resume fixtures at test lines 329 and 580. |
| R21 | PASS | Receipts expose available execution data with unknown metrics left null; guidance uses real-project observations without another adoption gate. `local-agent-adapters.js:providerMetrics`, `receiptFor`; `current/adapter.js:readCurrent`; workflow reporting policy. |

**Scope check: PASS.** Runtime replacement, legacy removals, consumers, packaging, tests and approved documents fit the declared feature scope. No supported scope creep was identified.

**Gap check: FAIL.** Reported Verification covers corrupt journal contents and missing result/output objects, but does not establish fail-closed behavior for missing terminal journal events or reconcile retained completed jobs at milestone admission.

**Contradiction check: FAIL.** Accepting the shortened history contradicts C2/C4's prohibition on concealing missing evidence behind an earlier success and C1's requirement to honor explicit stop decisions. No substantive conflict between the approved design and specification was identified.

The full bound Verification report records 288 passing CLI tests, 172 desktop tests, 58 Python tests, a separate successful live evaluator run, plugin checks and local desktop package/runtime smoke. The bound `runtime.png` was inspected. These reported successes support the normal paths but do not resolve F1. Native-host interception, native Intel runtime and current hosted CI are explicitly unclaimed and are not additional failures under the approved pre-merge boundary.