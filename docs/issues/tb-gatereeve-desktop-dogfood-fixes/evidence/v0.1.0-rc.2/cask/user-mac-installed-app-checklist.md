# User-Mac Installed-App Checklist

- **Application:** Homebrew-installed GateReeve Desktop `0.1.0-rc.2`
- **Observed feature:** PortReeve `tb-portreeve-apple-trust`
- **Reported by:** Trent Brown in the active conversation
- **Recorded at:** `2026-08-29T18:10:45Z`
- **Updated at:** `2026-08-29T18:17:11Z`

## Installed checks

| Check | Status | Evidence |
|---|---|---|
| AC1 - compatible Python discovery | PASS | The installed Setup view reports Python `3.14.7` as present and operational setup ready through Codex, rather than stopping at Apple's older Python. |
| AC2 - branded masthead icon | PASS | The installed application visibly displays the detailed Rolling Vale GateReeve artwork at the enlarged masthead size instead of the `GR` monogram. |
| AC3 - stable Setup sidebar | PASS | The screenshot shows the complete ordinary sidebar at stable width in Setup, and the user confirmed repeated Setup/Overview/Artifacts navigation preserves it. |
| AC4 - automatic/manual artifact refresh | PASS | The user confirmed that a selected PortReeve artifact re-rendered automatically after a legitimate file update without another selection click, and that manual Refresh retained the same selection. |
| AC5 - resilient artifact reading state | PASS | The user confirmed that automatic refresh remained pinned near the bottom when reading at the bottom and preserved the ordinary reading position when scrolled into the document. |
| AC6 - safe Markdown fidelity | PENDING | Requires visible strong, emphasis, code, and link-label rendering checks. |
| AC7 - confined link navigation | PENDING | Requires external, relative-artifact, and same-document fragment checks. |

## Additional visible evidence

- The Setup badge reports Desktop `0.1.0-rc.2`.
- Selected-agent readiness reports GateReeve Plugin `0.1.0-rc.2` as matched.
- Local and Git sources report current for the selected PortReeve worktree.

This partial checklist advances but does not complete R8; installed AC6-AC7
remain.
