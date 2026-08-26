# Spec - gatereeve-desktop

**Feature:** `gatereeve-desktop`
**Created:** 2026-08-26

## Summary

GateReeve Desktop provides an optional, full-featured, read-only Electron
surface for one explicitly selected local GateReeve feature worktree. It makes
the pinned workflow state machine, present readiness, slices, PR-boundary
gates, artifacts, evidence, history, source enrichment, and attention events
understandable without becoming a workflow engine or requiring the optional
Commander CLI.

The plugin adapter, Commander CLI, and Desktop consume one canonical,
versioned observational contract. Desktop may explain and copy governed
commands, but it never owns, repairs, or advances workflow state.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** **Canonical read contract.** Given the same feature record, pinned
  model, inferred facts, and remote evidence, the plugin adapter, Commander CLI,
  and Desktop expose equivalent versioned workflow projections. The contract
  includes compact snapshots and named lazy reads for complete artifacts,
  events, attempts, explain-diff content, and model graphs. Read operations
  never append workflow events, and Desktop works without the CLI installed.

- **AC2.** **Accurate readiness.** Every proposed action distinguishes whether it
  is available in principle, ready now, or blocked. It exposes authority,
  required inputs, exact copyable command, and named blocking reasons.
  Readiness accounts for required artifacts, inferred facts, freshness, and
  transition guards. For example, design approval is not ready before the
  interview is complete and an approvable design exists. Ordinary uncommitted
  source work remains neutral activity, uncommitted journal or pinned-model
  changes produce a governance warning, and changed governing inputs or
  evidence affect the freshness of the gate that depends on them.

- **AC3.** **Explicit workspace and diagnostic modes.** A user can explicitly
  open one local feature worktree and revisit recent worktrees without a global
  filesystem scan. Desktop correctly presents governed, legacy, missing,
  inconsistent, suspended, and incompatible-model modes without initializing,
  adopting, migrating, repairing, or otherwise mutating them. Local, Git, and
  GitHub source availability are reported independently; unavailable remote
  information makes the view incomplete without invalidating readable local
  state. Persistent data is limited to preferences such as recent and last
  worktrees and window geometry; Desktop does not cache snapshots, artifacts,
  GitHub responses, or governance state.

- **AC4.** **State-machine visualization.** The primary view visibly identifies
  the selected feature and worktree, current feature state, active slice,
  blockers, next action, and supporting evidence. It provides an accessible
  feature-state rail, first-class slice view, selected PR-boundary gate DAG and
  attempts, and subordinate milestones inside their actual states. It uses the
  feature's pinned model and does not fabricate feature-specific states. The
  primary visualization is accessible interactive DOM or SVG; a separate full
  Model view may use Mermaid. Bundled model and protocol versions appear as
  separate provenance, and a newer bundled model offers read-only migration
  impact rather than silently reinterpreting the feature.

- **AC5.** **Artifact and session inspection.** Desktop shows the complete
  applicable artifact inventory with existing, pending, missing, changed or
  stale, optional, and not-applicable statuses linked to their workflow
  context. Markdown, JSON, event records, and trusted `explain-diff.html`
  artifacts are viewable in the application, with explain-diff styling and
  interactivity preserved. External-open and reveal actions are available.
  Checkpoints and handoffs appear separately as non-authoritative Session
  context.

- **AC6.** **History, model, and governed guidance.** Users can inspect detailed
  event, gate-attempt, decision, and passage history and a complete
  pinned-model graph. Friendly labels are paired with discoverable exact
  protocol IDs. Suggested actions explain their meaning, eligibility,
  authority, inputs, and blockers and provide commands for copying, but the
  initial application cannot execute transitions or launch agents. History
  provides event and attempt detail but does not reconstruct arbitrary
  historical versions of the entire application screen.

- **AC7.** **Live observation and notifications.** Local record changes are
  debounced and cause complete canonical recomputation; manual and focus
  refresh also work. GitHub enrichment polls initially every 60 seconds only
  while the app is running and an open PR or pending check requires it,
  including while minimized. Opt-in, deduplicated native notifications cover
  human attention, newly failed or stale gates, inconsistent or suspended
  state, PR merge, and feature completion. Refresh alone never emits a
  notification, and no background service remains after the app exits.

- **AC8.** **Accessible supported desktop experience.** GateReeve Desktop launches
  and operates on macOS and Ubuntu 22.04/24.04 without the optional CLI. At the
  documented minimum window size, worktree selection, state and gate
  inspection, artifact viewing, history and model inspection, command copying,
  and notification preference controls are keyboard-operable, have visible
  focus and screen-reader names, communicate status without color alone, and
  retain usable layouts. Its visual language adapts GateReeve's purple and
  indigo palette, serif/sans/monospace hierarchy, terminology, and identity; it
  does not import PortReeve or Stint product branding.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Shared observational contract (AC1) | Plugin, CLI, and Desktop produce schema-valid equivalent projections and lazy-read results without journal writes or a CLI runtime dependency. | Any surface derives conflicting state, parses human CLI output, mutates the record, or Desktop requires CLI installation. | Contract fixtures, parity tests, journal before/after checks, and a packaged-app test without the CLI. |
| R2 | Readiness semantics (AC2) | Tested actions correctly report available, ready, or blocked with authority, inputs, command, and reasons based on artifacts, facts, freshness, and guards; source, governance, and evidence dirtiness receive the specified distinct treatment. | Eligibility is treated as readiness, blockers are omitted, surfaces disagree, or all uncommitted changes collapse into one health state. | Unit and integration fixtures covering ready, missing-artifact, stale, fact-unavailable, failed-guard, source-dirty, journal-dirty, model-dirty, and changed-evidence cases. |
| R3 | Workspace and diagnostics (AC3) | Explicit selection, preference-only recents, all specified modes, independent source statuses, and graceful remote degradation work without scans, mutations, or observational caches. | Desktop scans globally, changes workflow state, hides a diagnostic mode, persists governed or enriched data, or remote failure destroys valid local projection. | DOM and integration tests, persisted-preference inspection, and filesystem and journal mutation assertions across mode fixtures. |
| R4 | State visualization (AC4) | The accessible rail, slices, milestones, attempts, and gate DAG accurately reflect the pinned model and current record; separate provenance, read-only migration impact, full Model view, and incompatible-model diagnostics behave as specified. | The display fabricates states, uses the bundled model over the pin, hides provenance, mutates for migration, or misrepresents gate dependencies or current position. | Pinned and bundled model fixtures, DOM and SVG assertions, migration-impact tests, and visual evidence across representative states. |
| R5 | Artifact inspection (AC5) | Expected artifact statuses are complete and accurate; required formats render correctly; explain-diff remains interactive; Session context remains non-authoritative. | Expected artifacts disappear, statuses are wrong, a supported viewer fails, explain-diff behavior is lost, or session files affect passage. | Artifact-catalog fixtures, viewer tests, explain-diff runtime smoke, and completeness and freshness assertions. |
| R6 | History and action guidance (AC6) | History and full-model views expose required detail without whole-screen time travel, exact IDs remain discoverable, and commands can be copied but never executed. | History is materially incomplete, arbitrary screen time travel is introduced, exact identities are unavailable, or Desktop can advance workflow state or launch agents. | Timeline and model DOM tests, clipboard tests, IPC allow-list tests, and journal invariance checks. |
| R7 | Refresh and notifications (AC7) | Refresh triggers, conditional 60-second GitHub polling, stopping conditions, notification triggers, and deduplication behave exactly as specified. | Polling runs outside its conditions, local state is interval-polled, attention transitions are missed or duplicated, or work continues after exit. | Fake-clock lifecycle tests, watcher integration tests, notification fakes, and minimized and quit runtime checks. |
| R8 | Supported accessible experience (AC8) | The app operates on both supported platform families; every named interaction passes keyboard, focus, naming, non-color, and minimum-size checks; and the specified GateReeve visual vocabulary is present without peer-product branding. | A supported platform cannot run it, a named interaction is inaccessible, layout is unusable at minimum size, required GateReeve vocabulary is absent, or PortReeve or Stint branding appears. | macOS and Ubuntu Electron smoke results, accessibility and DOM tests, screenshots for principal modes, token and terminology assertions, and manual visual review. |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
