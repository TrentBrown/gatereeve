# Design - tb-desktop-file-actions

**Status:** approved (gate passed 2026-08-31)

## Problem

The artifact viewer's current `Open` action hides what application will receive
the file and its overflow menu mixes only two incidental file operations. Users
need a coherent way to open a canonical artifact, choose an installed editor,
locate its source, open its GitHub representation, or save a copy.

## Intent

Make the artifact header a predictable file-action surface comparable to good
desktop development tools while preserving GateReeve's read-only, canonical
artifact security boundary.

## Chosen shape

Use a split `Open` button. The primary action opens through an explicitly
configured editor when present and otherwise through the operating-system
default. Its menu groups detected supported editors and the OS default,
application selection, local/GitHub location actions, save-copy actions, and
path copying.

Only installed editors appear. One-time editor selection does not silently
change the configured default. All renderer requests use a canonical artifact
ID and, where needed, a bounded editor identifier. Main-process code resolves
the artifact path and owns discovery, dialogs, copying, launching, and GitHub
URL derivation.

The current feature applies to local canonical artifacts. `Save to Downloads`
is used instead of the misleading `Download`; remote caching and download/open
semantics remain future work.

## Alternatives considered

- Keep `Open in Editor`: rejected because artifacts may use non-editor default
  applications and the label does not encompass the menu's broader actions.
- Make any one-time editor choice the new default: rejected as unpredictable.
- Enumerate every known editor regardless of installation: rejected because it
  creates dead actions and maintenance noise.
- Accept executable paths from the renderer: rejected because it weakens the
  existing narrow IPC capability boundary.

## Constraints

- Do not mutate canonical artifact files.
- Do not expose arbitrary filesystem paths or arbitrary command execution to
  the renderer.
- Preserve useful operation in environments where editor discovery, GitHub
  provenance, or native dialogs are unavailable.
- Keep the header usable at the right-panel widths supported by the desktop UI.

## Open risks

- Native editor launching and chooser behavior require macOS manual validation.
- GitHub links may be unavailable for untracked files, detached repositories,
  or non-GitHub remotes and must be omitted cleanly.

## Changes
