# Design - tb-gatereeve-release-artifact-integrity

**Status:** approved (gate passed 2026-08-31)

## Problem

RC.5 exposed a release-integrity gap after its protected Apple trust work had
already succeeded. GitHub artifact transport omitted intentionally hidden
Plugin files, including the marketplace catalogs, package manifests, and build
provenance. Preparation and finalization nevertheless accepted and sealed the
309-file incomplete tree. Primary publication created the immutable RC.5 tag,
force-updated the mutable marketplace branch, then correctly failed remote
verification before publishing the Desktop release or later surfaces.

The marketplace branch has been explicitly restored to the last verified RC.2
commit. RC.5, its tag, retained trusted DMG, and notarization request remain
immutable failed-attempt evidence. Retrying RC.5 cannot repair the sealed
packet and would violate the release identity and exact-byte contracts.

## Intent

Make GateReeve's existing directory-based Plugin candidate survive every
hosted artifact boundary exactly, prove that preservation before Apple trust
production, and reject any incomplete or changed tree before finalization or
public mutation. Then publish a fresh RC.6 through the corrected governed
lifecycle and prove the user installation path through both the direct public
DMG and Homebrew Cask.

## Chosen shape

1. Preparation composes the Plugin marketplace tree once. Before its first
   upload, it creates a companion integrity manifest outside the publishable
   tree containing every relative path, byte count, SHA-256 digest, and one
   deterministic aggregate tree digest.
2. Every GitHub artifact upload that carries the Plugin candidate explicitly
   includes intentionally hidden files. Upload paths remain narrowly scoped to
   generated release-packet directories and never include a checkout, `.git`,
   credentials, or runner-global state.
3. A nonpublishing round-trip job downloads the first candidate artifact and
   requires exact agreement with the producer manifest. Apple signing and
   notarization depend on this successful verification, so transport loss
   cannot consume a candidate identity first.
4. Trust-record assembly, read-only finalization, protected publication
   rehearsal, real primary publication, and any packet handoff needed by Cask
   finalization revalidate the same full-tree commitment. Required hidden
   surfaces are also checked semantically; a matching byte inventory alone
   must not make a malformed marketplace valid.
5. Publication continues to consume retained exact bytes and never rebuilds
   the Plugin tree. A mismatch fails closed before public mutation. Existing
   ordered receipts, bounded same-packet recovery, approval boundaries, and
   immutable-history rules remain in force.
6. The correction is delivered through a normal reviewed PR from clean
   `origin/main`. After merge and green mainline CI, a fresh RC.6 runs the full
   protected trust, finalization, rehearsal, and separately approved primary
   publication lifecycle.
7. Feature acceptance then requires direct installation and successful launch
   of the exact public RC.6 DMG on the user's Mac, followed by separately
   approved linked Homebrew Cask publication and a successful Homebrew install
   or upgrade to RC.6.

## Alternatives considered

- **Retry or repair RC.5:** Rejected because RC.5 already has an immutable tag,
  Apple request history, and a sealed packet that committed to the incomplete
  tree.
- **Check only known hidden paths:** Rejected because it would catch this
  incident but not arbitrary future file loss or alteration.
- **Rebuild the Plugin during finalization or publication:** Rejected because
  it would replace retained exact-byte authority with build reproducibility.
- **Introduce a tar or ZIP transport format:** Rejected for this correction.
  Explicit hidden-file transport plus a full-tree commitment closes the defect
  without changing packet topology or adding extraction semantics.
- **Apply RC.6 publication acceptance to every GateReeve feature:** Rejected.
  The public release and Mac installation evidence are specific to this
  corrective release feature.

## Constraints

- Preserve RC.5 and all earlier published or failed release history; do not
  delete, move, reuse, or retarget their tags or notarization identities.
- Retain GateReeve's universal DMG and coordinated Plugin/Desktop topology.
- Preserve separate `release-trust` and `release-publication` authority. Do not
  move, copy, expose, rotate, or delete Apple or publication credentials as
  part of this fix.
- Never merge or rebase a `development` or `development-*` branch into this
  topic, `main`, or another deployed-stage branch.
- Keep implementation repository-local. Do not change PortReeve, introduce a
  shared runtime, add PortReeve CLI/service topology, or require a bare-CLI
  Gatekeeper surface.
- Do not use generic workflow reruns after protected trust production begins.
  Use only the designed retained-byte recovery paths and exact approved plans.
- No UI work is expected.

## Open risks

- Hidden-file inclusion must remain scoped to generated packet roots so that
  broad artifact uploads cannot accidentally capture secrets or checkout
  metadata.
- Workflow contract tests must cover every relevant upload and download
  boundary; missing one later handoff could reproduce the defect after an
  earlier validation passes.
- RC.6 operational acceptance depends on hosted macOS runners, protected
  environment approvals, and final user Mac installation evidence.
- Linked Cask publication may require separately configured publication-token
  authority; its value must never be exposed to the agent or trust jobs.

## Changes

None.
