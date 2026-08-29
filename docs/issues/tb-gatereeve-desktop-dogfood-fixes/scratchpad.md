# Decision Scratchpad - tb-gatereeve-desktop-dogfood-fixes

**Feature start:** 2026-08-29

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Remap the production brand route only inside the visual fixture

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** apps/desktop/visual/index.html; renderer-only visual verification

Keep the production renderer URL as branding/gatereeve-rolling-vale.png because the confined gatereeve-app protocol serves that exact path. During visual-fixture document assembly only, rewrite the brand image source to ../assets/branding/gatereeve-rolling-vale.png so ordinary HTTP can load the repository asset. This does not broaden the packaged renderer protocol or add the source asset to the renderer allow-list.

**Triggered by:** The P6 browser fixture reported a 404 for the newly packaged Rolling Vale icon even though the production app-protocol route passed.

**Alternatives considered:**
Copy the icon into renderer/ - rejected because it would duplicate the pinned branding source and alter package contents. Broaden the app protocol to serve assets/ - rejected because the production route is already narrow and correct. Ignore the visual 404 - rejected because it would make the required fixture inspection misleading.

## [2] Keep the visual fixture synchronized with the sandboxed preload contract

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** apps/desktop/visual/visual-fixture.js; renderer visual/runtime inspection

Extend the renderer-only fixture with inert deterministic implementations of the current preload surface, including update observation and the newly added external-link operation. The fixture remains non-mutating and performs no network or operating-system action; its purpose is to let the production renderer initialize for visual inspection.

**Triggered by:** P6 browser inspection showed renderer initialization stopping before the selected-worktree fixture rendered because the fixture lacked the existing update-discovery preload methods.

**Alternatives considered:**
Special-case missing methods in production renderer code - rejected because packaged preload guarantees the contract and weakening it would hide real integration errors. Skip selected-worktree visual inspection - rejected because P6 explicitly requires the fixture.
