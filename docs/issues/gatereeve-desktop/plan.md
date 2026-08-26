# Plan - gatereeve-desktop

**Feature:** `gatereeve-desktop`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-26

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Extend the existing canonical protocol rather than creating a Desktop-specific
interpretation. The source of truth remains
`plugin-src/shared/resources/protocol`; the optional Commander CLI and the new
Electron package consume exact staged copies with manifest and fixture parity.
The first delivery slice therefore establishes the observational contract,
readiness semantics, artifact catalog, and named reads before any renderer is
built against them.

Build `apps/desktop` as an independent Electron package with main, preload,
renderer, shared-schema, and test boundaries. The main process owns filesystem,
Git, `gh`, preference, watcher, polling, and notification integrations. A
narrow read-only preload API exposes validated snapshot and named-read results.
The modular vanilla renderer owns presentation only and cannot invoke protocol
mutations or reconstruct state from raw files.

Deliver the feature through four intended PR slices:

1. Canonical observational protocol and Commander CLI surface.
2. Electron shell, explicit-worktree lifecycle, and local/remote observation.
3. State-first visualization plus artifact, history, and model inspection.
4. Notifications, accessibility, supported-platform hardening, and final
   feature verification.

Each slice begins only after the previous PR merges into `main`; later delivery
branches use the stable `gatereeve-desktop` feature record. Packaging, signing,
installers, automatic updates, native Windows support, workflow mutations,
agent launch, background operation, global workspace discovery, and cloud
collaboration remain outside this plan.

## Steps

- **P1. Define the versioned read-model contract.** Add runtime-validated
  schemas and fixtures for the compact snapshot and named lazy reads, including
  identity, pinned and bundled provenance, feature/slice/boundary projection,
  source statuses, blockers, actions, milestone and artifact summaries, event
  summaries, and detailed artifact/event/attempt/explain/model reads. Keep the
  contract backward-aware and deterministic for identical inputs.
  **Advances:** R1, R4, R5, R6.

- **P2. Implement canonical readiness and observational providers.** Evolve the
  shared observer so actions distinguish available-in-principle, ready-now,
  and blocked states from current artifacts, inferred facts, freshness, and
  guards. Add the pinned-model artifact expectation catalog, subordinate
  milestones, dirtiness distinctions, diagnostic modes, migration-impact
  projection, and lazy readers. Prove every read leaves the event journal and
  governed files unchanged.
  **Advances:** R1, R2, R3, R4, R5, R6.

- **P3. Integrate and verify plugin and Commander surfaces.** Expose the new
  contract through the native plugin adapter and Commander.js commands, extend
  exact staging manifests, and add cross-surface fixtures, schema tests,
  journal-invariance tests, and installed-package tests. Preserve current
  protocol commands while correcting their readiness presentation.
  **Advances:** R1, R2, R3, R4, R5, R6.

- **P4. Establish the read-only Electron boundary.** Create `apps/desktop`
  with independent package metadata and modular main/preload/renderer/shared
  structure. Stage the canonical core directly into the app, validate all IPC
  inputs and outputs, expose only named read and benign OS actions, and test
  that neither workflow mutations nor agent/CLI execution are reachable.
  **Advances:** R1, R3, R6, R8.

- **P5. Build workspace and observation lifecycle.** Implement explicit
  worktree selection, recent-worktree and window preferences, immediate local
  snapshots, independent Git/GitHub enrichment statuses, debounced filesystem
  recomputation, focus/manual refresh, and conditional 60-second GitHub polling
  while an open PR or pending check exists. Test remote degradation, minimized
  operation, stopping conditions, absence of observational caches, and absence
  of global scans.
  **Advances:** R3, R7.

- **P6. Build the state-first control surface.** Implement the GateReeve-themed
  overview, feature-state rail, subordinate milestones, slice navigation,
  PR-boundary attempt and gate DAG, blockers, source/governance warnings,
  evidence links, action explanations, exact-ID disclosure, and command copy.
  Cover governed and all diagnostic modes with accessible DOM/SVG tests and
  representative visual fixtures.
  **Advances:** R2, R3, R4, R6, R8.

- **P7. Build artifact, history, model, and Session views.** Implement the
  complete artifact inventory and lazy viewers for Markdown, structured JSON,
  events, and trusted interactive explain-diff HTML; external-open and reveal
  actions; non-authoritative checkpoint/handoff context; detailed event and
  attempt history; and the separate full pinned-model graph with Mermaid
  copy/export where appropriate.
  **Advances:** R4, R5, R6, R8.

- **P8. Add notifications and harden the desktop experience.** Implement
  opt-in, transition-deduplicated native notifications and complete keyboard,
  focus, screen-reader, non-color, and minimum-window behavior. Add fake-clock
  lifecycle coverage, notification fakes, direct DOM accessibility tests,
  visual evidence for principal and attention states, and Electron runtime
  smoke on Ubuntu and macOS.
  **Advances:** R7, R8.

- **P9. Verify the assembled feature on the final real delivery slice.** Run
  full protocol, CLI, Electron, accessibility, visual, and supported-platform
  verification; evaluate every acceptance criterion and R1-R8 from evidence;
  run the independent judge and PR gates; and produce the completion report.
  This is coordination and final verification, not a completion-only PR.
  **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.

## Verification

- **Protocol:** Contract/schema fixtures, plugin/CLI/Desktop parity, trusted
  guard/readiness cases, artifact catalog cases, model compatibility, and
  journal and filesystem invariance.
- **Desktop integration:** IPC allow-list and schema tests, workspace-mode
  fixtures, Git/GitHub degradation, watcher coalescing, conditional polling,
  viewer behavior, clipboard/open/reveal, and notification lifecycle.
- **Renderer:** Direct DOM/SVG assertions for principal views and diagnostic
  modes, keyboard/focus/screen-reader semantics, minimum-size layout, and
  screenshots for normal, blocked, stale, inconsistent, and attention states.
- **Runtime:** Electron smoke on Ubuntu 22.04/24.04 and macOS, including a run
  without the optional CLI and direct interactive explain-diff rendering.
- **Final step:** Run full rubric evaluation and produce the completion report
  from evidence on the fourth and final real delivery slice.
