# Spec - tb-configurable-gate-ordering

**Design:** [design.md](design.md)
**Scope:** pre-merge repository policy, governed review/finalization graphs and Desktop configuration/diagram behavior. Publication and installed activation are post-merge obligations.

## Acceptance Criteria

- **AC1.** Owners can retain existing module enablement and configure additional conditional completion ordering in tracked repository policy without editing module definitions. Existing schema-1 policy, default behavior and historical locks remain readable and unchanged.
- **AC2.** Resolution preserves hard prerequisites and locked modules and rejects malformed, unknown/unselected, self, duplicate, cross-slot and cyclic ordering. Conditional owner edges are active only while both endpoints are enabled and return on re-enablement.
- **AC3.** Resolved ordering is retained in feature locks and boundary attempts; it affects gate eligibility and dependency freshness without adding earlier review findings to formal Judge evidence inputs. Ordering-only model migration preserves historical attempts and reports affected active gates.
- **AC4.** Modules settings offer Run after controls and accurate preview for discovered modules. Enablement and ordering edits remain staged; Apply requires valid policy and existing explicit feature migration confirmation; discarding/restoring settings preserves committed policy and cancellation writes nothing.
- **AC5.** Workflow overview and preview show actual hard, conditional and owner-selected edges between named modules, including skipped layers and partial dependencies, rather than inferred all-to-all stage connectors. Derived numbering/groups are explanatory and do not introduce global stage barriers. An accessible textual edge description is available.
- **AC6.** CLI/core and bundled Desktop/plugin resources resolve the same policy; documentation explains configuration, conditional disabling, immutable requirements, exact DAG display and explicit adoption. Default lifecycle, advisory/retry safeguards, formal Judge isolation, human approval and finalization remain intact.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1: Policy and graph compatibility | Schema-1 resolution/hash/default output and historical locks remain valid; schema-2 ordering is retained separately from unchanged definition digests. | Silent legacy rewrite, digest mutation or missing ordering retention. | Core compatibility/hash/round-trip tests. |
| R2 | AC2: Validation | Invalid shape, unknown/unselected endpoints, self/duplicate/cross-slot edges and combined cycles reject before mutation. | Invalid relationship accepted or protected requirement removed. | Negative core/policy tests and journal comparison. |
| R3 | AC2: Conditional and protected behavior | Owner links activate only for two enabled endpoints and return on re-enable; hard requirements and locked modules remain enforced. | Disabled owner edge blocks unrelated work or disabling required module is silently accepted. | Enablement/order matrix tests. |
| R4 | AC3: Eligibility and freshness | Judge-after-Code-Review requires a current acceptable Code Review result; unrelated gates remain eligible; changed predecessor events invalidate dependent evidence. | Merely display order, global barrier or stale PASS reuse. | Live core gate/replay tests. |
| R5 | AC3: Isolation and migration | Ordering is retained through snapshots; ordering-only adoption reports invalidation, preserves old attempts and does not include Code Review findings in Judge inputs. | History rewritten, missing migration impact or review-history leakage. | Migration and execution preparation regression tests. |
| R6 | AC4: Owner controls | Known same-slot Run after choices stage a complete policy, show hard/conditional dependencies and preserve edits across preview refresh. | Wrong module selection, hidden contract edit or immediate write. | Renderer/IPC/policy integration tests. |
| R7 | AC4: Apply/discard safety | Ordering-only changes enable Apply and disclose edges; cancellation/discard writes nothing; apply requires valid policy and explicit migration confirmation and retains ordering on subsequent enablement edits. | Ordering dropped, unconfirmed migration or stale/invalid apply. | Manager/renderer/IPC tests. |
| R8 | AC5: Exact DAG | Rendered edges match combined graph, distinguish three origins and handle partial dependencies/skipped layers in boundary, finalization and preview. | Generic all-to-all connectors or invented/missing edges. | DOM graph fixtures and visual inspection. |
| R9 | AC5: Accessibility and derived grouping | Named textual edges explain requirements/order; derived labels and groups remain stable and do not imply global barriers. | Color-only meaning, inaccessible graph or stage objects required in policy. | DOM/accessibility assertions and documentation. |
| R10 | AC6: Portable integration and safeguards | Full CLI/Desktop suites and packaged resource integrity pass; policy guidance is consistent and existing advisory/retry/Judge/merge/finalization guards remain valid. | Divergent staged resources, omitted ordering, failing regressions or weakened guards. | Full verification and portable package checks. |

## Changes

None.
