# Interview - gatereeve-desktop

**Feature start:** 2026-08-26
**Status:** complete

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

## D1 - Make GateReeve state the application domain

**Question:** Is the proposed desktop application intended to inspect
PortReeve, or is PortReeve only an example of an existing Electron product?

**Answer:** This is a GateReeve application for examining GateReeve state.
PortReeve Desktop is only an implementation-structure example and has no
product or runtime connection to it.

**Decision:** Build **GateReeve Desktop** as a visual surface over governed
GateReeve development work. Do not introduce PortReeve concepts, services,
dependencies, or integration behavior.

## D2 - Begin with a complete observational application

**Question:** What authority and information depth should the first desktop
application have?

**Answer:** Begin read-only, but make the observational experience
full-featured. Users should be able to understand the state machine plainly
and follow links to the development-workflow artifacts produced by each gate
and stage.

**Decision:** The first GateReeve Desktop release observes but does not advance
workflow state. Read-only means no protocol mutations; it does not mean a
throwaway or skeletal viewer. State, hierarchy, blockers, history, freshness,
and workflow artifacts are first-class product content.

## D3 - Reuse established structure without product coupling

**Question:** How should the existing PortReeve and Stint Electron
applications influence GateReeve Desktop?

**Answer:** Use them as guides for Electron application structure. There is no
other connection to PortReeve.

**Decision:** Reuse the proven architectural shape—isolated desktop package,
Electron main/preload/renderer separation, narrow IPC, a coordinator and
validated read model, local application content, and focused desktop tests—by
adapting patterns rather than importing either product as a runtime
dependency.

## D4 - Render explain-diff HTML directly

**Question:** Does generated `explain-diff.html` require sanitization,
translation, or other artifact-specific protection before display?

**Answer:** No. GateReeve Desktop can use the generated HTML as-is.

**Decision:** Preserve the explain-diff artifact's original HTML, styling, and
interactive behavior in its desktop view. Ordinary Electron application
isolation remains, but the product will not sanitize or reconstruct this
trusted local workflow artifact.

## D5 - Keep all control surfaces over one canonical protocol core

**Question:** Should Electron reconstruct state from files or human CLI output,
or consume a reusable read model from the same authority as the plugin and
Commander CLI?

**Answer:** Use another surface over the underlying behavior, following the
successful pattern used for other project CLIs and applications.

**Decision:** Add a versioned read-only snapshot operation to GateReeve's
canonical protocol core. The plugin adapter, optional Commander CLI, and
Electron application remain peer surfaces; the renderer does not replay the
journal or join command-specific text itself.

## D6 - Establish the read contract before its Electron consumer

**Question:** Should the snapshot contract and Electron application be
delivered as one moving implementation, or as sequentially reviewed slices?

**Answer:** Proceed with the recommended structure based on the successful
Stint and PortReeve precedents.

**Decision:** Deliver and review the reusable snapshot and artifact-inventory
contract before building the Electron consumer against it. Defer packaging and
distribution choices until the read model and development application have
proved their shape.

## D7 - Inspect one selected feature worktree at a time

**Question:** Should GateReeve Desktop inspect one selected feature/worktree at
a time, or begin as a global portfolio that discovers every GateReeve feature
across many worktrees?

**Answer:** Begin with one selected feature/worktree at a time, with a
recent-workspaces switcher.

**Decision:** The first application resolves one authoritative GateReeve
feature from an explicitly selected worktree or workspace directory. It may
remember recent selections as application preferences for quick switching, but
it does not scan the user's home directory, build a global work inventory, or
combine several feature records into one projection.

## D8 - Make workflow artifacts first-class in-app content

**Question:** Should artifact selection primarily hand off to external tools,
or should GateReeve Desktop provide a complete in-app reading experience?

**Answer:** Provide the recommended first-class in-app artifact viewer.

**Decision:** Render Markdown artifacts inside the application, render
`explain-diff.html` directly with its original interactions intact, and show
JSON and event data through readable structured views. Provide secondary
actions to open an artifact externally or reveal it in Finder. These local
navigation conveniences do not advance or otherwise mutate GateReeve workflow
state.

## D9 - Organize the application around current workflow position

**Question:** Should the opening experience be organized primarily around the
artifact collection or around the workflow's current position?

**Answer:** Make it state-first.

**Decision:** The initial screen answers which feature and worktree are open,
the feature state, active slice or sub-cycle, blockers, eligible next actions
and their authority, and the evidence supporting that position. Artifacts are
reached contextually through the selected stage, slice, gate, change, or
history event rather than serving as the application's primary organizing
structure.

## D10 - Treat every feature-record mode as an observable product state

**Question:** Should the desktop refuse directories that are not healthy
governed features, or explain missing, legacy, and inconsistent records as
first-class states?

**Answer:** Make all four protocol modes first-class diagnostic screens while
keeping the application read-only.

**Decision:** A governed feature receives the complete state experience. A
legacy feature explains its grandfathered status and presents any available
workflow artifacts. A missing feature explains that governance has not been
initialized and shows the exact CLI command that could do so. An inconsistent
feature blocks ordinary interpretation, explains the model-lock or journal
mismatch, and provides recovery guidance. The first desktop does not
initialize, adopt, migrate, repair, or otherwise mutate any feature.

## D11 - Reproject live as governed work changes

**Question:** Should the first desktop update only on demand, or behave as a
live monitor while users and autonomous agents advance the selected feature?

**Answer:** Make it a live monitor using the recommended deterministic refresh
behavior.

**Decision:** Watch only the selected feature record and known workflow
artifact directories. Debounce filesystem signals and recompute the complete
canonical snapshot after a change; never incrementally infer state from
watcher ordering. Retain manual Refresh and refresh when the application
regains focus. Do not add periodic polling.

## D12 - Combine immediate local state with explicit Git and GitHub evidence

**Question:** Should the first desktop remain entirely file-local, or enrich
the local GateReeve projection with current Git and GitHub observations?

**Answer:** Use the recommended two-stage observation.

**Decision:** Render the authoritative local journal, pinned model, artifact
inventory, and immediate worktree facts first. Then enrich the same domain
snapshot with current Git branch, HEAD, and cleanliness plus GitHub PR, review,
check, and merge facts when available. Every source reports current,
unavailable, or not checked with observation timing. GitHub or authentication
failure yields a useful incomplete observation rather than erasing or failing
the valid local projection.

## D13 - Visualize feature, slice, and boundary as nested levels

**Question:** How much of the state machine should the default visualization
expose at once?

**Answer:** Use the recommended three-level hierarchy rather than one giant
diagram.

**Decision:** Keep a persistent feature-lifecycle rail showing completed,
current, and future feature states. Show all slices compactly while expanding
the active or selected slice. Within that slice, show the selected boundary
attempt as its actual gate dependency DAG with freshness, outcomes, blockers,
and evidence. Collapse completed attempts and full history by default. Provide
a separate Model view for the complete abstract state machine.

## D14 - Explain history without arbitrary whole-application time travel

**Question:** Should selecting any historical event reconstruct the complete
application at that journal sequence, or is a detailed event and attempt
timeline sufficient initially?

**Answer:** Begin with the detailed timeline and defer arbitrary whole-screen
replay.

**Decision:** Expose every event's actor, time, payload, model hash, related
objects, state change, and evidence links. Preserve historical boundary
attempts with their gate outcomes and artifacts while the primary
visualization continues to show the current projection. Do not require the
first snapshot or renderer model to reconstruct every screen at every event
sequence.

## D15 - Show the complete expected artifact map

**Question:** Should the artifact experience list only files that exist, or
also expose artifacts the workflow expects but has not produced?

**Answer:** Show the complete expected map with explicit artifact states.

**Decision:** Derive the expected stage and gate artifact inventory from the
pinned workflow model and workflow contract. Mark expected but absent artifacts
pending, recorded evidence with a missing file missing, and recorded evidence
whose digest no longer matches changed or stale. Label optional and
not-applicable artifacts explicitly instead of silently omitting them. Existing
artifacts remain linked to the stage, gate, attempt, or event that gives them
meaning.

## D16 - Make next actions explanatory and copyable, never executable

**Question:** Should a read-only desktop merely describe the current state, or
also present exact eligible CLI commands that help the user act outside the
application?

**Answer:** Present the recommended complete next-action guidance.

**Decision:** For every eligible or blocked next action, show its plain-language
meaning, required authority, blocking reasons, required inputs, and exact
`gatereeve` command with a Copy action. The first desktop does not execute the
command, open an agent session, or otherwise turn that guidance into a
workflow mutation.

## D17 - Match GateReeve's macOS and Ubuntu platform boundary

**Question:** Should the first development application inherit a macOS-only
desktop assumption from the reference projects, or preserve GateReeve's
existing supported operating systems?

**Answer:** Support macOS and Ubuntu 22.04/24.04 from the first development
release, with native Windows unsupported initially.

**Decision:** Develop and verify GateReeve Desktop on macOS and Ubuntu and
avoid platform-specific assumptions that would prevent either runtime.
Windows remains supported only indirectly through the existing Ubuntu-on-WSL
boundary. Packaging, signing, installers, and automatic updating remain
outside the first snapshot and desktop delivery slices.

## D18 - Begin with a modular vanilla renderer

**Question:** Should GateReeve Desktop follow the reference applications'
modular HTML, CSS, and JavaScript renderer pattern, or introduce a framework
and bundler immediately?

**Answer:** Begin with the recommended modular vanilla renderer.

**Decision:** Separate the renderer's domain model, application state,
workflow visualization, artifact views, and interactions without React, Vue,
Vite, or another framework or bundler. Use focused bundled libraries where
they add specific value, including Markdown or Mermaid rendering, and test the
DOM and accessibility directly. Reconsider a framework only if later
mutation-heavy screens demonstrate a real state-management need.

## D19 - Build an interactive working visualization

**Question:** Should the primary state experience render GateReeve's existing
Mermaid output, or use purpose-built interactive components?

**Answer:** Use the recommended interactive view and retain Mermaid for the
separate complete-model surface.

**Decision:** Render the feature rail, slice navigator, and boundary gate DAG
as keyboard-accessible DOM and SVG components driven by the validated
snapshot. Selecting nodes opens explanations and evidence. Use existing
Mermaid output in the full Model view and for copy or export, not as the
primary application's navigation mechanism.

## D20 - Make Desktop a peer surface without a CLI installation dependency

**Question:** Should GateReeve Desktop require an optional `gatereeve`
executable on `PATH`, or package and invoke the canonical protocol core
directly?

**Answer:** Do not require CLI installation.

**Decision:** Package the exact canonical GateReeve protocol resources with
the desktop and call them from Electron's main process. The plugin adapter,
Commander CLI, and desktop remain sibling surfaces with matching protocol
hashes and parity tests. The CLI exposes the same snapshot contract for
terminal use, but installing it is not a prerequisite for the desktop.

## D21 - Keep live snapshots compact and load details on demand

**Question:** Should each live snapshot carry the complete journal and every
artifact's contents, or provide an index with selected details loaded lazily?

**Answer:** Use the recommended compact snapshot and named detail operations.

**Decision:** Include the current projection, blockers, next actions, source
status, slice and boundary summaries, artifact metadata and integrity state,
and event summaries needed for the timeline. Load a selected artifact,
complete event payload, explanation, or model graph through separate named
read-only operations. Do not retransmit large Markdown and HTML contents on
every live refresh.

## D22 - Persist preferences, not workflow truth

**Question:** What should GateReeve Desktop remember between application
launches?

**Answer:** Persist only the recommended application preferences.

**Decision:** Remember recent worktree directories, the last successfully
opened worktree, window size and position, and later display preferences. On
launch, reopen the last worktree if it still validates; otherwise show the
workspace picker and recent list. Do not persist workflow snapshots, artifact
contents, GitHub observations, or reconstructed state.

## D23 - Include attention notifications in the initial desktop scope

**Question:** Should the read-only desktop notify users when autonomous work
reaches a meaningful attention boundary, or defer notifications?

**Answer:** Include notifications in the initial desktop scope.

**Decision:** Offer opt-in native notifications when human confirmation or
review becomes required, a gate newly fails or becomes stale, a feature becomes
inconsistent or suspended, a PR merges, or the feature completes. Deduplicate
notifications by journal event or observed state change and never notify merely
because a refresh occurred. Notifications remain observational and perform no
workflow mutation.

## D24 - Keep monitoring within the visible application lifecycle

**Question:** Must notifications continue after GateReeve Desktop quits,
requiring a background agent, login item, or tray process?

**Answer:** No. Monitoring may stop when the application quits.

**Decision:** Watch and notify while GateReeve Desktop is running, including
while its window is minimized. Quitting stops observation and leaves no
background service or startup item. Defer always-on monitoring until its
installation, lifecycle, resource, and update obligations are designed
separately.

## D25 - Pair friendly language with exact protocol identifiers

**Question:** Should the interface replace GateReeve's formal state and gate
names with friendly product language, or preserve only the protocol
vocabulary?

**Answer:** Show both.

**Decision:** Use readable labels and plain-language explanations in the
primary interface while preserving exact state, transition, gate, attempt,
event, and model identifiers in details, diagnostics, JSON, copied commands,
and tooltips. Do not create a friendly vocabulary that becomes ambiguous when
users move between Desktop, the CLI, and agent conversations.

## D26 - Show checkpoints and handoffs as non-authoritative context

**Question:** Should local `CHECKPOINT.md`, archived checkpoints, and handoff
documents appear in GateReeve Desktop even though they are not protocol state
or gate evidence?

**Answer:** Include them in a separate Session context area.

**Decision:** Make the current checkpoint easy to open and expose checkpoint
archives and handoffs through subordinate lists. Label them as resumability or
transfer context rather than authoritative workflow state. Their absence never
blocks passage, and they do not participate in artifact completeness,
freshness, or evidence-integrity calculations.

## D27 - Distinguish normal source activity from governance dirtiness

**Question:** Should any dirty Git worktree appear unhealthy, or should the
desktop distinguish the kind of uncommitted change?

**Answer:** Distinguish the three recommended cases.

**Decision:** Treat ordinary source changes during implementation as neutral
activity. Present uncommitted journal or pinned-model changes as a prominent
governance warning because other commits and worktrees cannot observe them
reliably. Attach changed governing inputs or evidence to the affected gate's
freshness rather than reducing all worktree dirtiness to one red status.

## D28 - Poll only pending remote evidence while the application runs

**Question:** How can remote merge and CI notifications be timely when local
observation is event-driven and D11 originally prohibited all polling?

**Answer:** Adopt targeted remote polling.

**Decision:** Refine D11: local GateReeve records and artifacts remain
filesystem-driven with no interval polling. While the application is running
and the selected feature has an open pull request or pending checks, refresh
only GitHub enrichment on a modest interval, initially 60 seconds. Continue
that remote refresh while minimized so notifications remain useful, and stop
it when no remote transition is pending or the application quits.

## D29 - Visualize every feature through its pinned model

**Question:** When the desktop bundles a newer default workflow model than an
in-flight feature, which model should control the feature visualization?

**Answer:** The feature's pinned model must control.

**Decision:** Render states, transitions, gate dependencies, and applicable
expectations from `workflow-model.lock.json`. Show the desktop's bundled model
and protocol version separately as provenance and offer read-only migration
impact when a newer model is available. Never silently reinterpret an
in-flight feature with the newer default; report incompatibility when the
desktop core cannot safely project the pinned record.

## D30 - Design first for the local developer or agent operator

**Question:** Is the first desktop primarily for an operator running GateReeve
and agents on the same machine as the selected worktree, or for a remote team
expecting a shared dashboard?

**Answer:** Use the recommended local-operator boundary.

**Decision:** Build for the local developer or operator observing work on the
machine where GateReeve Desktop runs. Add no account system, cloud service,
shared workspace registry, collaborative annotations, or synchronization of
private recent-workspace preferences. A reviewer may still open a checkout and
inspect its tracked record using the same local application.

## D31 - Distinguish transition availability from present readiness

**Question:** Should Desktop repeat the protocol's structurally available next
transition even when required workflow artifacts and facts are absent, or
should all surfaces distinguish legal, ready, and blocked actions?

**Answer:** Improve the shared contract and make the distinction explicit.

**Decision:** The canonical snapshot and observer contract reports whether a
transition is available from the current state in principle, ready now with
all required artifacts, inferred facts, freshness, and guards satisfied, or
blocked by named prerequisites. The plugin, Commander CLI, and Desktop share
this meaning. In particular, a feature in `DESIGNING` does not present design
approval as ready before the interview has concluded and a design artifact is
available for approval.

## D32 - Show stage milestones without inventing protocol states

**Question:** Should expected work inside a feature state appear as subordinate
milestones, or be promoted into additional state-machine states?

**Answer:** Show subordinate milestones while preserving the pinned model.

**Decision:** Present activities such as Interview, Design synthesized, and
Human approval inside `DESIGNING`, and analogous drafting, validation, and
authorization milestones inside their real feature states. Keep boundary gates
inside the `PR_BOUNDARY` DAG. Derive milestone status from artifacts, events,
and validation facts; do not append fabricated transitions or create
feature-specific state enums.

## D33 - Require production-quality accessibility and visual evidence

**Question:** Can the development-only application defer visual and
accessibility verification, or should those qualities be mandatory before
distribution work begins?

**Answer:** Make the recommended verification mandatory in the initial scope.

**Decision:** Require keyboard access, visible focus, screen-reader names,
semantic state descriptions, and status communication that never relies on
color alone. Add automated DOM coverage at the documented minimum window size,
Electron runtime smoke on macOS and Ubuntu, visual evidence for principal
protocol modes and attention states, and manual visual review at each desktop
PR boundary.

## D34 - Extend GateReeve's existing visual identity into Desktop

**Question:** Should GateReeve Desktop derive its visual language from the
existing GateReeve website and documentation, or establish an unrelated
desktop identity?

**Answer:** Adapt GateReeve's existing identity.

**Decision:** Derive desktop color, typography, terminology, diagrams, and
Reeve identity from GateReeve's current public presentation while adapting it
to a denser desktop control surface. Use PortReeve and Stint as structural and
interaction-quality references, not as sources of GateReeve Desktop branding.

## Interview close - 2026-08-26

The interview is complete. The product boundary is solid: GateReeve Desktop is
an optional, read-only, local visual surface over the same canonical workflow
protocol used by the plugin and Commander CLI. It observes one explicitly
selected feature worktree, explains state, readiness, evidence, artifacts,
history, and remote enrichment, and never owns or advances workflow state.

The first release deliberately defers mutation controls, a global workspace
portfolio, accounts or cloud synchronization, background or login-item
operation, arbitrary whole-screen time travel, native Windows support, and
packaging, signing, installers, updates, and distribution. It also avoids a UI
framework and does not make the optional CLI a runtime dependency.

The implementation must resolve several risks without changing those product
decisions: define readiness precisely enough that every surface agrees; version
artifact expectations against pinned workflow models; coalesce filesystem and
targeted GitHub refreshes safely; represent partial or unavailable GitHub data;
render trusted interactive explain-diff HTML consistently on macOS and Ubuntu;
keep large records responsive through named lazy reads; and provide the
required cross-platform, accessibility, and visual evidence before desktop PR
boundaries pass.
