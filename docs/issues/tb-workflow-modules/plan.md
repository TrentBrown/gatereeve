# Plan - tb-workflow-modules

**Feature:** `tb-workflow-modules`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-09-03

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Deliver the feature as four sequential PR slices. The first slice establishes a
canonical module contract and converts the existing boundary graph with no
intentional behavior change. The second consumes that contract in Desktop
configuration and presentation. The third adds explicitly initiated execution
and isolated observation. The fourth adds generic finalization passage and the
GateReeve-specific release implementation, then verifies the assembled feature
through a real release.

The protocol core, CLI/plugin package, and bundled Desktop copy must continue to
share one canonical model and contract. Every slice therefore updates canonical
sources first, regenerates or synchronizes packaged copies through existing
repository mechanisms, and proves parity before its PR boundary. Later slices
begin from updated `main`; they do not merge a development branch outward.

## Steps

### Slice 1 - Module protocol foundation

- **P1. Define versioned module contracts and fixtures.** Specify and validate
  built-in and repository manifest shapes, tracked policy, resolved feature-lock
  graph, adapter references, exact versions/digests, the two legal slots,
  dependency metadata, lock/configuration/waiver flags, and deterministic
  canonical hashing. Add positive and adversarial fixtures for duplicate IDs,
  unknown slots, missing definitions/dependencies, cycles, and digest drift.
  **Advances:** R1, R7.

- **P2. Implement deterministic discovery, resolution, and migration impact.**
  Resolve built-ins plus `.gatereeve/modules/` against
  `.gatereeve/workflow.json`, produce a stable topological graph, pin the full
  result in the feature model, distinguish definition validity from local
  implementation readiness, and expose explicit update/migration diffs without
  silent substitution. Cover atomic recovery and stale-evidence impact.
  **Advances:** R1, R3.

- **P3. Convert the PR boundary to built-in modules with parity.** Replace the
  hardcoded gate inventory with declarative built-ins while retaining current
  dependency order, outcome/freshness rules, fingerprints, attempts,
  remediation, artifacts, and human-review guards. Lock context pinning,
  reconciliation, decision triage, and packet validation; retain current
  configurable defaults for the other checks. Prove old scenarios against the
  new representation and maintain CLI/plugin/Desktop model parity.
  **Advances:** R2, R3, R6.

### Slice 2 - GateReeve module interface

- **P4. Add project module configuration and migration controls.** Implement
  staged checkboxes, locked-module explanations, dependency-aware enable and
  disable previews, full-graph validation, tracked-policy diff display, atomic
  apply without Git staging/commit, active-feature migration preview, and
  visible local implementation readiness. Add the boundary- and feature-scoped
  waiver dialogs and protocol operations with reason/fingerprint validation.
  **Advances:** R1, R3.

- **P5. Generalize state-specific module visualization.** Refactor the current
  attempts-and-dependencies card into a shared accessible graph/detail renderer.
  Preserve the six-item rail; render the selected slice's boundary graph beneath
  Implementing and finalization modules beneath Finalizing. Add normalized live
  status, freshness, evidence, stages, actions, attempt history, and empty-slot
  behavior without custom module UI.
  **Advances:** R4, R7.

### Slice 3 - Execution and provider runtime

- **P6. Implement run-adapter and provider process contracts.** Add `skill`,
  `manual`, and `command` adapter validation; keep skill dispatch external and
  manual attestation explicit. Define the versioned JSON-over-stdio observation
  contract, installed-provider discovery and allowlisting, normalized live
  status, process supervision, and fail-closed handling for unavailable,
  malformed, stale, duplicate, crashed, and timed-out providers. Route verified
  terminal evidence through fresh protocol-core validation.
  **Advances:** R5, R6.

- **P7. Add local command authorization and task terminal sessions.** Store
  repository/exact-version consent locally, implement `Run once` and
  `Always allow this command version`, invalidate detectable input changes, and
  disclose unsandboxed authority. Extend the one-shell terminal to dedicated
  named module sessions with selection, interaction, timeout, cancellation,
  bounded transcripts, app-restart cleanup, and attributable result mapping.
  Preserve the persistent user shell and enforce exit/cancel/provider result
  semantics.
  **Advances:** R5, R6.

### Slice 4 - Finalization and GateReeve Release

- **P8. Add generic feature-finalization attempts and passage.** Instantiate the
  pinned `feature.finalization` DAG after the final merge, bind its fingerprint
  to that merge input and module graph, retain live provider progress separately
  from outcomes, and block Complete until required modules are current and
  nonblocking. Cover zero-module projects, manual/command/provider modules,
  failures, reruns, unavailable implementations, N/A, and feature waivers
  without adding release-specific core state.
  **Advances:** R3, R4, R7.

- **P9. Implement GateReeve Release and Release Conductor observation.** Ship
  `gatereeve/release` and the `gatereeve/release-conductor` provider, reuse the
  existing conductor chain validation, map its stages/actions to the generic
  provider contract, prove source containment of each final merge, allow one
  release to satisfy multiple contained features, and fail closed for missing,
  expired, divergent, nonterminal, or wrong-source evidence.
  **Advances:** R6, R8.

- **P10. Verify the assembled feature and dogfood finalization.** Run the broad
  protocol, CLI/plugin, Desktop, packaging, accessibility, and runtime suites;
  exercise settings, waivers, provider failures, authorization, multiple PTYs,
  and both slots in the packaged app. Merge the final slice, conduct a real
  GateReeve release, and retain conductor, publication, direct-install, Cask,
  Apple Silicon, and Intel-or-Rosetta evidence before final feature passage.
  **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.

## Verification

- At every slice boundary, run changed-area unit and integration tests plus the
  repository's portable acceptance, Desktop test/build, package contract,
  dependency audit, and workflow document validators applicable to that diff.
- Pin one authoritative PR context and use it for verification, spec evaluation,
  Judge, pattern review, code review, decision triage, explain diff, and packet
  validation.
- For Desktop slices, run keyboard/accessibility checks and a packaged runtime
  walkthrough of the affected state, settings, and terminal flows.
- For protocol changes, run deterministic replay, malformed-event, stale-input,
  failed-write recovery, CLI/plugin parity, and bundled Desktop parity tests.
- For executable surfaces, include adversarial command/provider tests and prove
  that project opening and polling never initiate commands or agents.
- **Final step:** Run full AC1-AC8/R1-R8 evaluation against the assembled feature,
  complete the real post-merge release proof required by R8, and produce the
  completion report.
