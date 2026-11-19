# Plan - tb-dual-model-review

**Feature:** `tb-dual-model-review`
**Spec:** [spec.md](spec.md)
**Design:** [design.md](design.md)
**Interview:** [interview.md](interview.md)
**Created:** 2026-11-18

## Inputs

The human approved design.md and the eight AC/rubric now transcribed in spec.md. The current adapter recorded specification validation. The current run has delegated autonomy after GitHub main protection was enabled under explicit human instruction. Delegation does not grant final release merge permission.

## Strategy

Implement in three coherent slices: paired reviews/runtime selection; autonomous mandate/adjudication authority; then complete delivery/publication/CLI/desktop/native-policy integration. Keep tests and essential entry-point support with the behavior they exercise. Use the installed current/7 adapter to govern this feature; changing product protocol source must not change this run's authority interpreter mid-flight.

Canonical edits belong under plugin-src/shared, cli/src, and apps/desktop main/renderer/shared. Stage bundled protocol resources through the existing stage scripts; do not hand-edit generated copies. Preserve historical evidence and pre-existing lightweight-mode state. Reconcile the current main tip before final delivery without importing any development branch into this topic.

Before source implementation, run a fresh independent planning.review of the specification and plan, then record authorize-implementation against the current commitment subject citing that qualifying review under delegated-evaluator authority. If an external prerequisite fails, retain the failure and report the precise blocker; do not fabricate authorization.

## Steps

- **P1. Define paired evidence and compatibility.** Add explicit identities for reviewer selection, each perspective, a candidate-bound review pair and any later adjudication. Update current-result/coverage/packet qualification so both actual receipts are required and a newer failure/unavailability is not hidden by older PASS. Distinguish actual model providers from execution adapters. Preserve historical single-review records and expose missing current obligations. Decide contract/version migration explicitly and record the rationale before changing it. **Advances:** R1, R3, R4, R8.
- **P2. Resolve models and execute pairs.** Add a runtime-discovery/selection path appropriate to supported environments, with capability observations, daily-driver selection rationale, exact model/effort identities, explicit-instruction handling, pair reuse and recorded replacement. Integrate available native adapters; T3 discovery is optional input, not a new product dependency. Execute independent initial assessments concurrently in separate read-only views. Retain completed peers when one fails; protect concurrent event/result retention. Add deterministic adapter tests with a barrier proving overlap and tests for same-provider aliases, unknown capabilities, unavailable execution and explicit pins. **Advances:** R1, R2, R3.
- **P3. Reconcile findings and reuse both perspectives.** Namespace stable reviewer findings or otherwise preserve provenance when grouping duplicates. Extend bounded history, delta proof and applicability so each perspective covers changed behavior/interactions and affected fixes, while unchanged qualifying proof can survive. Expose persistent material disagreement without implementer-authored clearance. Include full/light basis and semantic contradiction tests. **Advances:** R1, R4, R5.
- **P4. Add autonomous mandate and planning authority.** Extend autonomy enums, named-run grant validation and status projections without changing built-in defaults. Retain the human mandate separately from mutable derived requirements; add mandate-bound amendment authority with independent planning review and refreshed affected proof. Preserve supervised/delegated rules, human-only mandate changes, protected-release checks and light-to-full behavior. Keep machine-checked identity/authority distinct from semantic review conclusions. **Advances:** R5, R6.
- **P5. Add adjudication and convergence.** Record current-candidate/current-pair adjudication, affected findings, reviewer positions, evidence, rationale, residual risk and optional diminishing-returns stop reason. Only active autonomous authority can apply it. Enforce ineligible cases (missing perspectives, insufficient coverage, failed mandatory checks, integrity or mandate violations). Preserve original verdicts and invalidate changed-risk decisions. Add adversarial tests preventing partial/unavailable evidence, cross-candidate reuse, stale grants and blanket finding waivers from establishing acceptance. **Advances:** R4, R5, R7.
- **P6. Integrate delivery and human-facing records.** Update protected slice acceptance/merge and publication to accept qualifying dual-review proof or eligible autonomous adjudication while preserving all other gates and explicit release-merge authorization. Update CLI commands/help, desktop projections/actions/rendering, native commands/skills, protocol/policy docs and shipped inventories consistently. Show both reviewers, selection provenance, dissent and accepted risks. Test truthful readiness versus integration, protected-branch blockers and resumption from single-review histories. **Advances:** R5, R7, R8.
- **P7. Verify and prepare final delivery.** Run scoped tests per slice, required canonical checks/builds and the relevant broader regression suites after integration. Obtain actual independent implementation review and record all rubric evidence, unavailable live coverage and remaining risks. Publish exact-candidate review summaries and prepare the final PR for human review. Final release merge remains separately authorized. **Advances:** R1–R8.

## Code areas and integration points

- Protocol: current/contracts.js, core.js, execution.js, evidence.js, coverage.js, review-history.js, delegation.js, authorization.js, delivery.js, publication.js, workflow-database.js, adapter.js, source views and local-agent-adapters.js; extract bounded new modules where responsibility warrants it.
- Selection: native capability discovery and adapter descriptors with retained observations; no version whitelist, model-selection config schema, or changed implementation/planning model policy.
- CLI: cli/src/commands/current.js, protocol/client.js and help contracts.
- Desktop: apps/desktop/main protocol/coordinator, renderer/current-view.js and presentation.js, shared/contracts.js, projection resources and current-view/contract tests. Inspect actual callers before altering projected fields.
- Native documentation/packages: shared resources/PROTOCOL.md, policy/WORKFLOW.md, commands, skills, packaged current inventory and staging/build commands.

## Verification

- Pair and selection tests prove complete coverage, real independent receipt validation, provider-family diversity, parallel overlap, partial failure retention and stable within-run selection.
- Existing current-core/history/coverage/CLI tests exercise per-perspective freshness, amendments and changed source interactions. Extend fixtures deliberately; do not mask missing review proof globally.
- Dials/delegation tests cover all three levels, unchanged defaults and old-mode authority, mandate capture/review, in-mandate amendment, out-of-mandate refusal, tripwires and branch-protection failure.
- Adjudication tests cover eligible dissent and ineligible gaps, truthful original outcomes, diminishing returns, candidate/grant invalidation and final-release restrictions.
- Publication/desktop/CLI tests verify both perspectives and adjudication visibility, including missing/failed results and historical single-review records.
- Use focused node --test suites through the repository performance/storage wrapper. Then run required plugin validate/lint/native validation, CLI test suite, desktop checks and plugin build as applicable to the final changes. Stage generated protocol resources using repository commands first. Do not rerun unchanged passing suites without a new concern.
- Exercise real native reviewer adapters where available; retain errors and report absent live coverage honestly. Simulated contract tests do not claim actual model execution.
- **Final step:** Evaluate R1–R8, reconcile issues/tracker, triage decisions, retain current proof and prepare a reviewable final PR. Post-merge release/deployment is not a pre-merge AC dependency.

## Delivery slices

1. Paired review evidence, runtime selection, concurrent execution and finding/delta handling (P1–P3).
2. Autonomous mandate, planning authority and adjudication (P4–P5).
3. Delivery and complete user-facing/native integration plus final validation (P6–P7).

Use distinct implementation commits/slices. If slice PR delivery is used, establish the distinct feature integration branch and original feature base in the local workspace configuration before preparing candidates; only qualifying slice merges can use delegated authority. No main/release merge is inferred from the instruction to proceed.
