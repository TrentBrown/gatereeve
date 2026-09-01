# Interview - tb-desktop-phase-context

**Feature start:** 2026-08-31
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

## D1 - Scope and placement

**Question:** Should GateReeve reproduce the complete Artifact Flow reference,
or disclose only the context for the feature state selected in the existing
rail?

**Answer:** Add a new card or panel beneath the Designing, Specifying, and
Planning selections. Use the static Artifact Flow card as inspiration without
copying the entire lifecycle into Overview.

**Decision:** Show one state-specific `Phase context` surface directly below
the state rail and milestones. Render it only for `DESIGNING`, `SPECIFYING`,
and `PLANNING`, before the existing current-workflow guidance. Do not add
equivalent content for Implementing, Finalizing, or Complete in this feature.

## D2 - Information hierarchy

**Question:** What should the selected-state surface communicate, and how
should it fit GateReeve's narrower three-region desktop layout?

**Answer:** Explain what goes into the selected phase, what comes out, and
provide clickable links for artifacts that exist.

**Decision:** Give each state a selected-state kicker, a phase-specific title,
a one-sentence transformation description, and two compact groups: `Uses` and
`Produces`. Use a two-column desktop layout that stacks at constrained widths;
do not retain the reference card's phase-name third column because the panel
heading already supplies that context.

## D3 - Phase recipes

**Question:** Which durable artifacts and living repository context belong in
each phase recipe?

**Answer:** Follow the accumulated-context relationships in the supplied
Artifact Flow reference.

**Decision:** Use these recipes:

- Designing / Design synthesis uses `interview.md` and the existing codebase;
  it produces `design.md`.
- Specifying / Specification drafting uses `design.md`, `interview.md`, the
  existing codebase, and architecture contracts; it produces `spec.md`.
- Planning / Implementation planning uses `spec.md`, `design.md`,
  `interview.md`, repository structure, and tests and commands; it produces
  `plan.md`, `issues.md`, and `tracker.md`.

Artifact ordering communicates authority and accumulation: the controlling or
most immediate artifact appears first, followed by supporting artifacts and
then living source context.

## D4 - Artifact and source interaction

**Question:** Should all chips behave as links, and how should unavailable
artifacts be represented?

**Answer:** Existing artifacts should be clickable, while living context such
as the codebase is explanatory rather than a file link.

**Decision:** Resolve artifact chips by canonical artifact ID from the snapshot
inventory and open them through the existing unified inspector. Preserve the
current honest pending/unavailable inspector behavior for expected artifacts
that are not yet present, and disable only unsafe artifacts as the inventory
already requires. Render living sources as visually distinct, neutral,
non-interactive chips. Include accessible status text rather than relying on
color alone.

## D5 - State-selection behavior

**Question:** Should the new surface replace the current behavior where
selecting Designing, Specifying, or Planning opens that state's primary
artifact?

**Answer:** Preserve the existing behavior for the initial implementation;
the new links should supplement it.

**Decision:** State selection continues to open `design.md`, `spec.md`, or
`plan.md` as it does today. The phase-context surface gives direct access to
the other inputs and outputs without changing governed workflow state.

## D6 - Ownership and protocol boundary

**Question:** Does this presentation require new workflow-model metadata or a
protocol mutation?

**Answer:** No. It is explanatory desktop presentation over data GateReeve
already observes.

**Decision:** Keep the phase recipes in the renderer presentation layer and
join artifact IDs to the canonical snapshot inventory for path, status,
existence, and safety. Do not change the pinned workflow model, protocol core,
journal, arbitrary-path boundary, or IPC capabilities. A future model version
could own pluggable presentation metadata if GateReeve later supports multiple
workflow shapes.

## D7 - Delivery isolation

**Question:** How should this work remain separate from the active desktop file
actions feature?

**Answer:** Perform it in its own worktree and branch from main.

**Decision:** Deliver the feature from the dedicated
`tb-desktop-phase-context` branch and worktree, based directly on the freshly
fetched `origin/main` commit
`1220138bf4248a72c1717955c4f62e3f1cda0599`. Do not incorporate uncommitted or
feature-specific changes from `tb-desktop-file-actions`.

## Interview conclusion

The design is sufficiently resolved to synthesize. The strongest constraints
are that the surface remain selected-state-specific, read-only, compact beside
the docked sidebars, and backed by canonical artifact identities. The main
open risks are visual density at the minimum supported central-workspace width,
clear accessible differentiation between interactive artifacts and inert live
context, and avoiding duplicate or surprising inspector activation while
preserving the accepted state-selection behavior. These risks can be resolved
through renderer tests, accessibility assertions, and production-fixture
visual inspection rather than further product questioning.
