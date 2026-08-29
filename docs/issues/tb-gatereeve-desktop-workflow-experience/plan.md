# Plan - tb-gatereeve-desktop-workflow-experience

**Feature:** `tb-gatereeve-desktop-workflow-experience`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-29
**Status:** authorized (2026-08-29)

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge
  cases.

## Strategy

Deliver the feature as four sequential PR slices behind one cumulative feature
record. Establish protocol, preference, coordinator, and IPC contracts before
moving navigation state into the renderer. Build the application shell and
unified inspector next, then add the hierarchical Overview and signal policy.
Finish with cross-cutting accessibility, constrained-window, migration, and
runtime verification.

Keep the security boundary narrow throughout. The main process owns directory
canonicalization, governed-record admission, saved project references,
observation, and named reads. The renderer receives validated project and
snapshot projections and owns only observational per-project UI state.
Canonical paths identify projects; canonical artifact IDs identify document
tabs. Only the active project receives watchers and GitHub polling.

Migrate preference schema v1 to v2 without discarding the user's existing
recent paths: treat the ordered `recentWorktrees` values as preexisting saved
references, preserve `lastWorktree`, canonicalize and deduplicate them during
validation, and classify failures as `Needs attention` rather than Ready. New
directory selections continue to use strict admission and are saved only when
fully valid and supported.

### Proposed delivery slices

1. **Trusted project and protocol foundation:** P1-P3.
2. **Application shell and unified inspector:** P4-P5.
3. **Hierarchical workflow and signal policy:** P6-P7.
4. **Integrated accessibility and runtime hardening:** P8.

Each slice carries its own unit and integration verification. Later slices
begin from the updated integration branch after the preceding PR merges, while
this feature folder remains cumulative.

### Local iteration loop

Keep one local renderer fixture server running from `apps/desktop` and use
`/visual/index.html` as the fastest edit-render-inspect surface. The fixture
loads the production HTML, CSS, and renderer modules, so renderer changes can be
reloaded in an ordinary browser without launching Electron at all. Its
deterministic in-browser preload mock performs no native application action.
Keep that fixture API synchronized with the validated preload contract and
exercise representative Ready, Needs attention, hierarchy, artifact, and
warning states.

Use renderer DOM tests as the fastest logic loop beneath the visual fixture.
Those tests run the production renderer against `linkedom`, require neither a
browser nor Electron, and should cover state transitions and semantics before
visual inspection.

Use source-launched Electron as the integration checkpoint for real
preferences, IPC, native directory selection, keyboard accelerators, watchers,
and focus behavior. Run protocol staging once initially and again only after
protocol sources change; otherwise relaunch Electron directly instead of paying
the staging cost on each renderer edit. Run focused `node --test` files during
the inner loop and the full `npm test` suite at coherent checkpoints and PR
boundaries.

Do not package, create a DMG, prepare a release, deploy, or publish anything as
part of implementation iteration. Those operations are neither required nor
authorized by this plan.

## Steps

- **P1. Extend trusted projection and detail contracts.** Add the completion
  report to the canonical artifact inventory with honest present, pending, and
  missing states. Expose sufficient named attempt/gate detail for virtual Gate
  Detail tabs without arbitrary paths. Derive deterministic slice ordinals and
  boundary dependency stages, including lettered parallel branches. Update
  snapshot/detail validation and protocol fixtures. **Advances:** R5, R6.

- **P2. Replace recent-worktree preferences with a saved-project registry.**
  Introduce a schema-versioned project-list model containing canonical path
  references, explicit order, and last active path. Implement the v1-to-v2
  migration, canonical deduplication, append, pointer/keyboard reorder backing
  operations, and reference-only removal. Preserve window, agent, and
  notification preferences. Cover corrupt preferences and migration edge cases.
  **Advances:** R2, R3.

- **P3. Add project admission and switching to the main-process boundary.**
  Refactor the coordinator to validate all saved projects at startup, return
  Ready or Needs attention summaries and structured diagnostics, restore the
  last active project deterministically, revalidate before switching, and keep
  watchers/polling exclusive to the active project. Add validated IPC/preload
  operations for add, activate, reorder, and remove. Preserve generation guards
  and prove rejected or removed projects are never mutated. **Advances:** R2,
  R3.

- **P4. Build the three-region application shell and per-project workspace
  store.** Repurpose the left sidebar for projects; move Overview, Artifacts,
  History, Model, and Session into fixed main tabs; keep Setup in the masthead;
  and display the running version on the product-name baseline. Add centralized
  serializable in-memory workspace state per canonical project. Implement
  independent sidebar and inspector visibility controls, application-menu and
  masthead commands, platform shortcuts, a constrained resizable divider,
  focus restoration, and reduced-motion behavior. **Advances:** R1, R3, R8.

- **P5. Replace the embedded artifact viewer with the unified inspector.** Add
  ordered closable tabs, canonical document deduplication, scoped virtual-detail
  identity, active/nearest-tab behavior, hidden-panel preservation, explicit
  empty and unavailable states, and safe refresh reconciliation. Route every
  artifact entry point through the same panel, keep Open and Reveal inside
  document tabs, and reduce Artifacts to an inventory. **Advances:** R6, R8.

- **P6. Implement progressive workflow hierarchy and semantic ordering.** Make
  feature states observationally selectable while rendering independent Current
  and Selected semantics. Initialize from governed current state and preserve
  selection across refresh and transitions. Filter milestones by selected
  state; implement Designing, Specifying, Planning, Delivering Slices,
  Finalizing, and Complete disclosures; add all-slice selection, Active versus
  Selected treatment, boundary empty states, attempt context, gate graph
  selection, and the approved ordinal-marker component. **Advances:** R4, R5,
  R8.

- **P7. Apply the exception-only signal policy and current guidance.** Remove
  headline facts and the Attention card. Consolidate exceptional workflow-wide
  alerts, locate object-owned conditions at their slice/attempt/gate/action,
  move source status into project context, move notification preferences into
  Setup, and replace Next Actions with conditional, expandable Current workflow
  guidance that remains independent of inspection selection. Add fixture-matrix
  coverage proving conditions appear once at the correct scope. **Advances:**
  R7, R8.

- **P8. Harden and verify the assembled desktop experience.** Expand renderer,
  coordinator, contract, preference, protocol, accessibility, and visual
  fixtures across the full interaction matrix. Exercise startup migration,
  valid and invalid projects, multi-project switching, external invalidation,
  session reset, shortcuts, focus, resizing, minimum supported window size,
  reduced motion, semantic status, and trusted named reads in the running
  Electron application where practical. Run the full rubric evaluation and
  independent workflow gates, address findings, and produce the completion
  report at feature closeout. **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.

## Integration touchpoints

- **Preferences and main process:** `apps/desktop/main/preferences.js`,
  `coordinator.js`, `ipc.js`, `index.js`, `window.js`, and watcher/observer
  lifecycles.
- **Trusted contracts:** `apps/desktop/shared/contracts.js`,
  `apps/desktop/preload/index.cjs`, and
  `apps/desktop/resources/protocol/snapshot.js` plus protocol validators.
- **Renderer:** `apps/desktop/renderer/index.html`, `renderer.js`,
  `presentation.js`, `dom.js`, and `styles.css`.
- **Application menus and metadata:** Electron window/menu setup and the Setup
  desktop version already carried in validated state.
- **Verification:** `apps/desktop/test/` unit/integration suites and
  `apps/desktop/visual/` runtime fixtures.

## Verification

- Run `npm test` from `apps/desktop` for staged-protocol and Desktop unit and
  integration coverage.
- During active edits, prefer focused commands such as
  `node --test test/renderer.test.js test/renderer-integration.test.js` and use
  the persistent local visual fixture for immediate render inspection.
- After the initial `npm run stage:protocol`, use a direct local Electron launch
  for unchanged protocol sources; restage only when protocol code changes.
- Run targeted tests after each step, especially preference migration,
  coordinator generation/watcher behavior, IPC contract rejection, artifact
  named-read confinement, renderer state reconciliation, and accessibility.
- Exercise the visual fixture and running Electron application at default and
  minimum supported sizes with normal and reduced motion.
- Verify macOS shortcuts directly and test Windows/Linux accelerator mapping at
  the menu/contract level where those platforms are unavailable.
- Verify add/remove operations with filesystem before-and-after evidence and
  prove UI inspection does not append workflow events.
- At each PR boundary, run the required verification matrix, spec evaluation,
  independent judge, pattern review when applicable, code review, and decision
  triage against the exact pinned boundary.
- **Final step:** Run full rubric evaluation against R1-R8 and produce the
  completion report.
