# Plan - tb-implementation-efficiency

**Feature:** `tb-implementation-efficiency`
**Created:** 2026-11-09
**Spec:** [spec.md](spec.md), validated through current protocol
**Design:** [design.md](design.md), approved 2026-11-09
**Interview:** [interview.md](interview.md)
**Status:** Implementation authorized 2026-11-09; in progress.

## Strategy

Deliver on the existing isolated topic branch/worktree as one issue/workflow. Use useful internal commits, not new workflow gates or a multi-branch feature hierarchy. Implement the shared contract and services first; adapt CLI/MCP/desktop to the same operations. Keep old active sessions and records untouched while building and testing the new contract in disposable feature homes.

Scope authority is the validated specification. This plan orders likely dependencies but does not require the implementer to follow a fixed sequence. Use focused tests while changing each area, early independent inspection for consequential persistence/authority changes when useful, and complete acceptance evidence at the final boundary. Do not remove existing CI suites to make the work appear faster. Current installed workflow obligations still govern delivery of this refactor; do not claim that the new consolidation rules already apply to its own review.

## Steps

- **P1. Establish the evidence and contract map.** Inspect available recent fleet snapshots and existing review/fix history, current GateReeve/MyLifeMap CI configurations, and every caller that currently depends on runtime fingerprints or named review gates. Record a bounded before-change baseline using representative current-contract fixtures; label real versus synthetic evidence. Reconcile what rc.24 already fixed, remaining attribution gaps and unknown project mappings. Inventory required project/module obligations and identify where each is represented in the new consolidated assessment/checks. Use linked environments and available exports read-only; mark unavailable hosts rather than requiring live access to proceed. **Advances:** R1, R2, R4, R5, R6, R8.

- **P2. Implement per-workflow SQLite authority.** Introduce a versioned store using the existing Node SQLite/runtime precedent, with minimal schema for the specified record groups and explicit workflow/operation identities. Integrate current-store callers through a narrow storage contract; preserve source/artifact references where useful. Use short transactions for state/results/decisions and explicit terminal outcomes. Keep retries idempotent and simultaneous writes correctly scoped. Wire independent worktrees, replacement threads, missing-database state and read-only inspection. Store-side operations must not silently edit Git policy; implement the approved untracked-file policy through the appropriate scoped repository/setup mechanism and verify it. **Advances:** R3, R4, R7, R8.

- **P3. Remove recursive environment qualification.** Trace and replace fingerprint-dependent execution preparation, post-check guards, status, evidence qualification, waiver and milestone paths with the approved source/configuration/evidence contract. Remove the new path's fingerprint cache/manifests and tool-specific dependency traversal policy. Preserve cheap source/document/artifact identity, actual command receipts, human approval scope and protected branch direction. Distinguish local mutable observations from exact-candidate CI and keep stale/late results historical. Record CI executed/skipped/required scope or an independently assessed alternative. **Advances:** R2, R3, R8.

- **P4. Consolidate independent assessment and history.** Update gate contracts, evaluator packets/schema, qualification and canonical instructions so one fresh independent assessment covers all approved responsibilities. Preserve support for optional additional reviewers/models and meaningful delta review; require evidence-backed dispositions and retain original failures. Replace the mandatory separate Judge dependency without making implementer self-review qualify. Feed bounded relevant history from SQLite, exposing unknown/missing artifacts; record strategy/reasons during existing operations. Keep source-view/history performance improvements confined to needs of this contract and measured bottlenecks, not a second unrelated rewrite. **Advances:** R1, R2, R3, R4.

- **P5. Build projection and fleet snapshot import/export.** Publish derived reporting records to the existing separate metrics store with workflow/source identity, human-readable labels and capture/provenance fields. Keep projection failure visible and nonblocking; reuse stable execution identities across retries. Define a small versioned snapshot envelope carrying source/time coverage and records, plus supported historical rc.23/rc.24 import. Handle overlapping snapshots, updated observations, conflicting identities, unknown labels and unsupported formats explicitly. Reopening a selected dataset must preserve its observation set. Use available local/Playpen/AWS/UpCloud data and platform-labeled fixtures; no live authority synchronization. **Advances:** R4, R5, R6.

- **P6. Implement shared deterministic report and optional analysis.** Extend shared report/service code to provide all-project overview, project/workflow/check/reviewer/platform drill-downs, evidence links, elapsed/effort/overlap accounting, repetition reasons, finding/fix outcomes and coverage disclosure. Keep dataset/filter/query semantics reusable. Render JSON and readable standalone HTML from the same report model. Add explicit agent-analysis requests using existing configured provider execution; cite record identities and retain inference labels/limitations, with no automatic policy edits. Report deterministic facts even when model analysis is unavailable. **Advances:** R4, R5, R6, R7.

- **P7. Expose shared operations through CLI, MCP and desktop.** Add thin adapters and UI for report selection/drill-down/export/import, explicit analysis and database/source visibility. Reuse shared errors and semantics; keep inspection read-only and known-path discovery bounded. Reuse metrics cleanup. Implement only a small inactive-workflow fresh-state convenience if safe in the existing operation model; otherwise expose the approved limitation without building recovery/coordination machinery. Verify packaged resource staging and surface parity. **Advances:** R6, R7, R8.

- **P8. Verify rollout, evaluate the rubric and prepare delivery.** Exercise new-run versus legacy behavior, explicit resume, missing DB, preserved documents/approvals and old runtime bytes. Run focused regressions for remaining findings and the appropriate broad authoritative CI/acceptance matrix for the final candidate. Compare the bounded baseline and candidate timing/coverage with limitations; do not claim universal quality or speed gains. Complete the current governing review boundary and prepare its human-readable packet, keeping any PR closed per policy. Publishing, installing and activating the release occur only under separately granted authority; capture those post-merge outcomes before a final completion claim. **Advances:** R1–R8.

## Code areas and integration points

| Area | Starting points |
|---|---|
| Current state/evidence and authority | `plugin-src/shared/resources/protocol/current/store.js`, `core.js`, `contracts.js`, `authorization.js`, `adapter.js`, `evidence.js`, `coverage.js` |
| Fingerprint removal and execution | `protocol/current/environment.js`, `fingerprint-cache.js`, `runner-profile.js`, `execution.js`, `delivery.js`; retain non-fingerprint responsibilities where needed |
| Independent review and source views | `protocol/current/review-history.js`, `source-views.js`, `git-source.js`, provider adapters and review schemas |
| Canonical guidance | `plugin-src/shared/resources/policy/WORKFLOW.md`, `PROTOCOL.md`, `PERFORMANCE.md`, `commands/pr-review.md`, `judge.md`, `pr-boundary.md`, and relevant skill wrappers |
| Metrics/reporting/snapshots | `plugin-src/shared/resources/performance/store.js`, `observe.js`, `import.js`, `report.js`, `service.js`, `mcp.js`, `run.js` |
| CLI | `cli/src/commands/metrics.js`, protocol commands, shared resource loader/staging |
| Desktop | `apps/desktop/main/ipc.js`, preload/shared contracts, `renderer/metrics-view.js`, workflow views and protocol staging |
| Validation/delivery | `cli/test/current-*.test.js`, `cli/test/performance.test.js`, `apps/desktop/test/metrics-view.test.js`, related integration tests, `.github/workflows/plugin-ci.yml`, `ci/portable-acceptance.sh` |

Paths are starting points, not permission to rewrite entire modules. Adapt file boundaries to the inspected code. Generated/staged resource copies are produced by existing staging scripts rather than edited independently.

## Verification approach

Use meaningful checks of externally observable behavior:

- Database isolation, transaction interruption, duplicate operations, concurrent results, thread replacement and missing-file behavior on disposable stores.
- Fingerprint-removal checks that detect unintended runtime-directory reads on status/execution/acceptance paths, not merely a renamed function. Preserve source/approval/CI drift rejection and actual-result provenance.
- Fresh evaluator fixtures with complete versus missing responsibilities, implementation-context rejection, unresolved findings, stale evidence, independent alternative coverage and optional extra review.
- Timing fixtures for overlapping/nested spans, known versus unknown waits, interrupted executions, retry identities and imported partial capture; ensure recorded totals reconcile with their observations.
- Snapshot reimport/overlap/conflict/version cases, supported legacy exports and missing hosts; inspect human-readable defaults without exposing raw arguments/environment/logs.
- Shared-service parity across CLI/MCP/desktop, deterministic report data, HTML usability and explicit analysis success/failure/provenance. Rendered checks validate real interaction behavior instead of only string snapshots.
- Legacy fixture byte comparisons and explicit resumption checks. Upgrade must not mutate active old records or silently replay authority.

During implementation, run relevant Node test files directly after required resource staging and measure them with the existing lightweight wrapper where appropriate. Avoid repeated full package/build/test matrices after every correction. At the final boundary, use the actual CI scope and required authoritative suites; current GateReeve CI distinguishes full-source changes from review-artifact-only changes. Source-acceptance receipts available only after push/merge cannot be prerequisites for a pre-merge product fixture.

**Final step:** Run full rubric evaluation and produce the completion report, retaining genuine failures and limits. Pre-merge review readiness is distinct from merge, release, install and verified activation.

## Dependencies and known limits

P1 informs the contract and evidence choices. P2 supplies state/history for P3–P5. Reporting model work in P6 can use fixed fixture inputs while projection evolves; adapters in P7 consume shared service contracts. P8 follows completed behavior, not a time limit. The implementer may reorder independent work without changing required outcomes.

Read-only fleet evidence collection is incomplete. UpCloud was unreachable; no fresh fleet comparison is claimed. Actual remote CI and active model/provider availability must be checked when their evidence is needed. The approved behavior remains testable with controlled fixtures and truthful missing-source disclosure.

No automatic external communication, delegation, installation, release or deployment is authorized by this plan. A substantive scope change goes back through the design/spec amendment path. Implementation authority is recorded below.

## Implementation authorization - 2026-11-09

User instruction: “Approved”, responding to the concrete specification/plan approval request. Recorded authorize-implementation through the installed current adapter. Implementation is now authorized; merge/publication/installation/deployment remain separate.
