# Independent Workflow Judge — FAIL

Reviewed pinned source `2692a42741ddff2caaebc9ef8c5fd054797465dd`, complete feature range from `64db6b635f03018581a8977a7b6933bc59b2ccbd`, at `FEATURE_FINAL`. All ten frozen criteria were assessed.

**R9 fails.** After an ordering-only migration during finalization, the retained dependency diagram and the displayed numbered stage groups can describe different graphs. The other nine criteria pass. Scope passes; gap and contradiction checks fail.

## Finding

The finalization renderer selects a retained attempt but obtains its card inventory from the current model (`apps/desktop/renderer/renderer.js:958-961`). Diagram edges come from that attempt (`:1010-1014`), while card groups are recomputed from current dependencies (`:1016`). The snapshot also combines current `ownerAfter` with retained `orderLabel` (`plugin-src/shared/resources/protocol/snapshot.js:1097-1107`).

A read-only reproduction validated both model locks and evaluated the pinned grouping function:

| Display component | Result after reversing owner ordering |
|---|---|
| Retained DAG | Check → Release |
| Retained numbers | Check = 1; Release = 2 |
| Displayed stage 1 | Release, numbered 2 |
| Displayed stage 2 | Check, numbered 1 |

Migration during active finalization is supported (`cli/test/finalization.test.js:299-321`), so this is a reachable path. Removing the owner edge has the related problem: current groups collapse together while the earlier sequential numbers remain. These displays violate R9's consistent, stable derived grouping and contradict the accompanying dependency explanation. Core eligibility and historical graph retention remain intact.

## Criteria

| ID | Result | Assessment and evidence |
|---|---|---|
| R1 | PASS | Schema-1 compatibility and separate schema-2 ordering retention; unchanged definition identity. `modules.js:115-158,509-550,672-687`; compatibility test at `cli/test/owner-ordering.test.js:20` independently passed. |
| R2 | PASS | Shape, endpoint, duplicate, cross-slot and active combined-cycle validation rejects invalid relationships before policy/journal publication. `modules.js:134-144,553-578,644-669`; negative test at `owner-ordering.test.js:34` independently passed. |
| R3 | PASS | Disabled owner links remain dormant and return on re-enablement; locked modules and hard prerequisites remain protected. `modules.js:149-158,624-628,666-668`; matrix test at `owner-ordering.test.js:50` independently passed. |
| R4 | PASS | Combined dependencies govern eligibility and predecessor-event freshness without stage barriers. Completion rejects replacement predecessor events. `projection.js:650-723`; `boundary.js:118-147`; live regression at `owner-ordering.test.js:59`. |
| R5 | PASS | Locks and historical snapshots retain ordering; adoption reports invalidation. Judge evidence dependencies remain manifest-defined, excluding owner-added Code Review content. `feature.js:162-233,300-310`; `agent-workflow-service.js:98-112`. |
| R6 | PASS | Discovered same-slot Run after controls protect manifest edges and preserve a complete staged draft through preview and IPC. `renderer.js:1201-1217,1340-1369`; `ordering-renderer.test.js:18`; real preload test independently passed. |
| R7 | PASS | Ordering-only Apply, cancellation/discard, stale confirmation, migration confirmation, publication ownership and rollback are implemented. `renderer.js:1268-1471,3077-3098`; `module-policy.js:315-399`; corresponding integration regressions are recorded in Verification. |
| R8 | PASS | Individual edges retain three origins; partial dependencies and skipped layers replace generic connectors across boundary, finalization and preview. `dependency-diagram.js:6-54`; `renderer.js:869-872,1010-1014,1304-1309`; public graph tests independently passed. |
| R9 | FAIL | Accessible named relationships and keyboard controls exist, but retained finalization groups contradict pinned edges and numbers after ordering migration. `renderer.js:901-922,1010-1029`; `snapshot.js:1097-1107`; reproduction above. |
| R10 | PASS | Bound full Verification reports CLI 417, Desktop 218, Python 104+28, templates 2 and portable package/integration checks passing. All 47 staged protocol files independently match canonical bytes and manifest hashes. Documentation and enabled-gate/human-review safeguards remain consistent. |

Source filenames in the table refer to the reviewed protocol or Desktop files identified in the structured evidence.

## Explicit checks

- **Scope — PASS:** All 56 inventory entries and the complete selected patch were considered. Changes support the approved policy, execution, Desktop, portable integration, tests and documentation scope. No supported scope creep was identified. Publication and installed activation are post-merge obligations.
- **Gaps — FAIL:** Consistent finalization grouping after adoption is missing. Existing graph and renderer fixtures do not cover the reproduced historical-attempt/current-ordering combination.
- **Contradictions — FAIL:** The same retained attempt can show Check → Release while grouping Release first and Check second, with their retained numbers reversed relative to those groups.

## Verification and limits

The full digest-bound Verification report was read at `.gatereeve-agent-evidence/gates/verification/verification.md`. It identifies the pinned source and reports full suites against the implementation, with a trusted readiness/disposition-only delta to this source. Its browser observation is explicitly simulated; no bound image/PDF attachments were supplied.

The approved documents, inventory, Verification report, patch index, four offset-bound chunks and assembled patch all matched their supplied hashes. All 56 new-content blob IDs matched snapshot bytes. Five selected read-only core tests and the real preload test passed independently. The Desktop diagram test could not execute because this snapshot lacks installed `linkedom`; the recorded Desktop suite result therefore remains formal Verification evidence, not an independent rerun.

No code was edited, no correction loop was performed, and no network or excluded implementation history was used. The passing suites do not cover away the demonstrated R9 failure.