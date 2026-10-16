# Interview - tb-configurable-gate-ordering

**Feature start:** 2026-10-12
**Status:** active

## Request and context

Trent requested a design interview before implementation, following approved PR80 integration. The goal is user access to adding, removing and reordering workflow gates. No design, specification or implementation plan is approved for this new feature. No external tracker task is assigned or created.

**Workspace:** existing attached worktree /Users/trent.brown/.codex/worktrees/boundary-iteration-cost/gatereeve, branch tb-configurable-gate-ordering, based on origin/main at 64db6b635f03018581a8977a7b6933bc59b2ccbd. Prior feature closeout bookkeeping is retained on this branch; prior feature remains Finalizing pending release obligations.

## Codebase findings

- docs/WORKFLOW-MODULES.md: tracked .gatereeve/workflow.json selects exact module versions/digests and enablement. Policy array order is not execution order.
- Module manifests use dependsOn for required dependencies and after for conditional ordering. Resolution creates a stable topological order and rejects missing/disabled hard dependencies and cycles.
- Locked built-ins remain enabled; model locks and attempt graph snapshots retain historical policy and evidence meaning.
- Boundary retry defers presentation until substantive checks are current and nonblocking, while preserving the resolved formal graph.

## Settled decisions

### D1 - Owner control of review-module enablement

**Recorded:** 2026-10-13

**Question:** Should owners be allowed to disable standard checks such as Judge, or should removal be limited to optional add-ons such as Whiteboard Defense?

**Answer:** "Yes, let project owners disable standard checks such as Judge, while preserving the protocol safeguards and the requirements of any module they keep enabled."

**Decision:** Project owners may disable standard review modules, including Judge. Protocol safeguards remain enforced, and enabling a module retains all of its requirements. Disabling a prerequisite of an enabled dependent module cannot silently weaken that dependent module. The configuration interface must handle such a dependency conflict explicitly; how it does so remains undecided.

## Open design question

Does user-selected ordering require one gate to finish before the next starts, or merely prioritize gates whose hard prerequisites are already satisfied? Parallel-group semantics and interface are not yet decided.

## Design clarification - 2026-10-14 (not ratified)

Trent asked whether stages already exist and how the proposed stage concept would be exposed and encoded. The code already derives dependencyStage/dependencyBranch/orderLabel from graph depth in protocol/projection.js; the Desktop renderer groups these into visual dependency stages. These groups are not global execution barriers: eligibility follows each gate's actual dependencies. Separately, agent-workflow manifests contain internal run.stages within an individual module.

The previously suggested owner-authored stages with whole-stage completion barriers would be a new configuration concept and stronger execution contract. It is not approved. Based on existing graph/UI machinery, the revised recommendation is to configure additional completion-order relationships in repository policy, reuse the graph and derive visual grouping from it. Keep module hard requirements immutable; policy ordering cannot remove them or introduce cycles. An illustrative new ordering field in .gatereeve/workflow.json could make Judge follow Code Review. This schema extension and its UI remain proposals, not implemented or ratified decisions.

## DAG explanation request - 2026-10-14 (not ratified)

Trent requested a complete explanation/diagram of current dependencies, proposed additions and the existing GateReeve UI diagram. Current bundled default has Pin Context -> Reconcile -> Verification; Verification is a hard prerequisite of Spec Evaluation, Pattern Review, Judge and Code Review. Decision Triage conditionally follows those four enabled reviews; Explain Diff requires Decision Triage; locked Packet Validation requires Explain Diff. Optional Whiteboard Defense is disabled by default, requires Verification and conditionally follows Judge. Feature finalization is a separate slot after verified feature-final integration, currently containing GateReeve Release.

UI verification: renderer/index.html exposes Workflow overview -> Attempts and gate dependencies, plus separate finalization graph and Modules policy settings. renderer/renderer.js groups gates by derived depth, and gateConnector(fromCount,toCount) draws generic adjacent-group fan-in/fan-out connectors without reading actual edges. It is a visual layering summary, not a faithful renderer of every arbitrary dependency relationship. Revised proposed UI scope should render actual resolved edges, distinguish hard/conditional/owner-selected ordering, and show immutable prerequisites/conflicts in a policy preview. This is a design finding/proposal, not an approved D2.

Current policy schema selects module version/digest/enablement; module manifests own dependsOn/after. Proposed owner ordering would extend repository policy with additional relationships and compile into the existing graph, without introducing owner-authored execution stages or weakening module requirements. Completion ordering versus priority, and what happens to owner-selected links when a predecessor is disabled, remain unresolved.

### D2 - Completion-order policy and exact DAG presentation

**Recorded:** 2026-10-14

**Question:** Explanation requested of existing dependency configuration, proposed additions and the GateReeve workflow diagram.

**Answer:** "Okay, I approve of this. Make it so."

**Decision:** Proceed with the explained repository-policy ordering extension, preserving original module requirements and structural safeguards; use completion-order relationships and derive stages automatically. Extend Modules settings and render actual graph edges with distinguished origins. No owner-authored global stages. User directs implementation; specification/planning make this approved direction concrete. Conditional owner links use existing after semantics.

## Interview close

**Status:** complete; design direction approved for implementation. Existing dependency contracts, conditional ordering, original digests and historical graphs are solid constraints. Serialization, freshness and accurate UI rendering require regression coverage; captured in spec.md.
