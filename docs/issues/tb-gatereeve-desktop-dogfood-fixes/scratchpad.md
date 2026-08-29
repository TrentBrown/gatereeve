# Decision Scratchpad - tb-gatereeve-desktop-dogfood-fixes

**Feature start:** 2026-08-29

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Remap the production brand route only inside the visual fixture

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** apps/desktop/visual/index.html; renderer-only visual verification

Keep the production renderer URL as branding/gatereeve-rolling-vale.png because the confined gatereeve-app protocol serves that exact path. During visual-fixture document assembly only, rewrite the brand image source to ../assets/branding/gatereeve-rolling-vale.png so ordinary HTTP can load the repository asset. This does not broaden the packaged renderer protocol or add the source asset to the renderer allow-list.

**Triggered by:** The P6 browser fixture reported a 404 for the newly packaged Rolling Vale icon even though the production app-protocol route passed.

**Alternatives considered:**
Copy the icon into renderer/ - rejected because it would duplicate the pinned branding source and alter package contents. Broaden the app protocol to serve assets/ - rejected because the production route is already narrow and correct. Ignore the visual 404 - rejected because it would make the required fixture inspection misleading.

## [2] Keep the visual fixture synchronized with the sandboxed preload contract

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** apps/desktop/visual/visual-fixture.js; renderer visual/runtime inspection

Extend the renderer-only fixture with inert deterministic implementations of the current preload surface, including update observation and the newly added external-link operation. The fixture remains non-mutating and performs no network or operating-system action; its purpose is to let the production renderer initialize for visual inspection.

**Triggered by:** P6 browser inspection showed renderer initialization stopping before the selected-worktree fixture rendered because the fixture lacked the existing update-discovery preload methods.

**Alternatives considered:**
Special-case missing methods in production renderer code - rejected because packaged preload guarantees the contract and weakening it would hide real integration errors. Skip selected-worktree visual inspection - rejected because P6 explicitly requires the fixture.

## [3] Treat the product PR as a delivery slice before release closeout

[x] **Promote**

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

## [4] Defer exact Homebrew packet until direct-install proof exists

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** P8 and P9 sequencing, release evidence, and Homebrew cask publication

Treat the coordinated Apple-trusted packet and coordinated publication dry run as the complete prepublication output of P8. Generate the exact Homebrew cask record, plan, and dry run in P9 only after explicit public-release approval, coordinated publication, and direct installation of the exact published DMG on the user Mac. This preserves the approved no-publication boundary and does not fabricate installation evidence; R8 remains NOT YET until public Homebrew upgrade and installed-app verification pass.

**Triggered by:** The repository-owned prepare-cask command requires a passed direct installation confirmation, while the trusted RC remains intentionally unpublished during P8.

**Alternatives considered:**
Fabricate or predate direct-install evidence — rejected because it breaks the cask trust contract; publish during P8 — rejected because the approved plan requires a separate release boundary; weaken prepare-cask — rejected because no product defect requires changing the proven release engine.

## [5] Resume coordinated publication only after the generated manifest PR is clean

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Coordinated publication recovery, generated manifest PR #22, and public release receipts

Preserve the publisher's fail-closed mergeability guard when the generated
manifest PR is temporarily `UNSTABLE`. Wait for the exact PR head's required
checks, then rerun the same approved release record and plan digest. The retry
must retain completed tag, marketplace, and prerelease receipts and resume at
the pending manifest surface.

**Triggered by:** The first approved publication attempt safely stopped while
PR #22's packaged-runtime checks were still running; the PR became `CLEAN`
after both architectures passed, and the idempotent retry completed publication.

**Alternatives considered:**
Merge PR #22 manually while checks are pending — rejected because it bypasses
the publisher's exact clean-merge guard. Delete and recreate published surfaces
— rejected because the release record requires convergent recovery without
replacing immutable public identities. Generate a new plan — rejected because
the existing approved plan and bytes remained unchanged.

## [6] Permit only canonical predecessor Cask bytes during an upgrade

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Homebrew Cask publication preflight, RC upgrades, and public tap overwrite protection

When `Casks/gatereeve.rb` already exists, accept it as an upgrade predecessor
only if it exactly matches GateReeve's canonical generated Cask template and
its semantic version is strictly older than the prepared target. Continue to
accept exact target bytes for idempotent recovery. Reject equal-version
different bytes, newer versions, malformed content, alternate URLs or hashes,
and any noncanonical Cask before creating a publication pull request. Compare
all semantic-version numeric identifiers without JavaScript number-precision
loss, preserving the existing release contract for arbitrarily large values.

**Triggered by:** The `v0.1.0-rc.2` cask dry run rejected the valid published
`v0.1.0-rc.1` Cask as merely "different bytes," making the proven upgrade path
unpublishable even though P9 and AC8 require installation and upgrade smoke.

**Alternatives considered:**
Allow any differing existing bytes — rejected because it would weaken the
tap overwrite guard. Require manually deleting the predecessor — rejected
because it destroys public history and prevents normal Homebrew upgrades.
Special-case only `rc.1` to `rc.2` — rejected because the release engine must
support the same safe invariant for later RC and stable updates.
