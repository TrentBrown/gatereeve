# Independent workflow judgment: FAIL

Evaluated the complete FEATURE_FINAL source range `64db6b635f03018581a8977a7b6933bc59b2ccbd..57278b0d96aa604a5c66ca69cc460697edad5932` against the digest-bound approved specification and design. All ten frozen criteria were scored. **R4, R7 and R10 fail.**

The supplied document, inventory, patch-index, patch-chunk and Verification hashes match. Chunk offsets and the assembled patch hash match. All 34 inventory entries match their new content blob IDs; there are no binary entries. All 47 Desktop protocol files match canonical source and their manifest hashes, including the aggregate protocol and default-model hashes.

The complete bound Verification file, `.gatereeve-agent-evidence/gates/verification/verification.md`, was read. It reports CLI/core **410**, Desktop **214**, Python **104+28**, templates **2**, zero audit vulnerabilities, and passing portable package/integration checks. It declares a trusted evidence-only delta from its fully tested implementation to the pinned source. These are the formal report's results; the full suites were not independently rerun. Three selected read-only core tests passed independently. Additional in-memory checks reproduced the failures below using pinned algorithms, memory storage adapters and simulated execution. No repository files were edited and no network tools were used.

No current image/PDF attachments were supplied. Visual support consists of the Verification report's simulated browser observation and the pinned diagram fixtures/source. Publication and installed activation remain outside this pre-merge scope.

## Rubric

| Criterion | Result | Explanation and evidence |
|---|---|---|
| R1 — Policy and graph compatibility | PASS | Schema-1 defaults/hashes remain valid; ordering is separate from unchanged definitions. `modules.js:120-145,509-550,829-864`; `owner-ordering.test.js:19-31`. |
| R2 — Validation | PASS | Specified malformed relationships and active combined cycles reject; locked modules and hard prerequisites remain enforced. `modules.js:553-578,611-679`; `owner-ordering.test.js:33-47`. |
| R3 — Conditional/protected behavior | PASS | Core owner edges become dormant at either disabled endpoint, remain saved, and return on re-enablement. `modules.js:149-157`; `module-policy.test.js:38-43`. |
| R4 — Eligibility and freshness | **FAIL** | In-flight evidence can bind to a replacement predecessor; retry also imposes a hidden barrier incompatible with valid ordering. Findings F1–F2. |
| R5 — Isolation and migration | PASS | Snapshots retain ordering/history, migration reports impact, and Judge content inputs still use manifest hard dependencies. `feature.js:162-233,301-310`; `agent-workflow-service.js:98-111`; `owner-ordering.test.js:81-89`. |
| R6 — Owner controls | PASS | Discovered same-slot Run after choices stage complete policy and preserve ordering through preview/IPC. `renderer.js:1201-1218,1340-1379`; `ordering-renderer.test.js:48-79`; `ordering-preload.test.js:7-20`. |
| R7 — Apply/discard safety | **FAIL** | Normal confirmation, discard and stale-preview controls work, but journal-lock refusal leaves failed Apply partially committed and unchanged adoption unavailable after reload. Finding F4. |
| R8 — Exact DAG | PASS | Individual edges retain all three origins; boundary, finalization and preview use the shared renderer with skipped-layer routing. `dependency-diagram.js:6-54`; `renderer.js:869-893,1010-1034,1304-1309`; `dependency-diagram.test.js:6-19`. |
| R9 — Accessibility/grouping | PASS | Named textual edges, full titles, keyboard selection and dependency-derived grouping are present. `dependency-diagram.js:54-74`; `projection.js:130-166`; `WORKFLOW-MODULES.md:166-170`. |
| R10 — Portable integration/safeguards | **FAIL** | Resource integrity and reported suites pass, but accepted ordering and disabled-module configurations fail in shared retry execution/packet preparation. Findings F1–F3. |

Protocol references above are under `plugin-src/shared/resources/protocol/`; renderer references are under `apps/desktop/renderer/`; tests are under their respective CLI/Desktop test directories.

## Findings

### F1 — In-flight results are rebound to newer predecessor events

With Judge ordered after Code Review, launch Judge while `evt-codeReview-1` is current. Record another acceptable Code Review result during Judge execution. The native scheduler compares only `current.inputs` with the original inputs, which omit owner predecessor event IDs, then calls recording with current fingerprints. Boundary recording selects the latest dependency event IDs.

The read-only reproduction produced equal launch/completion inputs, bound the original Judge result to `evt-codeReview-2`, and projected Judge freshness as **CURRENT**. This does not preserve the predecessor binding of the launched work. The existing ordering test replaces Code Review only after Judge has been recorded, so it misses this path.

Evidence: `execution-preparation.js:85-96`, `agent-workflow-scheduler.js:108-125`, `boundary.js:38-43,132-139`, and `cli/test/owner-ordering.test.js:78-80`. Related Desktop command/provider and finalization command paths likewise discard launch preparation and record through current context: `apps/desktop/main/module-execution.js:164-186,233-245` and `apps/desktop/main/protocol-adapter.js:220-232,264-287`. The skill retry path does explicitly compare prepared dependency events at `boundary-retry.js:197`; native completion lacks that safeguard.

### F2 — Valid owner graphs deadlock retry

Enable Whiteboard Defense and configure it to run after Explain Diff. Resolution accepts this acyclic same-slot graph. Once the ordinary substantive gates and Decision Triage pass, Explain Diff is core-eligible, while Whiteboard Defense waits for Explain Diff.

Retry nevertheless excludes Explain Diff until every substantive gate, including Whiteboard Defense, is clean. The reproduced candidate list is empty. Configuring Whiteboard Defense after Packet Validation reaches the same deadlock; discovered custom modules can do so too. Packet preparation adds another all-substantive completion requirement.

Evidence: `modules.js:645-673,780-787` and `boundary-retry.js:21,213-214,265-272`. Both built-in configurations were independently resolved successfully and produced `coreEligibleUnfinished=[explainDiff]` with `retryCandidates=[]`.

### F3 — Disabled review modules remain mandatory to retry packets

The supported policy can disable Judge, Code Review, Pattern Review or Spec Evaluation. Core compilation then excludes that gate, and conditional links become dormant. Retry packet preparation still iterates a fixed artifact inventory and throws `Packet requires configured …` when the disabled gate is absent. Completion therefore fails despite the remaining enabled graph being current.

Evidence: `modules.js:771-772` and `boundary-retry.js:19-20,220-233`. Independent resolution checks accepted each of those four disablement cases and confirmed its packet gate was absent. This conflicts with the documented ability to disable standard unlocked checks at `docs/WORKFLOW-MODULES.md:147-149`.

### F4 — A journal-lock refusal leaves failed Apply saved without adoption

The manager publishes `workflow.json` before requesting core migration. A busy or retained `events.jsonl.lock` makes migration throw **JOURNAL_LOCKED** before any migration write. The manager restores policy only for **MODEL_MIGRATION_CONFLICT**, so this failure leaves the new policy saved while the feature lock and journal remain unchanged.

The read-only manager reproduction confirmed that split state and removal of the policy mutation lock. After Reload saved policy, draft choices equal the newly saved policy: unchanged Apply is disabled, and the outstanding migration preview is hidden. The failed adoption cannot be completed through unchanged Apply.

Evidence: `apps/desktop/main/module-policy.js:358-386`, `feature.js:327-355`, `journal.js:94-114`, and `apps/desktop/renderer/renderer.js:1271-1275,1325-1329,1401-1405`. Existing manager tests cover baseline conflicts and competing policy writers, but not journal-lock refusal.

## Explicit checks

- **Scope — PASS:** The 34 changed files fit approved policy, graph, Desktop, resource, test and documentation work. No unrelated expansion or post-merge activation work was identified.
- **Gaps — FAIL:** Shared native execution, retry presentation/packet handling and migration-refusal recovery omit reachable cases established by the reproductions. Passing suites do not establish correctness for those cases.
- **Contradictions — FAIL:** Replacement-event freshness and hidden retry barriers contradict the approved execution requirements and DAG guidance. Journal-lock refusal also contradicts the Desktop disclosure that saved policy and the active pinned graph change together.

These findings include relevant shared code outside the changed-file inventory. They do not claim exhaustive discovery.