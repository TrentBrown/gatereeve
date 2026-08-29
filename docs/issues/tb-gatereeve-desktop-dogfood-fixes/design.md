# Design - tb-gatereeve-desktop-dogfood-fixes

**Status:** approved (gate passed 2026-08-29)

## Problem

First-use dogfooding of GateReeve Desktop on macOS exposed several related
failures in the application shell and artifact-reading experience:

- Setup accepts the first executable `python3` it finds and then checks its
  version. In a Finder-launched application this selects Apple's executable at
  `/usr/bin/python3` (Python 3.9.6) before the compatible Homebrew installation,
  leaving Setup incorrectly blocked after the user follows its installation
  advice.
- The masthead uses a generic `GR` monogram instead of GateReeve's approved
  application artwork, and Setup navigation removes the ordinary workspace in
  a way that collapses the sidebar into a visual remnant.
- GateReeve already observes feature-record filesystem changes and recomputes
  its canonical snapshot, but the artifact viewer does not remember or re-read
  the artifact currently on screen. An agent can append a decision to
  `interview.md` while the user continues seeing stale content.
- The intentionally safe Markdown renderer recognizes block structure and
  inline code but emits emphasis and links as literal punctuation. This makes
  ordinary workflow prose such as `**Feature start:**` visibly incorrect.

The fixes must reach the Mac where GateReeve is being dogfooded. A Desktop-only
publication would violate the existing explicit Desktop/Plugin compatibility
contract, so delivery is part of the problem rather than an unrelated
afterthought.

## Intent

Make GateReeve Desktop dependable as a live observer during the PortReeve
software lifecycle while retaining its narrow, read-only trust boundaries.
Setup should recognize an already-installed compatible Python, navigation and
branding should remain visually stable, the selected artifact should follow
file changes without disrupting the reader, and common textual Markdown should
render naturally without turning artifact content into executable HTML or an
unrestricted navigation surface.

Deliver the result as the next coordinated, Apple-trusted GateReeve release so
the public Homebrew installation path used for dogfooding is itself exercised.

## Chosen shape

### Compatibility-aware Python discovery

Keep GateReeve's established, de-duplicated and bounded executable candidate
list. When `GATEREEVE_PYTHON3_PATH` is set, treat that path as authoritative and
report its actual status; never silently override an explicit operator choice.
Without the override, probe Python candidates in their existing deterministic
order and choose the first executable whose reported version satisfies the
minimum of Python 3.10. Continue past missing, unprobeable, or older candidates
instead of stopping at the first executable. Do not scan the general
filesystem, and do not rank every installation to find the newest version.

Preserve useful evidence when no candidate passes so Setup can distinguish an
absent Python from installations that exist but are incompatible or cannot be
queried. Git, Node.js, GitHub CLI, and agent discovery retain their established
contracts unless shared refactoring is mechanically necessary and fully
covered by existing behavior tests.

### Stable shell, Setup layout, and branding

Replace the `GR` masthead monogram with the already-approved Rolling Vale asset
at `apps/desktop/assets/branding/gatereeve-rolling-vale.png`. Render it at 60px
square in an approximately 88px-tall masthead, with accessible GateReeve
labelling and without generating or introducing replacement artwork.

Use one Setup content implementation in two layout contexts:

- With a selected worktree, Setup occupies the ordinary workspace content
  region while the complete sidebar remains visible at its stable width.
- With no selected worktree, Setup remains the full-width onboarding surface.

Switching between Setup and Overview, Artifacts, History, or other workspace
views must not resize, partially hide, or strand the sidebar.

### Selection-aware artifact refresh

Make the artifact viewer retain the selected canonical artifact ID and its
`modifiedAt`/`size` fingerprint. Reuse the existing debounced feature-record
watcher and canonical snapshot publication. When a new snapshot changes that
fingerprint, re-read the exact selected named artifact and re-render it without
requiring another click. Application-focus refresh and a viewer-level Refresh
button provide bounded recovery paths; do not add continuous polling.

Use a monotonically increasing request identity or equivalent guard so a slow,
older asynchronous read cannot replace a newer selection or refresh. Cache-bust
the named HTML-artifact frame when its canonical fingerprint changes.

Before re-rendering, capture the viewer's reading state. Readers near the
bottom remain pinned to the bottom so appended decisions become visible;
otherwise restore the prior scroll position within the new document's bounds.
Apply the same behavior to automatic and manual refreshes.

If a re-read fails transiently, retain the last successfully rendered content,
mark it as potentially stale, explain the failure, and leave manual Refresh
available. If the artifact leaves the canonical inventory, clear its selection
and content and explain that it is no longer available. Never turn refresh into
an arbitrary path read.

### Safe inline Markdown fidelity

Extend the existing semantic, text-node-based renderer rather than inserting
artifact-generated HTML. Inline code has first precedence, and fenced code is
never reparsed. In ordinary inline content, construct semantic DOM elements for:

- strong emphasis using `**...**` and `__...__`;
- emphasis using `*...*` and `_..._`; and
- Markdown links.

Do not treat intraword underscores as delimiters, so identifiers such as
`feature_id` remain literal. Unsupported or malformed markup falls back to
visible text. Markdown image syntax remains literal and must never initiate a
local or remote image load.

Links obey an explicit navigation policy. Absolute `http:` and `https:` links
open in the system browser through a narrow IPC operation validated in the
preload and main process. Relative targets resolve only to artifacts present in
the current canonical inventory and select that artifact in GateReeve. Fragment
targets scroll within the current artifact. `javascript:`, `file:`, unknown
schemes, and unresolved relative targets remain inert. The GateReeve renderer
continues denying direct navigation and popup windows.

### Coordinated release and Mac dogfooding

Prepare Desktop and the GateReeve plugin as the exact coordinated
`v0.1.0-rc.2` release, even though the product-code changes are Desktop-focused.
Use the repository's existing coordinated preparation, signing, notarization,
stapling, verification, smoke, and publication-plan machinery. Recheck the live
tag and release namespace immediately before publication and never overwrite a
pre-existing version.

Hosted publication and Homebrew cask mutation require a separate explicit user
approval after the exact release evidence and plan are available. Verify the
signed/notarized DMG, publish the approved coordinated artifacts, update the
public cask, and complete the feature by upgrading through that cask on the
user's Mac and confirming the corrected behaviors in the installed app.

## Alternatives considered

- Keep using `GATEREEVE_PYTHON3_PATH` as the normal remedy. Rejected because the
  Setup guidance promises that installing Python is sufficient and the app can
  deterministically identify a compatible candidate without user-specific
  configuration.
- Select the newest Python or search the whole filesystem. Rejected because the
  prerequisite has a minimum, not a newest-version requirement, and bounded
  deterministic discovery is more predictable and auditable.
- Always replace the workspace with a full-width Setup page. Rejected because
  it causes the observed navigation instability and unnecessarily removes
  context after a worktree has been selected.
- Poll artifact files continuously. Rejected because filesystem events,
  application-focus refresh, and an explicit viewer refresh already form three
  bounded paths over the canonical observer.
- Render Markdown through raw `innerHTML`, load images, or permit generic file
  links. Rejected because these weaken the renderer isolation and named-artifact
  boundaries for presentation features that can be built with semantic DOM
  nodes.
- Publish only a new Desktop and declare it compatible with the old plugin.
  Rejected because GateReeve's release verifier and Setup intentionally require
  an explicit coordinated pair, and weakening that contract would expand this
  bug-fix feature into release-model redesign.
- Validate only a directly installed DMG. Rejected because the public Homebrew
  cask is the user's normal installation and update path and therefore part of
  the dogfooding outcome.

## Constraints

- GateReeve Desktop remains an observational, read-only protocol consumer. The
  feature must not append workflow events, authorize implementation, or create
  another interpretation of canonical state.
- Artifact reads remain limited to IDs emitted by the canonical inventory.
  Renderer content cannot nominate arbitrary filesystem paths.
- Context isolation, renderer sandboxing, denied window navigation/popups, the
  restrictive IPC allow-list, and text-node-based artifact rendering remain
  in force.
- Existing approved artwork is reused; no generated branding asset or new
  visual identity enters the release.
- No continuous background service or unbounded discovery/polling mechanism is
  introduced.
- Implementation begins only after the governed design and specification gates
  pass. Release publication and cask mutation require their later explicit
  approval even after implementation is authorized.
- Version-control work remains on the topic branch. No `development*` branch is
  merged or rebased into this or any other branch.

## Open risks

- macOS filesystem events may be coalesced or briefly observe a file during an
  atomic replacement. Focus refresh, manual refresh, stale-content retention,
  and request ordering limit the user impact but do not make `fs.watch` a
  transactional stream.
- A `modifiedAt`/`size` fingerprint can theoretically miss content rewritten
  to the same size at indistinguishable timestamp precision. Tests must confirm
  the actual platform metadata precision and document the bounded fallback.
- Scroll restoration is approximate when formatting changes content height
  substantially; the near-bottom rule must be tested separately from absolute
  position preservation.
- The inline renderer remains a deliberately small Markdown subset, not a full
  CommonMark implementation. Delimiter precedence, malformed input, nested
  text, unsafe targets, and literal image syntax need focused regression tests.
- This Linux worktree cannot itself prove Finder launch behavior, Apple trust,
  or Homebrew installation. Hosted macOS evidence and final verification on the
  user's Mac are required before completion.
- `v0.1.0-rc.2` was free when selected but is external mutable state until
  publication; the release flow must revalidate it before creating tags or
  releases.

## Changes

- None.
