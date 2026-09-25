# Plan - tb-whiteboard-test-gate

**Feature:** `tb-whiteboard-test-gate`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-09-24

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Build the feature from the protocol outward so the GateReeve core remains the
only passage authority. First establish multi-plugin packaging and a generic,
versioned agent-workflow contract. Then implement the headless scheduler,
evidence receipts, and host adapters before adding Whiteboard and upgrading
Judge. Desktop will consume the same runtime and artifacts rather than creating
a parallel execution path. Every layer receives contract and regression tests
before the next layer relies on it.

Whiteboard Test and the Judge correction are separate workstreams delivered in
one PR. They share only the generic agent-workflow primitive and provider
adapters; their prompts, schemas, artifacts, and outcome semantics remain
independent.

## Steps

- **P1. Generalize plugin composition for Whiteboard Test.** Extend the
  canonical plugin-source, inventory, marketplace catalog, candidate integrity,
  smoke-test, and release-composition contracts from one plugin package to
  multiple packages. Add separate Codex and Claude Code Whiteboard Test package
  identities without changing the existing Agentic Development Workflow plugin
  identity or rewriting published release history. **Advances:** R1, R7.

- **P2. Define the versioned agent-workflow protocol contract.** Extend module
  definitions with a provider-neutral staged-agent run kind, capability profile,
  bounded input/output declarations, stage dependencies, isolation policy,
  automatic-run semantics, and receipt schema. Extend model resolution,
  digests, feature locks, snapshots, artifact catalogs, fingerprints, and
  compatibility validation. Preserve rejection of unknown or downgraded
  contracts and stage the canonical protocol into CLI and Desktop builds.
  **Advances:** R1, R2, R6, R7.

- **P3. Implement the authoritative headless agent-workflow runtime.** Add
  eligibility-driven scheduling, immutable pinned input packets, read-only
  repository views, disposable scratch storage, network-denied defaults, typed
  output capture, receipt creation, digest binding, crash recovery, bounded
  retry handling, artifact validation, and final protocol-core passage checks.
  Ensure execution failures remain UNSET/Unavailable and cannot masquerade as
  gate FAIL or PASS. **Advances:** R2, R3, R5, R6, R7.

- **P4. Implement and test Codex and Claude Code adapters.** Map the common
  capability profile to approved local provider configurations; create fresh
  Codex subagent and Claude Code custom-subagent contexts with zero inherited
  implementation turns; expose equivalent run status and receipts; and fail
  closed when isolation, model capability, read-only access, or typed output
  cannot be verified. Add adapter conformance fixtures that detect forbidden
  inherited-context sentinels and silent model downgrades. **Advances:** R3, R7.

- **P5. Build the Whiteboard Test plugin and artifact validator.** Add the
  `whiteboard-test/defense` module, Challenger and Defender/Publisher role
  resources, slice and feature-final input builders, immutable challenge-set
  contract, manifest schema, finding taxonomy, visual obligations, substantive
  attestation, and deterministic validator. Produce digest-bound
  `whiteboard-defense.json` and self-contained `whiteboard-defense.html`; encode
  Verification as a prerequisite and Judge as conditional ordering only.
  **Advances:** R1, R2, R3, R4, R5, R6.

- **P6. Integrate governed agent workflows and artifacts into Desktop.** Expose
  the same headless run status, availability, stage progress, failures, and
  evidence through Desktop IPC and presentation. Open Whiteboard HTML from its
  validated manifest in a sandbox without network, filesystem, parent-window,
  navigation, or external-resource authority. Add browser, interaction,
  accessibility, viewport, and error-observation tests; do not let Desktop-only
  state grant passage. **Advances:** R4, R6, R7.

- **P7. Upgrade Judge to the isolated runtime.** Version the Judge module,
  remove the same-context fallback, run one fresh read-only Judge stage per
  attempt, retain blocking verdict semantics without remediation authority, and
  produce `judge.json` binding the structured result, receipt, and `judge.md`.
  Add migration and historical model-lock fixtures proving old Judge evidence
  remains readable and uninterpreted by the new version. **Advances:** R7, R8.

- **P8. Exercise representative boundary and failure scenarios.** Add ordinary
  slice, feature-final, Judge-enabled, Judge-disabled, waived, work-deficiency,
  artifact-deficiency, stale-input, malformed-output, provider-unavailable,
  sandbox-escape, adapter-failure, and remediation/rerun fixtures. Verify exact
  AC-to-rubric behavior across protocol, CLI, Desktop, both adapters, and both
  evidence bundles. **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.

- **P9. Document, dogfood, and complete the single PR boundary.** Update module,
  plugin installation, provider readiness, artifact, migration, CLI, and Desktop
  documentation. Run focused and broad test suites, build and launch Desktop,
  install both local plugin variants, generate representative Whiteboard and
  Judge artifacts, complete rubric evaluation, and run the governed PR-boundary
  gates against the final pinned branch. **Advances:** R1, R2, R3, R4, R5, R6,
  R7, R8.

## Verification

- Run protocol, module-contract, runtime, snapshot, boundary, CLI, plugin
  packaging, candidate-integrity, and portability suites after P1-P3.
- Run provider adapter conformance and isolation-sentinel suites after P4.
- Render and exercise representative Whiteboard artifacts in supported browser
  sizes, with accessibility and sandbox checks, after P5-P6.
- Run Judge migration, historical evidence, failure, and fresh-rerun scenarios
  after P7.
- Run all CLI and Desktop test suites, portable acceptance, renderer build,
  Desktop runtime smoke, local plugin marketplace composition/install smoke,
  and final rubric evaluation after P8-P9.
- **Final step:** Run full rubric evaluation and produce the completion report.
