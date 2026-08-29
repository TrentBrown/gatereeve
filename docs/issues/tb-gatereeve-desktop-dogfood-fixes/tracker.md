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
  triage, and explain-diff pass for product source
  `28a3971f33d11aaa76f4351057272d3e619f603e`; the synchronized reviewed PR
  head was `153e84569629cf495e397eee80ac354f793c19eb`. Pattern review is not
  applicable because no scope is configured
- **Status:** Merged into `main` as
  `1b7c7e519c90a13d140f59c65e0304bb78000753`; governed merge recorded

### Release preparation - Coordinated `v0.1.0-rc.2` rehearsal

- **Run:**
  [#33234514595](https://github.com/TrentBrown/gatereeve/actions/runs/33234514595)
- **Source:** Exact merged `main` commit
  `1b7c7e519c90a13d140f59c65e0304bb78000753`
- **Namespace preflight:** No `v0.1.0-rc.2` tag and no GitHub release existed
  immediately before dispatch
- **Completed evidence:** Plugin candidate, universal Desktop candidate, and
  native ARM64/Intel candidate verification passed
- **Apple trust:** Developer ID signing, hardened runtime, secure timestamp,
  accepted notarization, validated staple, Gatekeeper assessment, and
  credential cleanup passed
- **Trusted native verification:** ARM64 and Intel both passed against DMG
  SHA-256 `ec50610dfbeffe9bf0004f313e1413ae6d62c58a88cc3b0fa2c25b30b280754f`
- **Publication:** The exact approved plan SHA-256
  `88b18713d9d91d9d98bb5068d11faf2f235bf172e2b0120bcd327d363612eb76`
  completed all five surfaces: tag, Plugin marketplace, signed Desktop
  prerelease, manifest [PR #22](https://github.com/TrentBrown/gatereeve/pull/22)
  at merge `b3adff3c4551ee090967885b3051c23a2ae0adb2`, and Early Access website
- **Homebrew sequencing:** Exact cask packet and dry run move to P9 because the
  cask contract requires direct installation of the exact published DMG
- **Direct installation:** Trent Brown confirmed the exact public DMG on macOS
  at `2026-08-29T15:45:56Z`; the resulting Cask packet is bound to plan SHA-256
  `53095d7e4eafdbb596a694eb670cc5d676bf6b00532a3e8f448ac3c04181974c`
- **Cask preflight:** The live read-only dry run accepts only the exact target
  or a canonical, strictly older Cask whose public release asset digest
  matches; the existing `v0.1.0-rc.1` tap satisfies that invariant
- **Current boundary:** R8 remains `NOT YET` until separately approved Homebrew
  publication, public-cask upgrade, and installed-app verification

### PR #21 - Trusted release preparation evidence

- **URL:** https://github.com/TrentBrown/gatereeve/pull/21
- **Scope:** Release-preparation slice, `desktop-dogfood-release-preparation`
- **Plan steps:** P8
- **Issues:** I-8
- **Rubric movement:** R8 remains `NOT YET`; this PR supplies its
  prepublication trust and plan evidence, while public installation remains P9
- **Evidence:** [PR #21 packet](pr-21/boundary.json)
- **Boundary result:** Verification, scoped specification evaluation,
  independent judge, code review with no findings, decision triage,
  explain-diff, and packet validation pass against evaluated source
  `36612073d888b33119a7012a6e2f881069d3002d`; pattern review is not
  applicable because no scope is configured
- **Status:** Merged into `main` as
  `44ec46123726393fc25be5a540be3021ac259d35`; governed merge recorded and I-8
  closed

### PR #23 - Verified Homebrew Cask upgrade preflight

- **URL:** https://github.com/TrentBrown/gatereeve/pull/23
- **Scope:** Publication-and-dogfood slice,
  `desktop-dogfood-publication-and-dogfood`
- **Plan steps:** P9
- **Issues:** I-9
- **Rubric movement:** R8 remains `NOT YET`; this intermediate PR reviews the
  direct-install proof, exact Cask packet, and fail-closed upgrade-predecessor
  validation before the separate public Cask approval
- **Evidence:** [PR #23 packet](pr-23/boundary.json)
- **Boundary result:** Pending
- **Status:** Draft review
