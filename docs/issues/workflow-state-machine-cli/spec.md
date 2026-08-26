# Spec - workflow-state-machine-cli

**Feature:** `workflow-state-machine-cli`
**Created:** 2026-08-25
**Status:** approved 2026-08-25

## Summary

GateReeve must govern feature, slice, change, and PR-boundary passage through a
deterministic, versioned protocol core packaged with the plugin. The core must
reject illegal or stale passage, retain an auditable event history, expose an
accurate current-state projection, and support autonomous agent work between a
small set of genuine human decisions. An optional Commander.js `gatereeve` CLI
must provide the same governance and observation behavior without becoming a
plugin prerequisite or a workflow engine.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** Initializing a new governed feature atomically creates its pinned
  workflow model, event journal, and interview record; records entry into
  `DESIGNING`; and produces a valid current-state projection. A failed
  initialization leaves no partially initialized governed feature. An
  existing feature without governance artifacts is reported plainly as
  legacy and may finish without adoption or reconstruction.

- **AC2.** Given the same valid model lock, journal, and external facts, the
  protocol produces the same projection. Corrupt journals, invalid event
  sequences, unknown guards, incompatible models, and malformed evidence fail
  closed without recording passage. Updating GateReeve does not silently
  change an active feature's pinned model; migration presents an impact report
  and requires human confirmation.

- **AC3.** Only declared semantic feature and slice transitions are accepted.
  The feature phases, sequential slice lifecycle, one-active-slice invariant,
  implementation authorization, slice and feature abandonment rules, and
  pause/resume suspension overlay behave as defined by the approved design. A
  rejected transition changes neither the journal nor the projected state.

- **AC4.** GateReeve enforces the PR-boundary dependency graph, applicability,
  evidence fingerprints, freshness, and blocking outcomes. A change to source
  or another governing input makes all dependent evidence stale. Remediation
  creates a later boundary attempt without erasing earlier attempts. Passage
  to `HUMAN_REVIEW` is rejected until every required gate is current and
  nonblocking.

- **AC5.** A final real slice can use `FEATURE_FINAL` scope. Complete-feature
  verification, specification evaluation, rubric completion, and judging use
  the original feature base, while slice-focused review and explanation use
  the final slice boundary. After the reviewed content is verified as merged,
  `FINALIZING` performs closeout only; discovered missing implementation
  requires another real delivery slice.

- **AC6.** Discoveries affecting design, specification, plan, or slice
  structure are represented by durable change records with their declared
  lifecycle, blockers, and invalidation effects. Design or specification
  amendments and waivers require human confirmation. In-scope plan and slice
  adjustments remain agent-manageable. One approved implementation
  authorization covers sequential delivery until human review or another
  declared human decision is required.

- **AC7.** `status`, `next`, `explain`, `history`, and `graph` report feature,
  active slice, boundary attempt, gate, change, freshness, blocker, suspension,
  and eligible-action information from the authoritative projection.
  Complete-model and current-position graphs are available as Mermaid and
  JSON. Read-only commands record no events and exit successfully whenever a
  projection can be produced, including blocked or stale projections; `check`
  exits nonzero when its requested invariant is false.

- **AC8.** State-affecting GateReeve skills use the plugin-packaged JavaScript
  core without requiring a PATH-installed CLI. The optional Commander.js
  `gatereeve` executable exposes the same semantic operations and stable JSON
  envelope while preserving maintainer operations under `plugin` and
  `release`. SessionStart reports concise governed or legacy status. Neither
  adapter stages or commits files, installs Git hooks, schedules agents, or
  provides a generic force bypass.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Governed feature initialization and legacy coexistence | Successful initialization creates a complete `DESIGNING` feature atomically, injected failures leave no partial record, and ungoverned in-flight features are explicitly labeled legacy | Any required artifact is missing, failure leaves a partial governed feature, mode is ambiguous, or an existing feature is implicitly adopted | Integration tests using successful, failure-injected, and legacy fixtures |
| R2 | Journal and projection integrity | Valid input replays deterministically, and invalid schemas, sequences, guards, compatibility, or evidence fail closed without mutation | Identical inputs produce different projections or malformed state or evidence is accepted | Deterministic replay, corruption, atomic-write, event-sequence, and compatibility tests |
| R3 | Model pinning and migration | Active features retain their locked model across GateReeve upgrades, and migration reports impact and requires recorded human confirmation | An upgrade silently changes active semantics or migration bypasses impact reporting or confirmation | Version-skew, compatibility-range, and migration integration tests |
| R4 | Feature and slice lifecycle enforcement | Every declared transition succeeds under its guards, tested illegal transitions append no event, and no more than one slice is active | Illegal passage succeeds, rejection changes state, or multiple slices become active | Transition-table tests with journal and projection assertions |
| R5 | Suspension and implementation authority | Pause preserves exact position and blocks ordinary mutations, resume restores eligibility, and one authorization supports approved sequential slices until a declared human gate | Suspension loses position or permits ordinary mutation, or routine approved slice work repeatedly requires human authorization | Lifecycle scenarios covering pause, resume, authorization, sequential slices, and human gates |
| R6 | PR-boundary ordering, freshness, and attempts | Dependencies, applicability, outcomes, fingerprints, invalidation, remediation, and attempt history are enforced before human review | Boundary passage occurs out of order, with stale or blocking evidence, or prior attempts are overwritten | End-to-end boundary tests including mutation, failed gate, rerun, waiver eligibility, and remediation cases |
| R7 | Feature-final routing and closeout | Complete-feature and final-slice gates receive their specified bases and scopes, reviewed merge content is verified, and closeout cannot conceal missing implementation | A gate evaluates the wrong range, merge verification assumes unsupported SHA equality, or missing code reaches completion through closeout | Sequential multi-slice acceptance tests covering feature-final evaluation, merge verification, and return to delivery |
| R8 | Discovered-change governance | Each change follows its lifecycle and applies the correct blocker, invalidation, and human or agent authority rule | An unresolved or unvalidated change permits passage, or an in-scope plan/slice change introduces an undeclared human gate | Change-record transition tests and authorization/invalidation scenarios |
| R9 | Observer, graph, JSON, and exit-code contract | Human and JSON views agree, model and current graphs reflect the same projection, queries create no events, and query/assertion exit codes follow the documented contract | Views disagree, observations mutate state, graph state diverges, or blocked/stale query results are treated as command failure | CLI snapshots, JSON-schema tests, graph projection comparisons, and exit-code integration tests |
| R10 | Plugin and optional CLI parity with operational boundaries | The plugin governs work without a global CLI, optional `gatereeve` operations match plugin results, SessionStart discovers the correct mode and state, maintainer namespaces remain available, and prohibited side effects do not occur | The CLI becomes mandatory, adapters disagree, activation or maintainer commands regress, or governance stages, commits, installs hooks, schedules work, or exposes force passage | Native-package smoke tests, adapter contract tests, CLI regression tests, SessionStart tests, and Git side-effect assertions |

## Changes

Append specification amendments here. Do not remove or weaken original
criteria.
