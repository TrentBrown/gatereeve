# Decisions - tb-gatereeve-desktop-dogfood-fixes

**Feature start:** 2026-08-29

Permanent record of decisions promoted from `scratchpad.md`.

---

## Remap the production brand route only inside the visual fixture

**Confidence:** HIGH

**Blast Radius:** apps/desktop/visual/index.html; renderer-only visual verification

Keep the production renderer URL as
`branding/gatereeve-rolling-vale.png` because the confined
`gatereeve-app` protocol serves that exact path. During visual-fixture document
assembly only, rewrite the brand image source to
`../assets/branding/gatereeve-rolling-vale.png` so ordinary HTTP can load the
repository asset. This does not broaden the packaged renderer protocol or add
the source asset to the renderer allow-list.

**Triggered by:** The P6 browser fixture reported a 404 for the newly packaged
Rolling Vale icon even though the production application-protocol route passed.

**Alternatives considered:**
Copy the icon into `renderer/` - rejected because it would duplicate the pinned
branding source and alter package contents. Broaden the application protocol
to serve `assets/` - rejected because the production route is already narrow
and correct. Ignore the visual 404 - rejected because it would make the
required fixture inspection misleading.

**Promoted:** 2026-08-29. PR: https://github.com/TrentBrown/gatereeve/pull/20.

---

## Keep the visual fixture synchronized with the sandboxed preload contract

**Confidence:** HIGH

**Blast Radius:** apps/desktop/visual/visual-fixture.js; renderer visual/runtime inspection

Extend the renderer-only fixture with inert deterministic implementations of
the current preload surface, including update observation and the newly added
external-link operation. The fixture remains non-mutating and performs no
network or operating-system action; its purpose is to let the production
renderer initialize for visual inspection.

**Triggered by:** P6 browser inspection showed renderer initialization
stopping before the selected-worktree fixture rendered because the fixture
lacked the existing update-discovery preload methods.

**Alternatives considered:**
Special-case missing methods in production renderer code - rejected because
packaged preload guarantees the contract and weakening it would hide real
integration errors. Skip selected-worktree visual inspection - rejected
because P6 explicitly requires the fixture.

**Promoted:** 2026-08-29. PR: https://github.com/TrentBrown/gatereeve/pull/20.

---

## Treat the product PR as a delivery slice before release closeout

**Confidence:** HIGH

**Blast Radius:** governed slice history and PR-boundary evaluation scope

Replace the mistakenly proposed `FEATURE_FINAL` product slice with an ordinary
`SLICE` boundary covering P1-P7 and R1-R7. Preserve the first attempt as an
abandoned audit record. The feature-final boundary remains reserved for the
post-merge P8-P10 work, when Apple trust, coordinated publication, public
Homebrew installation, and R8 can be evaluated alongside R1-R7 with zero
`NOT YET` criteria.

**Triggered by:** Formal spec-evaluation policy requires zero `NOT YET`
criteria at a `FEATURE_FINAL` boundary, while the approved plan deliberately
defers R8 until after this product PR merges.

**Alternatives considered:**
Pass the feature-final gate with R8 still `NOT YET` - rejected because it would
misrepresent incomplete release evidence. Mark R8 passed before signing and
publication - rejected because the evidence does not yet exist. Fold release
publication into the unmerged product PR - rejected because the approved plan
requires release artifacts to derive from merged `main` and requires a
separate publication approval.

**Promoted:** 2026-08-29. PR: https://github.com/TrentBrown/gatereeve/pull/20.
