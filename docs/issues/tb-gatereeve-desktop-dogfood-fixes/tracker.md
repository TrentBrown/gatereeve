# Branch Tracker - tb-gatereeve-desktop-dogfood-fixes

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-29

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Compatible Python selection | PASS | [#20](https://github.com/TrentBrown/gatereeve/pull/20) | Bounded compatibility-aware discovery, authoritative override behavior, and aggregated failure evidence pass focused and full Desktop tests |
| R2 | Approved masthead branding | PASS | [#20](https://github.com/TrentBrown/gatereeve/pull/20) | The approved Rolling Vale asset renders at 60px in the 88px masthead with an accessible label and packaged asset coverage |
| R3 | Stable Setup layout | PASS | [#20](https://github.com/TrentBrown/gatereeve/pull/20) | The shared Setup surface preserves the selected-worktree sidebar and adapts correctly through repeated navigation and minimum-size visual checks |
| R4 | Automatic artifact freshness | PASS | [#20](https://github.com/TrentBrown/gatereeve/pull/20) | Canonical fingerprint changes and manual refresh trigger ordered named reads for all viewer types, with HTML cache busting and no added polling |
| R5 | Resilient reading state | PASS | [#20](https://github.com/TrentBrown/gatereeve/pull/20) | Tests cover scroll restoration, near-bottom pinning, transient stale-content retention/recovery, and canonical removal |
| R6 | Safe Markdown fidelity | PASS | [#20](https://github.com/TrentBrown/gatereeve/pull/20) | Semantic DOM rendering covers strong, emphasis, links, code precedence, malformed input, identifiers, literal images, and the raw-HTML prohibition |
| R7 | Confined link navigation | PASS | [#20](https://github.com/TrentBrown/gatereeve/pull/20) | External, canonical-relative, and fragment links use narrow validated paths while unsafe, credentialed, unresolved, image, navigation, and popup targets remain denied |
| R8 | Trusted coordinated delivery | NOT YET | - | Planned for P8-P10 / I-8-I-10 |

## PR Log

### PR #20 - Desktop dogfooding product fixes

- **URL:** https://github.com/TrentBrown/gatereeve/pull/20
- **Scope:** Product delivery slice, `desktop-dogfood-product-pr20`
- **Plan steps:** P1-P7
- **Issues:** I-1-I-7
- **Rubric movement:** R1-R7 move to `PASS`; R8 remains `NOT YET` for
  post-merge Apple trust, coordinated publication, public Homebrew upgrade,
  and installed-Mac verification in P8-P10
- **Evidence:** [PR #20 packet](pr-20/boundary.json)
- **Boundary result:** Exact-source verification, scoped specification
  evaluation, independent judge, code review with no findings, decision
  triage, and explain-diff pass at pinned head
  `28a3971f33d11aaa76f4351057272d3e619f603e`; pattern review is not
  applicable because no scope is configured
- **Status:** Draft; I-1-I-7 are in review
