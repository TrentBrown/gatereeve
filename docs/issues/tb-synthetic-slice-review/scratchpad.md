# Decision Scratchpad - tb-synthetic-slice-review

**Feature start:** 2026-09-28

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each review boundary; promoted
entries are appended to `decisions.md`.

## [1] Make the review transport a repository-scoped compatibility switch

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** workspace configuration, protocol model locks, all boundary adapters

`sliceBoundaryMode` defaults to `pull-request` and may be set to
`synthetic-commit` per configured repository. `releaseBranch` defaults to the
integration branch. The choice is pinned rather than treated as an ambient
runtime preference.

**Triggered by:** Quality Process needs hidden intermediate slice review while almost every other user expects PRs.

**Alternatives considered:**
- Global synthetic default - rejected because it changes existing behavior.
- Per-command flag only - rejected because agents could disagree within one feature.

## [2] Integrate the exact single-parent review commit

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** slice commit topology and integration-branch update mechanics

Synthetic mode uses squash semantics. The reviewed commit has the pinned
integration SHA as its sole parent and the finalized slice tree as its tree;
after acceptance that exact object advances integration.

**Triggered by:** a separate merge after review would weaken reviewed-content identity.

**Alternatives considered:**
- Two-parent merge commit - rejected for the primary mode because GitHub commit review is less clear and a separate review object would be required.
- Review source commit and create another squash commit later - rejected because the integrated SHA would not be the reviewed SHA.

## [3] Preserve historical PR boundary records while generalizing new terminology

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** protocol model, projections, snapshots, CLI/Desktop presentation, stored journals

New model locks use review-boundary vocabulary, but readers recognize historical
`PR_BOUNDARY` state and version-1 PR contexts and packets. Existing governed
features must not require migration merely to remain readable.

**Triggered by:** the new transport makes PR-specific vocabulary false for new slices while immutable historical journals already contain it.

**Alternatives considered:**
- Keep PR naming everywhere - rejected because it misrepresents synthetic boundaries.
- Rewrite old journals - rejected because workflow history is immutable.
