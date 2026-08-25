# Plan - workflow-state-machine-cli

**Feature:** `workflow-state-machine-cli`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-25
**Status:** implementation authorized 2026-08-25

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge
  cases.

## Strategy

Build one dependency-light JavaScript protocol implementation from a single
canonical source and project those same sources into both the self-contained
native plugin packages and the optional CLI package. Keep Commander and
platform adapters outside the core. Existing Python context, packet, feature-
final, and lint validators remain trusted leaf guards invoked as subprocesses;
they do not become a second state authority.

Implement from the inside out. First establish schemas, normalized model data,
journal durability, fact adapters, deterministic projection, and lifecycle
transition enforcement. Next add PR-boundary attempts, evidence freshness,
feature-final routing, and discovered-change governance. Finally expose the
observer/mutation API through skills, SessionStart, and the renamed Commander
CLI, then validate native packaging and legacy coexistence on both supported
agent platforms.

Use fixtures with temporary Git repositories and explicit fake GitHub facts so
state and invalidation tests remain deterministic. Preserve the existing
sequential-workflow acceptance coverage and extend it instead of replacing it
with a disconnected test harness.

## Proposed delivery slices

1. **Protocol foundations:** model, journal, initialization, projection,
   feature/slice lifecycle, suspension, and migration contracts.
2. **Boundary and change governance:** gate attempts, evidence freshness,
   invalidation, feature-final routing, discovered changes, and authorization.
3. **Adapters and observability:** plugin skills, query/check/graph surfaces,
   SessionStart, optional `gatereeve` CLI, packaging, documentation, and full
   native smoke coverage.

Only one slice is active at a time. These are delivery instances of the fixed
slice lifecycle, not new workflow state types.

## Steps

- **P1. Define canonical protocol contracts and packaging boundaries.** Add the
  GateReeve-specific normalized workflow model, closed guard registry contract,
  event and evidence schemas, stable result envelope, error taxonomy, and
  compatibility rules. Establish one canonical core-source location and make
  plugin/CLI assembly reject missing or divergent projections of it. Update the
  workflow inventory and Node runtime prerequisite without introducing a
  generic workflow DSL. **Advances:** R2, R3, R10.

- **P2. Implement durable feature initialization, model locking, and journal
  replay.** Add atomic `feature init`, normalized model hashing, first-event
  creation, legacy discovery, strict event validation, stable IDs and sequence
  numbers, append/correction behavior, deterministic replay, and fail-closed
  compatibility handling. Split or adapt the current bootstrap behavior so
  initialization creates only the records appropriate to `DESIGNING` and never
  partially initializes a feature. **Advances:** R1, R2, R3.

- **P3. Implement projection and feature/slice transition enforcement.** Derive
  feature, slice, suspension, authorization, blockers, and next actions from
  journal plus freshly inferred facts. Implement the declared feature and slice
  transitions, one-active-slice invariant, abandonment behavior, pause/resume
  overlay, mutation preflight, and append-after-revalidation contract. Build
  table-driven tests proving accepted and rejected passages and absence of
  rejected events. **Advances:** R4, R5.

- **P4. Implement PR-boundary attempts and evidence governance.** Integrate the
  existing PR context, boundary packet, validation, lint, review, and decision-
  triage helpers through trusted guard adapters. Add boundary-attempt identity,
  dependency eligibility, outcome/applicability recording, input fingerprints,
  freshness and invalidation projection, waiver scope, remediation, and passage
  to human review. Preserve earlier attempts as history and classify tracked
  journal changes without weakening clean-tree source checks. **Advances:** R6.

- **P5. Implement feature-final and merge verification.** Route complete-
  feature gates to the original feature base and slice-focused gates to the
  final slice range, using existing `feature_final.py` and boundary contracts.
  Verify that reviewed content reached the integration branch across supported
  GitHub merge modes, implement closeout-only `FINALIZING`, and return to
  delivery when implementation is missing. **Advances:** R7.

- **P6. Implement discovered-change and authority rules.** Add durable change
  records for design, spec, plan, and slice effects; lifecycle transitions;
  blockers; invalidation sets; amendment consequences; waivers; and renewed
  implementation authorization. Distinguish human-confirmed design/spec/risk
  decisions from agent-manageable in-scope plan/slice decisions without
  claiming actor authentication. **Advances:** R5, R8.

- **P7. Implement observer, assertion, history, and graph APIs.** Produce human
  output from one stable JSON envelope for `status`, `next`, `explain`,
  `history`, `graph`, and `check`. Generate complete-model and current-position
  Mermaid/JSON from the same projection and presentation metadata. Enforce
  read-only/no-event behavior and the documented query, assertion, and rejected-
  mutation exit semantics. **Advances:** R9.

- **P8. Integrate GateReeve skills and SessionStart with the protocol core.**
  Add a plugin adapter used directly by state-affecting skills for preflight,
  authoritative context, evidence submission, and transition recording. Update
  skill/policy contracts and the SessionStart hook to report concise governed
  or legacy status while retaining a safe activation fallback. Ensure the
  self-contained Codex and Claude packages include the core and can govern work
  without a PATH-installed CLI. **Advances:** R1, R6, R8, R10.

- **P9. Evolve the Commander maintainer CLI into optional `gatereeve`.** Rename
  and package the executable, add semantic feature/slice/gate/change and query
  command families over the shared core, preserve existing `plugin` and
  `release` namespaces, and document installation and Node requirements. Do not
  expose generic `advance`, `--force`, scheduling, agent launch, or implicit Git
  mutation. Add parity tests that run equivalent plugin and CLI requests
  against the same fixtures. **Advances:** R9, R10.

- **P10. Complete cross-platform acceptance, migration, and documentation.**
  Exercise governed initialization through sequential slices and a feature-
  final boundary in temporary repositories; cover legacy completion, version
  skew, migration, corruption, stale evidence, pause/resume, changes, waivers,
  merge verification, paths with spaces, native installation, and CLI-absent
  operation. Update user, installation, maintainer, architecture, command, and
  workflow-diagram documentation from the tested contract. **Advances:** R1,
  R2, R3, R4, R5, R6, R7, R8, R9, R10.

## Integration touchpoints

- `plugin-src/shared/resources/`: canonical protocol/model resources, policy,
  commands, scripts, templates, and tests.
- `plugin-src/shared/skills/`: state-aware activity adapters and lifecycle
  instructions.
- `plugin-src/*/hooks/hooks.json` and `session_start.py`: discovery and concise
  status activation.
- `plugin-src/contracts/`: inventories, runtime prerequisites, and platform
  packaging contracts.
- `cli/`: Commander/`qp-cli-core` executable, public command adapters,
  maintainer namespaces, optional distribution, and contract tests.
- Existing Git/GitHub helpers: `workflow_context.py`, `pr_context.py`,
  `boundary_gate.py`, `boundary_packet.py`, `feature_final.py`, and existing
  validators.
- `INSTALL.md`, `USER-GUIDE.md`, `DEVELOPMENT.md`, `README.md`, and the workflow
  site: tested user and maintainer documentation.

## Verification

- Run targeted JavaScript protocol and CLI tests after each core or adapter
  step.
- Run the complete Python helper suite whenever guard integration or existing
  contracts change.
- Run spec, issue, tracker, branch-document, inventory, portability, native-
  manifest, and package-composition validators.
- Run the portable acceptance suite and native disposable-profile installation
  smoke tests without relying on a separately installed `gatereeve` CLI.
- Exercise the optional installed CLI against the same protocol fixtures and
  compare stable JSON results with the plugin adapter.
- Verify source mutation, stale evidence, corrupt journal, rejected passage,
  and failure-injected initialization cases explicitly.
- **Final step:** Run full rubric evaluation and produce the completion report.

## Changes

Append deliberate plan revisions here with their rationale and rubric impact.
