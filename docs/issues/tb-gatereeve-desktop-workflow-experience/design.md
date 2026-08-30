# Design - tb-gatereeve-desktop-workflow-experience

**Status:** approved (gate passed 2026-08-29)

## Problem

GateReeve Desktop currently presents workflow objects as a mostly linear page.
The feature-state rail, slices, boundary attempts, gates, warnings, actions, and
artifact content compete for attention even when most of them are unrelated to
what the user is inspecting. The page also conflates two different ideas:
where the governed workflow actually is and what historical, current, or future
state the user has selected to inspect.

Artifact reading is split between the Overview and a page-local Artifacts
viewer instead of behaving like a persistent desktop workspace. Important
context is duplicated in heading pills, warning banners, and an Attention card,
while genuinely exceptional conditions are not governed by one clear
escalation policy. Ordering is also hard to read: slices have a temporal order,
but boundary gates form a dependency graph whose parallel branches should not
be presented as a false serial list.

Finally, the application treats one recent worktree as the whole application
context. It does not provide a stable, user-managed list of verified projects
or preserve independent in-session inspection workspaces while switching among
them.

## Intent

Make GateReeve a quieter, IDE-like workflow inspector organized as a progressive
hierarchy:

1. The selected project is the root context.
2. A fixed main view selects Overview, Artifacts, History, Model, or Session.
3. Overview selection drills from feature state to slice to boundary attempt to
   gate.
4. Canonical artifacts and protocol details open beside that hierarchy in one
   docked right panel that presents the most recently selected item while
   retaining serializable tab identity internally.

The design must keep observation separate from mutation. Selecting a project,
state, slice, attempt, gate, or artifact changes only what GateReeve shows. It
never advances, rewinds, or otherwise changes the governed workflow.

The ordinary interface should communicate healthy state with structure rather
than badges. High-visibility warnings are reserved for exceptional conditions,
and ordering cues appear only where the protocol supplies stable temporal or
dependency meaning.

## Chosen shape

### Application shell

Use a three-region desktop shell:

- A collapsible left sidebar contains saved projects.
- The central workspace contains fixed, non-closable tabs for `Overview`,
  `Artifacts`, `History`, `Model`, and `Session`.
- A collapsible and resizable right panel presents one active artifact or
  protocol detail from an internal per-project tab collection.

`Setup` remains a masthead action rather than a main tab. Notification
preferences move into Setup. Source status moves into the selected project's
context instead of occupying permanent global-sidebar space. The existing
`Feature <state>` and `Slice <name>` heading pills are removed; current state
and active slice are labeled at their natural hierarchy levels.

The masthead shows the running Desktop version as subdued plain text directly
beside `GateReeve`, on the same text baseline. The value comes from the running
application's build metadata.

The sidebar toggles with `Command+B` on macOS and `Ctrl+B` on Windows and Linux.
The right panel toggles with `Command+Option+B` on macOS and `Ctrl+Alt+B` on
Windows and Linux. Equivalent layout buttons and application-menu commands are
available. Toggling either region preserves its state. Animations are short and
respect reduced-motion preferences. Both regions remain docked rather than
moving below the content; minimum pane widths and the application minimum
window size prevent unusable layouts, with exact dimensions established by
visual and accessibility testing.

### Saved-project root

A project is one explicitly selected directory that resolves to one supported,
fully valid governed feature record. GateReeve canonicalizes the directory path
and uses that path as project identity. It does not scan parents, repositories,
siblings, or the home directory for additional records.

`+ Add Project` opens the native directory chooser. A project is admitted only
after GateReeve resolves the feature home, validates the model lock and event
journal, projects the record, and confirms compatibility with the running
Desktop. A failed candidate is not saved or opened as a normal workspace;
instead, GateReeve shows a read-only diagnostic containing the selected path,
resolved record path, friendly classification, exact failed checks, relevant
model versions, and safe manual next steps. Desktop does not initialize,
migrate, repair, delete, or overwrite feature records.

Persist only canonical project-path references, their explicit display order,
and the last active path. New projects append; use never reorders the list.
Direct drag-and-drop and an equivalent keyboard-accessible operation allow the
user to reorder entries, and that order survives relaunch. `Remove from
GateReeve` removes only the saved reference and says so explicitly. It never
changes the directory or record.

The primary project label is the directory basename. A secondary line gives
the feature ID and workflow state. Duplicate basenames reveal the shortest
useful parent-path fragment. Identity does not depend on this presentation, so
aliases can be added later without a data-model change.

At launch, validate every saved project once, then restore the previously
active entry. If that project is valid, open a fresh session workspace for it.
If it has become invalid or incompatible, retain and select it as `Needs
attention` and show its diagnostic rather than silently choosing another
project. Healthy projects receive no `Ready` badge; selection uses the normal
row treatment. Only exceptional entries receive a restrained warning icon and
accessible `Needs attention` text. After startup, observe only the active
project continuously and revalidate an inactive project before activating it.

Each project owns independent in-memory UI state: selected main tab, hierarchy
selections, open and active right-panel tabs, panel visibility, and panel width.
Switching projects restores that state for the session. Relaunch restores the
project list and last project, but not artifact tabs or hierarchy selections.

### Feature-state hierarchy

Keep the feature-state rail substantially recognizable but make each presented
state selectable. Governed-current state and inspection selection are separate
properties:

- Current state retains the protocol status marker and `aria-current="step"`.
- Selected state receives its own selection treatment and
  `aria-pressed="true"`.
- When an item is both current and selected, both meanings remain accessible
  and layout-stable and neither relies on color alone.

Opening a project initially selects its governed current state. Later snapshot
refreshes and workflow transitions may move the Current indicator but never
steal the user's selection. Selecting the current state is the explicit way to
return inspection to live workflow context.

Milestones remain visually inside the rail card but are children of the
selected state. The content below the rail follows progressive disclosure:

- `DESIGNING` opens `design.md` in the right panel.
- `SPECIFYING` opens `spec.md`.
- `PLANNING` opens `plan.md`.
- `DELIVERING_SLICES` reveals the slices card.
- `FINALIZING` reveals a feature-closeout card with readiness and outstanding
  closeout conditions.
- `COMPLETE` opens `completion-report.md`.

An expected but absent artifact opens an honest pending or unavailable tab.
The canonical artifact inventory and named reader are extended to include the
completion report; no arbitrary path reading is introduced.

### Slice and PR-boundary hierarchy

The slices card shows every protocol slice, including planned, active, merged,
and abandoned entries, in stable delivery order. It initially selects the
active slice or, when none is active, the most recently proposed slice. A valid
user selection survives refresh. `Active` and `Selected` are independent and
may coexist on different slices.

Selecting a slice reveals its PR-boundary card. A slice without an attempt
still shows an explicit `No PR boundary has started` state. When attempts exist,
the active attempt or otherwise newest attempt is the initial selection.
Selecting an attempt makes it the gate-graph context and opens its canonical
`boundary.json` document.

Selecting a gate opens its canonical evidence artifact when one exists. An
artifact-less gate such as reconciliation or decision triage opens a
protocol-detail item scoped to the attempt and gate. That virtual item reports
canonical outcome, dependencies, blockers, and event context without claiming
to be a file or adding a redundant empty-artifact notice.

### Right artifact panel

The right panel behaves like an IDE editor companion: opening inspectable
content reveals the panel, and the entire panel can be hidden without losing
the internal collection. For the current simplified experience, the visible
tab strip is suppressed and only the most recently selected item is presented.

Internal document entries are deduplicated by underlying canonical artifact
identity, not by the control that opened them. An attempt and gates that all
refer to the same `boundary.json` activate one shared document identity.
Virtual gate details use attempt-and-gate identity. Tab state stores only
serializable identity and ordering metadata; content is always reread through
GateReeve's trusted artifact boundary. This keeps later restoration and a
future visible tab strip possible without implementing either now.

The Artifacts main view becomes the complete expected-and-present artifact
inventory. It opens the same application-level tabs and no longer owns a
second embedded viewer. History, Model, and Session remain central views in
this feature.

### Ordering cues

Use one reusable ordered-item treatment consisting of a restrained edge accent
and a darker outlined numeral circle. Apply it only when order is semantic.

Slices carry stable natural-number delivery ordinals (`1`, `2`, `3`) that stay
attached to each slice if display sorting is introduced later. Boundary gates
carry dependency-stage numbers rather than row positions. Gates eligible in
parallel share a stage and receive lettered branches such as `4a`, `4b`, and
`4c`. Arbitrary collections are not numbered merely because they appear as
lists.

### Alerts and current guidance

Remove the standalone Attention card. The colored area above the hierarchy is
reserved for exceptional workflow-wide conditions: observation or runtime
failure, inconsistent or incompatible records, feature suspension, or
uncommitted journal/model governance inputs. Concurrent global problems are
consolidated instead of duplicated.

Object-owned conditions remain local: gate failures and stale evidence appear
on their gate or boundary; action prerequisites appear with the affected
action; ordinary source changes and unavailable Git/GitHub enrichment remain
quiet in Sources; incomplete Setup receives compact Setup status.

Retitle Next Actions as `Current workflow guidance`. It remains outside and
below the selected hierarchy because it always describes governed current
state, never inspection selection. Render it only when the protocol proposes
actions. Each action begins as a compact summary and expands to show blockers,
inputs, authority, and its copyable non-executing command.

## Alternatives considered

- Keep the current linear Overview: rejected because unrelated levels remain
  simultaneously visible and current state stays conflated with inspection.
- Make selection advance the workflow: rejected because navigation must remain
  observational and governance transitions require explicit authority.
- Use modals, an Overview-local split, or a page-local artifact viewer:
  rejected in favor of one persistent application-level companion panel.
- Add a second permanent left sidebar: rejected because projects, navigation,
  and the right artifact panel would consume excessive horizontal space.
- Move the right panel beneath content at narrow widths: rejected because it
  breaks the requested IDE-like docked-panel model.
- Persist full tabs and view state immediately: deferred to keep the first
  version small; the state model remains serializable and persistence-ready.
- Accept legacy, inconsistent, malformed, or model-incompatible records in a
  degraded workspace: rejected in favor of strict admission and useful
  read-only diagnostics.
- Discover projects by scanning repositories or sibling worktrees: rejected;
  every project is an explicitly selected directory.
- Automatically reorder projects by recency: rejected because a navigation
  list should be spatially stable and user-controlled.
- Number every rendered list consecutively: rejected because display position
  is not always temporal or logical order and would misrepresent parallel
  gates.
- Keep duplicated warning, Attention, and heading-fact surfaces: rejected in
  favor of one escalation policy and context-local status.

## Constraints

- GateReeve Desktop remains read-only with respect to governed feature records
  and workflow transitions in this feature.
- All workflow truth, availability, dependencies, and artifact identities come
  from the pinned protocol projection and trusted named-reader boundary.
- UI selection never mutates governed current state.
- Canonical directory paths identify projects; canonical artifact IDs identify
  document tabs.
- Project-list and last-project persistence require a schema-versioned
  preference migration. Artifact content is never stored in preferences.
- Only the active project owns live watchers and polling after startup.
- Healthy status should be quiet. Current, selected, active, warning, and
  unavailable semantics require accessible text/state and cannot rely on color.
- Fixed main tabs and the active-item inspector must remain visually and
  semantically distinct.
- Reduced-motion, keyboard access, focus behavior, and screen-reader naming are
  part of the interaction contract, not optional polish.
- Exact dimensions, typography, colors, and animation timing are settled by
  implementation-time visual validation without changing these semantics.

## Open risks

- The three-region shell may expose width and focus problems at the minimum
  supported window size; it needs visual prototypes and keyboard/focus testing.
- Deriving gate stage labels from dependency topology must be deterministic and
  must not imply serial order among parallel or conditionally skipped gates.
- Validating all saved projects at launch may delay first paint when paths are
  slow or unavailable; validation should be bounded and report per-project
  failures independently.
- Inactive project status can become stale after startup by design. The UI must
  avoid implying continuous observation and must revalidate before activation.
- Migrating existing recent-worktree preferences into the explicit saved-list
  model requires a deterministic, non-destructive policy and regression tests.
- External record changes can invalidate open artifact tabs or hierarchy
  selections. Reconciliation must preserve valid user state and replace stale
  content with explicit unavailable states rather than showing old data.
- The completion report is not currently part of the Desktop artifact
  inventory, so protocol compatibility and absence states need coordinated
  coverage.

## Changes

### 2026-08-30 - Interface hierarchy and artifact-inspection polish

The approved live fixture refines the original design without changing its
read-only authority boundary. Current workflow state remains independent from
inspection selection, but the distinction is expressed through stable card
treatments and accessibility state rather than layout-shifting `Current` and
`Selected` pills. Feature-state, slice, and gate choices share one restrained
light-surface, full-card hover, selected outline, and focus treatment. Status
continues to use color plus text, with a top accent for the horizontal state
rail and a left accent for vertical slice and gate cards. Human-facing state
names use sentence capitalization, and `DELIVERING_SLICES` is presented as
`Implementing` while retaining its canonical protocol value.

The boundary is rendered as its actual dependency graph: stages 1 through 3,
parallel stage 4 branches (`4a` through `4d`), then stages 5 through 7. Connector
lines replace repetitive dependency prose. Redundant enum subtitles,
selection summaries, empty milestone messages, active-slice repetition,
workflow-context subtitles, and the `View full model` link are removed.

The right panel temporarily presents only the most recently selected artifact;
the serializable tab model remains internal for future restoration. Its compact
toolbar contains rendered/source controls when applicable, filename and quiet
type text, copy, a split Open menu for default-open/reveal/copy-path actions,
and an expand/restore control. The redundant Inspector heading, open-artifact
count, internal Hide control, large document title, artifact Refresh action,
and artifact-less gate notice are absent.

Source observations move out of Overview into a modal opened from `Watching
local changes`. It summarizes independent Local record, Git, and GitHub state,
keeping healthy details visually quiet. A project that fails admission gets an
exclusive central diagnostic: the project list remains available, while tabs,
hierarchy, and inspector content from the previously valid project are hidden.
Explicit grid placement keeps the central workspace stable when either sidebar
is hidden. Standard icon controls occupy the far right of the masthead; Add
Project continues to use the existing native directory-chooser implementation.
