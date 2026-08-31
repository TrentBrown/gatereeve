# Decision Scratchpad - tb-desktop-file-actions

**Feature start:** 2026-08-31

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Keep renderer file capabilities narrow

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Desktop main/preload IPC and future file actions

The renderer may select only canonical artifact IDs and bounded editor/action
identifiers. Path resolution, editor bundle paths, dialogs, process launching,
and copies remain in the trusted main process.

**Triggered by:** Adding editor selection and filesystem-copy operations to the
existing read-only desktop boundary.

**Alternatives considered:**
- Pass executable and file paths from the renderer - rejected as unnecessary
  arbitrary authority.
- Expose a generic file-operation IPC method - rejected because exact methods
  are easier to validate and audit.
