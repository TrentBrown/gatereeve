# Interview - tb-desktop-file-actions

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

## Settled direction

- Replace the narrowly labeled editor button with a split `Open` control.
- The primary action opens the canonical local artifact with a configured
  editor when one is selected, otherwise with the operating-system default.
- The menu lists supported editors only when they are installed, plus the
  default application and an application chooser.
- File-location actions are `Show in Finder` and `Open on GitHub`; GitHub is
  available only when the file can be resolved to a GitHub remote and tracked
  repository-relative path.
- Copy actions are `Save As...` and `Save to Downloads`. The latter describes
  the local operation accurately; `Download` is reserved for a future remote
  artifact model.
- Existing `Copy path` remains available. Copying rendered/source contents
  remains the dedicated toolbar icon.
- Editor preference is device-local and explicit. Choosing an editor for one
  open does not silently change the default.
- Renderer IPC remains capability-based: callers supply a canonical artifact
  ID and a bounded editor ID, never an arbitrary path or shell command.

## Local and remote semantics

This implementation covers GateReeve Desktop's current local canonical
artifacts. A future cloud-only artifact may download to an application cache
before opening, but that behavior and UI are out of scope until the product has
a remote artifact contract.

## Concrete UI shape

The primary button reads `Open`. Its icon/tooltip/accessible label identify the
resolved application when known. The dropdown is grouped into `Open with`,
`File location`, `Save a copy`, and utility actions. Unsupported or
unresolvable actions are omitted rather than failing after selection.

## Open risks

- Application discovery and chooser behavior are macOS-specific in the current
  packaged product and must degrade safely in test/Linux environments.
- GitHub URLs must be derived without assuming a single remote URL syntax or
  exposing untracked paths.
- The native Electron runtime cannot launch in the current Linux workspace, so
  final macOS chooser/editor handoff needs a short manual smoke test.
