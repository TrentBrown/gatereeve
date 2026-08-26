# Design - gatereeve-desktop

**Status:** approved (gate passed 2026-08-26)

## Problem

GateReeve's governed state is authoritative and inspectable, but its present
surfaces make an operator assemble the whole picture from CLI output, workflow
records, artifacts, Git state, and GitHub state. That is workable for agents
and experienced users, but it obscures where a feature is, why it can or cannot
move, which evidence is current, and what a long-running agent needs from a
human.

The current observer contract also conflates a transition that is legal from a
state in principle with one that is ready now. For example, design approval can
appear eligible before the interview is closed and `design.md` exists. A visual
surface must not merely make that ambiguity easier to see; the shared protocol
must express readiness correctly for every surface.

## Intent

Build **GateReeve Desktop**, an optional Electron application that acts as a
friendly, full-featured, read-only control plane for one selected local
GateReeve feature worktree. It makes the state machine, subordinate milestones,
PR-boundary gates, blockers, actions, artifacts, evidence, and history plain
without becoming a workflow engine or an alternate state owner.

Desktop is a peer of the GateReeve plugin and Commander CLI. All three consume
one versioned read model from the canonical protocol core. A user or agent still
advances work through the existing governed operations; Desktop explains what
is possible, ready, or blocked and supplies exact copyable commands, but does
not execute them in the initial scope.

## Chosen shape

### Canonical observational contract

Add a compact, versioned snapshot contract to the shared GateReeve core before
building its Electron consumer. The plugin adapter, Commander CLI, and Desktop
must use this contract directly rather than independently replaying the event
journal or parsing human-oriented CLI output.

The snapshot includes identity and provenance, the pinned feature model,
feature and slice projection, gate summaries, subordinate milestone summaries,
blockers, next actions, source availability, artifact metadata, and concise
event summaries. Named lazy reads provide artifact bodies, full event or
attempt details, explain-diff content, and model graph data so the initial
snapshot remains responsive for large records.

Each candidate action distinguishes:

- **available in principle:** the pinned state model permits the transition;
- **ready now:** required artifacts, inferred facts, freshness checks, and
  guards currently pass; or
- **blocked:** named prerequisites explain why it cannot proceed.

This meaning is shared across plugin, CLI, and Desktop. Readiness is derived
from current facts and validators, not asserted by the renderer. The selected
feature's `workflow-model.lock.json` controls its states, transitions,
dependencies, and applicable expectations. The bundled model and protocol
version are separate provenance, and an unsupported pinned model produces an
explicit incompatible diagnostic rather than silent reinterpretation.

### Electron boundary

Create an independent `apps/desktop` package following the proven structural
shape of the PortReeve and Stint desktop applications: main process, narrow
preload bridge, renderer, shared runtime schemas, and focused tests. These
projects are architecture references only and introduce no product or runtime
coupling.

The main process imports the packaged canonical protocol core, performs local
Git and optional `gh` enrichment, watches the selected worktree, and exposes
only versioned read operations over IPC. Ordinary Electron isolation remains
enabled. The renderer uses modular vanilla HTML, CSS, and JavaScript with no
React, Vue, Vite, or general bundler; focused Markdown and Mermaid dependencies
are acceptable where they serve the artifact and model views.

Desktop packages the core it needs and does not require the optional Commander
CLI to be installed or discoverable on `PATH`. Contract fixtures, hashes, and
parity tests prevent its staged package from drifting from the plugin and CLI.

### Workspace and refresh lifecycle

The operator explicitly opens one feature worktree at a time. Desktop remembers
only user preferences such as recent and last worktrees, window geometry, and
eventually theme. It performs no home-directory or global repository scan and
stores no snapshot, artifact, GitHub, or governance-state cache.

Opening a worktree produces an immediate local snapshot, followed by Git and
GitHub enrichment whose source status is independently shown as current,
unavailable, or not checked. Remote failure makes the projection incomplete;
it does not invalidate otherwise readable local state.

Filesystem events are debounced and cause a full canonical recomputation.
Manual refresh and refresh on focus are also available. While the application
is running and the selected feature has an open PR or pending checks, only the
GitHub enrichment is polled, initially every 60 seconds, including while the
window is minimized. Polling stops when no remote transition is pending or the
application quits. There is no tray agent, login item, or background service.

### State-first experience

The initial screen answers, in order: which feature and worktree is open; which
feature state and slice are active; what is blocked or stale; what action comes
next and who may perform it; and what evidence supports that answer.

The principal visualization uses accessible interactive DOM and SVG, not a
static diagram:

- a feature-state rail shows the pinned state machine and current position;
- a slice view raises PR slices to first-class visible units without inventing
  feature-specific states;
- a selected `PR_BOUNDARY` view shows its real gate dependency graph and
  attempts, with completed attempts initially collapsed; and
- subordinate milestones such as Interview, Design synthesized, and Human
  approval appear inside the real `DESIGNING` state.

A separate full Model view may use Mermaid and supports copy or export. A
detailed timeline exposes events, gate attempts, decisions, and passages, but
the initial application does not reconstruct arbitrary historical versions of
the entire screen.

Friendly state and action labels lead the interface. Exact protocol IDs remain
available in details, tooltips, copyable commands, JSON, and diagnostics.
Governed, legacy, missing, inconsistent, and suspended worktrees are explicit
diagnostic modes. Desktop never initializes, adopts, migrates, repairs, or
advances one.

### Artifacts, evidence, and session context

The core supplies the complete expected artifact map for the pinned model and
current context. Desktop shows artifacts that exist alongside pending, missing,
changed or stale, optional, and not-applicable expectations, linked to the
state, milestone, gate, event, or decision that gives them meaning.

Markdown, structured JSON, and event records open in the application.
`explain-diff.html` renders directly with its original styling and
interactivity; GateReeve does not sanitize or reconstruct this locally produced
trusted artifact. Open externally and reveal in the filesystem remain
secondary actions.

Checkpoints, checkpoint archives, and handoffs appear in a separate Session
context area. They help with resumability and transfer but are not authoritative
workflow artifacts and never affect completeness, freshness, or passage.

Ordinary uncommitted source work is neutral activity. Uncommitted journal or
pinned-model changes are prominent governance warnings, while changed
governing inputs or evidence attach to the affected gate's freshness.

### Actions and notifications

Each proposed next action explains its meaning, authority, inputs, readiness,
and blockers and offers the exact command to copy. Desktop performs no
transition, starts no agent, and writes no workflow record in the initial
scope.

Opt-in native notifications are included for events that genuinely need
attention: human review or confirmation, a newly failed or stale gate,
inconsistent or suspended state, PR merge, and feature completion.
Notifications deduplicate on the underlying event or state change and are not
emitted merely because a refresh occurred. They operate only while Desktop is
running, including while minimized.

### Delivery, platforms, and quality

Delivery is sequential. First, implement and review the canonical snapshot,
readiness semantics, artifact inventory, named reads, and Commander CLI surface.
Then build the Electron application as a consumer of that accepted contract.
The detailed PR slices belong in the later implementation plan.

Development and runtime support initially cover macOS and Ubuntu 22.04/24.04.
Native Windows support and packaging, signing, installers, automatic updates,
and distribution are deferred.

The visual system extends GateReeve's existing purple/indigo identity,
typography, terminology, diagrams, and Reeve character into a denser desktop
surface. PortReeve and Stint inform structure and interaction quality, not
branding.

Keyboard operation, visible focus, screen-reader naming, semantic status text,
and non-color-only communication are release requirements. Verification
includes direct DOM coverage at the documented minimum window size, Electron
runtime smoke on macOS and Ubuntu, visual evidence for principal protocol modes
and attention states, and manual visual review at desktop PR boundaries.

## Alternatives considered

- Letting the renderer read files, replay the journal, or parse CLI output was
  rejected because it would create a second protocol implementation.
- Depending on the optional CLI was rejected because governance belongs in the
  shared plugin core and Desktop must remain independently installable.
- A global portfolio discovered by scanning the machine was rejected in favor
  of explicit local scope and predictable privacy and performance.
- File links alone were rejected because artifacts are central to understanding
  the workflow; an integrated viewer is part of the product's purpose.
- Mermaid as the primary live view was rejected in favor of accessible,
  interactive DOM and SVG; Mermaid remains useful for the complete model view.
- A React, Vue, or bundled renderer was rejected because the current scope does
  not justify that build and dependency surface.
- Putting all artifact and history content in every snapshot was rejected in
  favor of compact projection plus named lazy reads.
- Manual refresh alone was rejected because local state and pending remote
  checks need timely observation; unrestricted polling was also rejected in
  favor of filesystem events and targeted GitHub refreshes.
- Full-screen historical time travel, workflow mutation controls, agent launch,
  background operation, and packaging now were deferred because none is needed
  to establish a high-quality observational surface.
- Sanitizing or rebuilding explain-diff HTML was rejected because it would
  discard the styling and interactivity of a trusted local GateReeve artifact.

## Constraints

- Desktop is read-only and never becomes an authority or state owner.
- The selected feature's pinned model is authoritative for its projection.
- Plugin, Commander CLI, and Desktop share one versioned core contract and
  readiness meaning.
- The first persona is a local developer or agent operator, with no account,
  cloud service, collaboration layer, or preference synchronization.
- Observation is explicitly scoped to one selected worktree, with no global
  filesystem scan.
- The optional CLI is not a Desktop runtime dependency.
- Direct explain-diff rendering assumes locally produced artifacts are trusted;
  standard Electron process isolation still applies.
- Initial native runtime support is macOS and Ubuntu 22.04/24.04, not Windows.
- Distribution engineering is outside the initial feature.

## Open risks

- Artifact expectations must be versioned with or derived faithfully from
  pinned models without turning display policy into fabricated workflow state.
- Readiness needs precise artifact, fact, freshness, and guard contracts so all
  surfaces agree, including when evidence is partial or invalid.
- GitHub authentication, rate limits, network failure, and transitional check
  states must remain useful without overstating certainty.
- Watcher bursts, atomic rewrites, worktree moves, and remote refreshes require
  coalescing so snapshots and notifications are stable rather than noisy.
- Direct interactive HTML embedding must retain behavior and isolation
  consistently across supported Electron platforms.
- Large journals and artifact sets may expose performance limits in projection,
  lazy reads, timeline rendering, and search.
- Required macOS runtime and visual evidence depends on suitable verification
  infrastructure being available during delivery.
- Sequential worktrees must resolve local `.agentic-workflow.json` configuration
  predictably without broadening Desktop into workspace management.

## Changes

None - initial draft synthesized from the completed Grill Me interview.
