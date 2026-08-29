# Interview - tb-gatereeve-desktop-workflow-experience

**Feature start:** 2026-08-29
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

## Initial proposal under interview

The GateReeve Desktop overview should move from a mostly linear presentation
of workflow objects to progressive hierarchical disclosure:

- Keep the feature-state rail card substantially intact, but make feature
  states selectable.
- Selecting Designing, Specifying, or Planning should render `design.md`,
  `spec.md`, or `plan.md`, respectively, in a right-side panel.
- Selecting Delivering Slices should reveal the PR slices card below the
  feature-state rail.
- Selecting a PR slice should reveal a PR-boundary card for that slice below
  the slices card.
- Selecting an attempt or gate-dependency item in the PR-boundary card should
  render its corresponding artifact in the right-side panel.
- Additional refactorings and enhancements will be introduced and clarified
  before this feature's design is synthesized.

## Codebase facts established before questioning

- The overview rail is currently presentational rather than interactive.
- PR slices, blockers and warnings, boundary attempts, and next actions are
  rendered concurrently on the overview.
- A slice can currently choose an associated attempt and scroll to the
  always-visible boundary card; there is no selected-slice hierarchy.
- The existing Artifacts page already reads named canonical artifacts through
  the trusted read-only detail boundary and safely renders Markdown. The new
  overview panel can potentially reuse that behavior without expanding file
  access.

## Open questions

- Responsive behavior when the window cannot comfortably fit the left sidebar,
  main content, and docked right panel simultaneously.
- Whether later sub-features should move History, Model, or Session object
  details into the application-level panel.
- Exact panel defaults, animation timing, constrained-width breakpoints,
  keyboard behavior, and other visual-validation details.

## Settled decisions

### D1 - Selection is observational and independent of workflow state

**Question:** Should feature-state selection be purely observational and
independent of the governed current state, including allowing completed,
current, and pending states to be selected without causing a workflow
transition?

**Answer:** Yes. The UI must distinguish selection, which changes the
hierarchical view, from the current active state in the workflow. Both need a
clear simultaneous representation.

**Decision:** Every presented feature state may be selected for inspection.
Selection changes only the overview's hierarchical disclosure and never changes
governance state. When the selected state's artifact is not yet available, the
right-side panel presents an explicit unavailable state. Governed-current state
and user-selected state are separate UI concepts and must remain visible and
distinguishable at the same time.

### D2 - Governed current state and UI selection use separate visual semantics

**Question:** Should governed-current state remain an explicit status property
while selection receives a separate interaction treatment, with both indicators
coexisting when the current state is also selected?

**Answer:** Use that distinction as the starting approach.

**Decision:** A rail item that is the governed current state carries an
explicit `Current` text label, retains a workflow-status marker, and exposes
`aria-current="step"`. A selected rail item uses a visually distinct selection
treatment, exposes `aria-pressed="true"`, and is named in the inspection-panel
context. If one item is both current and selected, both meanings remain visible.
Neither meaning may depend on color alone. The exact styling may be refined
during visual implementation and review without changing this semantic
contract.

### D3 - Artifacts open in a docked, tabbed application panel

**Question:** Should artifact content appear in a non-modal companion area that
preserves the hierarchy beside it rather than covering the main content?

**Answer:** Yes, with a more specific reference model: it should appear and
behave like the right-side panels in the Codex, Claude, T3 Code, and Visual
Studio Code desktop applications. The panel slides in and out, has a hide/show
button in the upper-right of the main-window header, may contain any number of
artifact tabs opened from the main window, and lets the user close tabs at
will.

**Decision:** GateReeve will have an application-level docked right panel, not
an Overview-local split view or modal overlay. The masthead owns a persistent
visibility toggle in its upper-right action area. Opening inspectable artifacts
creates or activates tabs in this panel. Multiple artifact tabs may remain open
simultaneously, each tab is independently closable, and the panel can slide
closed or open without changing workflow state or main-view selection. The
earlier proposal to move the panel below the hierarchy at narrow widths is not
adopted; responsive behavior remains to be decided.

### D4 - Canonical artifact identity controls tab reuse and panel visibility

**Question:** Should artifact identity rather than each activation control tab
creation, with artifact activation revealing the panel, hiding preserving its
tabs, and closing tabs following ordinary editor-tab behavior?

**Answer:** Yes, exactly.

**Decision:** Activating an artifact reveals the right panel. If a tab for that
canonical artifact is already open, GateReeve activates the existing tab rather
than creating a duplicate; otherwise it creates and activates a new tab. The
panel visibility toggle only hides or shows the panel and does not close tabs or
change the active tab. Closing the active tab selects the nearest remaining tab.
Closing the last tab leaves the visible panel in an empty state until the user
hides it or opens another artifact.

### D5 - Keep tabs session-scoped behind a persistence-ready state model

**Question:** Should the initial implementation keep tabs in the current
application session while structuring their state so later restoration does not
require redesigning tab semantics?

**Answer:** Yes. Full application-state restoration is wanted eventually, but
the initial implementation should remain simple.

**Decision:** Open tabs survive main-view navigation and ordinary snapshot
refreshes within the selected feature worktree. Selecting a different feature
worktree clears the tab set, and application relaunch does not restore tabs in
the initial release. Panel state is nevertheless represented as serializable,
centralized data containing visibility, ordered canonical artifact IDs, and the
active tab ID. Artifact contents are never stored as tab state; they are reread
through the canonical artifact reader. Missing artifacts are reconciled safely.
This state shape is intentionally ready for later connection to GateReeve's
schema-versioned preference storage, but persistence, migration, and restore
behavior are outside the current scope.

### D6 - Finalizing drills into closeout and Complete opens the completion report

**Question:** Should Finalizing reveal feature-closeout structure below the
rail, while Complete opens the feature completion report as an artifact tab?

**Answer:** Yes.

**Decision:** Selecting `FINALIZING` reveals a feature-closeout card below the
state rail. It summarizes completion readiness, outstanding closeout
conditions, and whether another delivery slice is required. Selecting
`COMPLETE` opens `completion-report.md` in the docked right panel. Desktop's
canonical artifact inventory and named-reader contract must therefore include
the completion report with an honest pending, missing, or present status as
appropriate. The pinned presentation model continues to control which states
appear on the ordinary rail; non-presented terminal states such as
`ABANDONED_FEATURE` are not added merely by this decision.

### D7 - Initialize from workflow state without letting refresh steal selection

**Question:** Should opening a feature initially select its governed current
state, while subsequent refreshes and workflow transitions preserve the user's
inspection selection?

**Answer:** Yes.

**Decision:** Opening or switching to a feature worktree initializes the
selected rail item to that feature's governed current state and displays its
drill-down. After initialization, ordinary refreshes and observed workflow
transitions do not move the selected item. The explicit `Current` indicator may
therefore move independently while inspection stays stable. Selecting the
current-state rail item returns the user to current workflow context. Switching
worktrees clears the prior feature's selection and initializes from the new
feature's governed current state.

### D8 - Show the complete slice set with stable selection and boundary context

**Question:** When Delivering Slices is selected, should GateReeve show every
slice, initialize selection from the active or most recently proposed slice,
preserve that selection across refreshes, and keep a PR-boundary card visible
even before a boundary attempt exists?

**Answer:** Yes.

**Decision:** The slices card presents all slices in protocol order, including
planned, merged, and abandoned slices, with explicit status. It initially
selects the active slice; when none is active, it selects the most recently
proposed slice. Refresh preserves a still-valid user selection. Selecting any
slice reveals that slice's PR-boundary card below. A slice without a boundary
attempt still receives the card, which renders an explicit `No PR boundary has
started` state rather than collapsing the hierarchy or implying missing data.

### D9 - Attempt selection controls the gate graph and opens boundary context

**Question:** Should selecting a boundary attempt both make it the gate-graph
context and open or activate that attempt's `boundary.json` tab?

**Answer:** Yes.

**Decision:** A slice with boundary attempts initializes to its active attempt,
or otherwise its newest attempt, and preserves a still-valid selected attempt
across refreshes. Selecting an attempt renders that attempt's gate-dependency
graph and opens or activates its `boundary.json` artifact tab in the right
panel. If the expected boundary artifact is not yet present, the tab renders an
explicit unavailable state rather than failing silently or reading outside the
canonical artifact contract.

### D10 - Artifact-less gates open honest protocol-detail tabs

**Question:** When a selectable gate such as `reconcile` or `decisionTriage`
has no standalone evidence file, should GateReeve open an explicitly non-file
gate-detail tab rather than doing nothing or fabricating an artifact?

**Answer:** Yes.

**Decision:** Selecting a gate with a canonical evidence artifact opens or
activates that artifact tab. Selecting an artifact-less gate opens or activates
a `Gate detail` tab scoped to the gate and boundary attempt. That tab renders
canonical outcome, freshness, dependencies, blockers, and recorded-event
information and states `No standalone artifact`. It must not present generated
protocol detail as a file or expand the trusted file-reading boundary.

### D11 - Deduplicate tabs by underlying canonical document

**Question:** When an attempt and multiple gates reference the same underlying
artifact, such as `boundary.json`, should every reference activate one shared
document tab rather than create contextual duplicates?

**Answer:** Yes.

**Decision:** Artifact-tab identity represents the underlying canonical
document, not the hierarchy item or click that opened it. Attempt,
`pinContext`, and `packetValidation` references to the same `boundary.json`
activate one shared tab; the viewer may still disclose the attempt or gate
context that led to it. The renderer continues to read through an authorized
snapshot artifact ID and gains no arbitrary path-reading capability. Protocol
object tabs such as artifact-less gate details retain their own attempt-and-gate
identity because they are not documents.

### D12 - Remove the Attention card and reserve alerts for exceptional conditions

**Question:** Should GateReeve remove the duplicative Attention card and replace
the current warning presentation with one strict escalation policy?

**Answer:** Yes.

**Decision:** Remove the standalone `Blockers and warnings` Attention card.
Reserve the colored alert area above the hierarchy for exceptional,
workflow-wide conditions: observation/runtime failure, an inconsistent or
incompatible record, feature suspension, or uncommitted journal or pinned-model
governance inputs. Consolidate concurrent top-level conditions rather than
stacking duplicate notices. Gate failures, stale evidence, and other
object-owned conditions appear on the affected slice, attempt, or gate. Action
prerequisite failures appear with the relevant governed Next Action. Ordinary
source changes and unavailable Git or GitHub enrichment remain quiet in the
Sources area. Incomplete Setup uses a compact Setup status rather than a
full-width banner because it does not prevent historical or offline reading.
No condition should be rendered simultaneously as both a global alert and a
second generic attention item.

### D13 - Keep Next Actions as quiet current-workflow guidance

**Question:** Should Next Actions remain independent of selected inspection
state while adopting a quieter, compact, disclosure-based presentation?

**Answer:** Yes.

**Decision:** Retitle the surface `Current workflow guidance` and place it
outside and below the selected hierarchy. It always represents the governed
current state and is never filtered by feature-state, slice, attempt, gate, or
artifact selection. Render the section only when the protocol proposes at least
one action; do not show an empty placeholder card. Each action begins as a
compact summary of action, authority, and readiness and expands on demand to
show blockers, required inputs, and its copyable non-executing command.

### D14 - Make Artifacts an inventory that opens application-panel tabs

**Question:** Should the existing Artifacts page stop owning a second embedded
viewer and instead act as a complete artifact inventory whose selections open
the application-level right panel?

**Answer:** Yes.

**Decision:** The Artifacts page lists the complete canonical expected and
present artifact map with explicit status. Selecting an available artifact
opens or activates its deduplicated application-panel tab. Selecting a pending
or missing expected artifact opens its explicit unavailable tab. Remove the
page-local artifact viewer so GateReeve has one artifact-viewing model. Open and
reveal actions remain within the artifact tab. This decision does not yet move
History, Model, or Session object details into the panel.

### D15 - Milestones are children of the selected feature state

**Question:** Should the milestone strip remain inside the feature-state rail
card but show milestones belonging to the user-selected state rather than
always showing governed-current milestones?

**Answer:** Yes.

**Decision:** The rail card's milestone strip is subordinate to selected-state
inspection. It displays only milestones whose protocol `state` matches the
selected rail item, preserving their canonical complete, active, pending,
ready, or blocked statuses. State selection may therefore both open the state's
artifact tab and update its milestone children, while Delivering Slices also
exposes the slices card. The independent `Current` rail indicator continues to
identify live workflow position and prevents selected-state milestones from
being mistaken for a workflow transition.

### D16 - Remove duplicate current-position facts from the page heading

**Question:** Should the `Feature <state>` and `Slice <name>` facts be removed
from the Workflow Overview heading and represented at their natural hierarchy
levels instead?

**Answer:** Yes.

**Decision:** Remove both headline-fact pills. The feature rail's explicit
`Current` treatment communicates governed feature state. The active slice card
carries an explicit `Active` label. When a user inspects another slice, `Active`
and `Selected` indicators coexist without conflation, following the same
semantic pattern as current and selected feature states. Outside delivery, no
empty `Slice: None` fact is rendered. The Workflow Overview heading remains
visually quiet.

### D17 - Include a session-scoped resizable panel divider

**Question:** Should the application-level right panel include user resizing in
the first version rather than use a fixed width?

**Answer:** Yes.

**Decision:** Include a draggable vertical divider between main content and the
right panel. Start from a sensible default proportion and constrain resizing by
minimum usable widths for both panes. Width remains session-scoped, resets to
the default after relaunch under D5, and does not alter panel visibility, tab
identity, or selection semantics. Exact dimensions and constrained-width
behavior are visual-design and validation details rather than settled pixel
requirements.

## Sub-feature checkpoint - Hierarchical overview and artifact panel

The first sub-feature is structurally settled:

- Governed-current and user-selected states are independent, simultaneously
  visible concepts.
- Selected feature state, slice, attempt, and gate form a progressive
  hierarchy with explicit defaults and empty states.
- Designing, Specifying, Planning, and Complete open their canonical feature
  artifacts; Delivering Slices and Finalizing reveal subordinate cards.
- Artifacts and protocol gate details open in one application-level, docked,
  tabbed, closable, resizable right panel.
- Tabs deduplicate by canonical document, remain session-scoped, and are shaped
  for later persistence without implementing restoration now.
- Milestones follow selected-state context; current action guidance remains
  independent; duplicate Attention and heading-fact noise is removed.

Consciously deferred within this sub-feature are exact animation, dimensions,
responsive breakpoints, and full keyboard behavior. These must be resolved and
verified during design synthesis, specification, and visual/accessibility
validation without changing the settled semantic contracts above.

## Sub-feature under interview - Version and ordering cues

The next proposed enhancements are:

- Display the running GateReeve Desktop version gently in the application
  masthead.
- Add restrained ordinal markers to ordered UI objects such as PR slices and
  PR-boundary gate dependencies so temporal or logical sequence is easier to
  understand.
- Preserve the meaning of those markers if user-configurable sorting is added
  later.

Codebase facts established before questioning:

- Desktop already exposes its version through Setup metadata but does not show
  it in the ordinary masthead.
- Projected slices have a protocol order that can supply a stable delivery
  ordinal.
- The boundary is a dependency graph, not a fully linear list. Several review
  gates may become eligible in parallel after Verification, so naive consecutive
  numbering would falsely claim a temporal order that the protocol does not
  have.

### D18 - Use edge markers with natural ordinals and lettered parallel branches

**Question:** Should slice numerals represent stable delivery order and gate
numerals represent dependency stages, including lettered branches for gates
that may proceed in parallel?

**Answer:** Use the edge-marker styling, omit leading zeroes, count naturally,
retain the `4a`, `4b`, `4c` branch treatment, and combine the edge marker with
the darker circular numeral outline from the outline option.

**Decision:** Ordered slice and boundary items use a hybrid treatment: the
restrained edge accent from the edge-marker option plus the darker outlined
numeral circle from the outline option. Display natural numerals (`1`, `2`,
`3`) rather than zero-padded values. Slice ordinals remain stable
delivery-order metadata and travel with the slice when display sorting changes.
Boundary numerals represent dependency stages, not arbitrary screen positions.
Parallel gates share a stage number and receive lettered branches such as `4a`
through `4d`, preserving their logical relationship without falsely claiming
serial execution.

### D19 - Show the running Desktop version on the product-name baseline

**Question:** Should the running GateReeve Desktop version appear as subdued
plain text immediately beside the GateReeve product name in the masthead?

**Answer:** Yes, with the GateReeve name and version number aligned on the same
text baseline.

**Decision:** Display the running Desktop build version, formatted like
`v0.1.0`, immediately after the `GateReeve` name. Use visually subordinate
plain text rather than a pill or status treatment, and align both text runs on a
shared baseline. Source the value from the running Desktop build metadata
already exposed through Setup rather than hard-coding or inferring it from a
feature record.

### D20 - Reuse ordering markers only where order is semantic

**Question:** Should the marker treatment be implemented as a reusable UI
pattern but applied only when the protocol supplies stable temporal or
dependency order?

**Answer:** Yes.

**Decision:** Implement one reusable ordered-item marker treatment, initially
used for PR slices and PR-boundary gates. Do not number arbitrary collections
merely because they render as lists. A later surface may adopt the treatment
only when its numeral can represent stable temporal order, delivery order, or a
dependency stage independent of the current display sort.

## Sub-feature checkpoint - Version and ordering cues

This sub-feature is settled:

- The running Desktop version appears gently beside the GateReeve name on a
  shared text baseline and comes from running-build metadata.
- PR slices carry stable natural-number delivery ordinals that remain attached
  to the slice under alternate display sorting.
- Boundary gates carry dependency-stage numerals, with lettered branches for
  parallel gates.
- Both use the selected hybrid visual treatment: a restrained edge accent plus
  a darker outlined numeral circle.
- The marker is reusable but may appear only where order has protocol-backed
  semantic meaning.

## Sub-feature under interview - Saved projects and root navigation

The proposed enhancement is to let the user explicitly save a list of projects
in GateReeve Desktop, select among them from the left sidebar, and make that
selection the root of the application's inspection hierarchy.

Candidate shell changes include either adding another project sidebar to the
left of the current sidebar or repurposing the existing sidebar for projects
and moving Overview, Artifacts, History, Model, Session, and Setup navigation
elsewhere.

Codebase facts established before questioning:

- Desktop currently observes one explicit worktree and one resolved feature
  record at a time.
- Preferences store up to ten recent absolute worktree paths plus the last
  worktree, but do not model saved projects, project labels, ordering, removal,
  or per-project state.
- Switching paths already has a guarded coordinator generation boundary that
  tears down the prior watcher and polling before opening the next selection.
- The existing left sidebar mixes selected-feature identity, primary-view
  navigation, notification preference, and source status.
- The planned right artifact panel makes a second permanent left sidebar
  especially expensive in horizontal space.
- `Setup` already has a masthead entry point, so its duplicate sidebar item is
  not required merely to preserve access.

The first unresolved contract is the identity and containment meaning of a
saved `project`: whether it is one explicitly selected worktree resolving to
one feature record, or a repository/workspace container beneath which multiple
feature worktrees must be discovered and selected.

### D21 - A saved project is one explicitly verified directory

**Question:** Should a saved project initially mean one explicitly selected
worktree/workspace resolving to one feature record, rather than a repository
container that discovers multiple feature worktrees?

**Answer:** Keep it simple. A project is a directory that GateReeve verifies has
a feature record.

**Decision:** A saved project represents one user-selected directory. GateReeve
canonicalizes and verifies that directory through its existing trusted workflow
context and feature-record boundary before adding it. It does not scan the
directory, repository, home folder, or sibling worktrees for other features.
Project identity is the canonical directory path, so selecting the same
directory again activates the existing entry rather than creating a duplicate.
The saved project stores a reference to the directory, not a cached snapshot,
artifact content, or governance projection.

#### Admission policy resolved by D22

The user is inclined to admit only healthy current records as normal saved
projects. Legacy compatibility is low value for the current sole-user product.
Inconsistent, incompatible, malformed, or otherwise unreadable records do not
enter the normal workflow workspace; GateReeve instead produces a read-only
diagnostic explaining the exact problem and safe options to repair, select
another directory, or deliberately start over.

### D22 - Admit only fully validated current records and diagnose the rest

**Question:** Should normal saved projects be limited to fully validated,
supported governed records, with every other record condition routed to a
non-mutating diagnostic experience?

**Answer:** Yes.

**Decision:** A newly selected directory enters the normal project list only
after GateReeve resolves its feature home, reads and validates the model lock
and journal, projects the record successfully, and confirms that the running
Desktop supports its pinned model and protocol contract. Present these admitted
projects as `Ready`; internal protocol terminology need not dominate the
ordinary UI. Do not admit legacy, missing, structurally inconsistent,
model-incompatible, malformed, or otherwise unreadable selections.

For a failed add, show a read-only diagnostic instead of opening or saving the
project. Include the selected directory, resolved feature-record path, friendly
classification, exact failed checks or filenames, pinned and supported model
details when relevant, and safe next choices. If an already-saved project later
fails validation, retain it as a disabled `Needs attention` entry whose only
destination is its diagnostic; never silently remove it. Desktop remains
read-only and does not initialize, delete, overwrite, migrate, or repair the
record. Any `start over` path is explicit and manual, with diagnostic guidance
or copyable safe native commands rather than automatic mutation.

### D23 - Give projects the left sidebar and move views into fixed main tabs

**Question:** Should GateReeve repurpose its existing left sidebar for saved
projects, move primary views into fixed main-content tabs, and avoid adding a
second left sidebar?

**Answer:** Yes.

**Decision:** The existing left sidebar becomes the saved-project list.
`Overview`, `Artifacts`, `History`, `Model`, and `Session` become fixed,
non-closable navigation tabs above the main content. They are visually and
semantically distinct from closable artifact and protocol-detail tabs in the
right panel. `Setup` remains available from the masthead and leaves the main
navigation tab set. Source status moves into selected-project current context,
and notification preferences move into Setup. Do not add a second permanent
left sidebar.

### D24 - Use standard primary and secondary sidebar shortcuts

**Question:** Should GateReeve adopt the standard IDE keyboard equivalents for
toggling its project sidebar and right artifact panel?

**Answer:** Yes. Use the exact verified shortcut pairing.

**Decision:** On macOS, `Command+B` toggles the saved-project sidebar and
`Command+Option+B` toggles the right artifact panel. On Windows and Linux, use
`Ctrl+B` and `Ctrl+Alt+B`, respectively. Do not use `Command+Shift+B`, which VS
Code reserves for Run Build Task. Masthead/layout controls and application menu
commands expose the same actions and shortcuts. Toggling visibility preserves
project selection, panel width, open tabs, and active tab; it does not mutate
workflow state.

Reference convention:

- https://code.visualstudio.com/docs/reference/default-keybindings
- https://code.visualstudio.com/docs/configure/custom-layout

### D25 - Label projects by directory, with contextual disambiguation

**Question:** Should each saved project use its directory name as the primary
sidebar label, show the current feature ID and workflow state as secondary
context, disambiguate duplicate directory names with a parent-path fragment,
and defer custom aliases?

**Answer:** Yes.

**Decision:** A Ready project entry uses the selected directory's basename as
its primary label. Its secondary line identifies the current feature and
workflow state without competing with the primary project identity. When two
saved projects have the same basename, GateReeve reveals the shortest useful
parent-path fragment needed to distinguish them. Project identity remains the
canonical directory path. Do not add user-defined project aliases in this
version, but avoid making the presentation model depend on the basename so an
optional alias can be added later without changing project identity.

### D26 - Preserve independent session-scoped UI state per project

**Question:** Now that switching among saved projects is a normal operation,
should each project retain its own UI state for the current application session
instead of clearing the artifact workspace on every directory change?

**Answer:** Yes.

**Decision:** Maintain an independent, session-scoped workspace state for each
saved project. This includes the selected fixed main tab, feature-state and
slice hierarchy selections, open right-panel tabs, active right-panel tab, and
right-panel width and visibility. Switching projects restores the destination
project's state without changing its workflow state. A newly opened project
uses the normal current-state defaults. This refines D5: changing projects no
longer destroys the source project's tabs; those tabs remain isolated in that
project's in-memory workspace and return when the user switches back. Relaunch
persistence remains out of scope for this version.

### D27 - Revalidate and restore the last active project on launch

**Question:** On relaunch, should GateReeve restore the saved-project list and
automatically select the previously active project after revalidating it,
showing that project's diagnostic if validation fails rather than silently
selecting another project?

**Answer:** Yes.

**Decision:** Persist the ordered project path references and the canonical path
of the last active project. At launch, revalidate the last active project
against the current filesystem, record, model, and protocol support before
opening its normal workspace. If it is Ready, select it and initialize fresh
session UI state. If it Needs attention, keep it selected and show its
diagnostic. Do not silently fall back to another Ready project, because that
would hide the startup failure and change project context without the user's
choice. Persisted artifact tabs and hierarchy selections remain out of scope.

### D28 - Add and remove saved references from the project sidebar

**Question:** Should the sidebar provide a quiet `+ Add Project` control and a
`Remove from GateReeve` action that affects only the saved reference, selecting
the nearest remaining project or an empty welcome state when the active entry
is removed?

**Answer:** Yes.

**Decision:** Place `+ Add Project` in the project-sidebar header. It opens the
native directory chooser and applies the admission and diagnostic contract in
D21-D22 before saving or opening the selection. Provide `Remove from
GateReeve` through the project's contextual actions. Clearly state that this
removes only GateReeve's saved reference and never deletes or alters the
directory, feature record, or artifacts. Removing the active project selects
the nearest remaining project in displayed order; if none remain, show the
empty welcome state. Removing a project also discards only its in-memory UI
state for the current session.

### D29 - Keep project ordering stable and user-controlled

**Question:** Should new projects append to a stable list that never reorders by
recent use, while allowing drag-and-drop manual ordering that persists across
relaunches?

**Answer:** Yes.

**Decision:** Preserve explicit project order as application state. Append each
newly admitted project to the end of the list. Never move an entry merely
because it was selected or recently active. Support direct drag-and-drop
reordering and persist the resulting canonical-path order across relaunches.
Keyboard and other accessible reordering mechanics must expose the same
operation; drag-and-drop is not the sole semantic control.

### D30 - Validate all projects at launch but watch only the active one

**Question:** Should GateReeve validate every saved project once at launch so
sidebar statuses are trustworthy, continuously watch only the active project,
and revalidate an inactive project when it is selected?

**Answer:** Yes.

**Decision:** Resolve and validate each persisted project reference once during
application startup before presenting its Ready or Needs attention status.
After startup, attach live filesystem and workflow observation only to the
active project. Inactive projects retain their most recently validated status
without background watchers and are revalidated before becoming active. This
keeps the list truthful at launch and the selected context authoritative while
avoiding one long-lived watcher and polling stack per saved directory.

### D31 - Make healthy project status quiet and exceptions visible

**Question:** To preserve the quieter visual language, should Ready projects
show no status badge, with selection conveyed by the normal sidebar highlight,
while only Needs attention projects receive a restrained warning icon and
accessible status text?

**Answer:** Yes.

**Decision:** Do not decorate ordinary Ready entries with repetitive status
pills or success color. Use the sidebar's selected-row treatment to identify
the active project. A project that fails validation receives a restrained
warning icon plus an accessible `Needs attention` label; selecting it opens its
diagnostic as defined in D22. Status must not rely on color alone. This is an
exception indicator, not another application-wide notification banner.

## Sub-feature checkpoint: saved-project navigation

The project-navigation concept is coherent enough to carry into design:
explicit verified directories, a persistent and manually ordered sidebar,
fixed main-view tabs, per-project session workspaces, safe reference-only list
management, deterministic launch restoration, bounded validation, and quiet
exception-only status. Exact sidebar dimensions, row density, drag affordance,
and empty-state copy remain visual-design details rather than unresolved product
semantics.
