# Branch Tracker - gatereeve-desktop-distribution

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-27

**Active slice:** Private update discovery and Early Access surfaces P7 / I-6
are in review in PR [#15](https://github.com/TrentBrown/gatereeve/pull/15) from
`gatereeve-desktop-distribution-06-update-discovery`. PR
[#14](https://github.com/TrentBrown/gatereeve/pull/14) merged the flat trusted
bundle as commit `5b66b98` on `main`. Protected nonpublishing rehearsal run
[#33144709211](https://github.com/TrentBrown/gatereeve/actions/runs/33144709211)
then passed Developer ID signing, Apple notarization, stapling, Gatekeeper,
flat trusted upload, native ARM64 and Intel verification, credential cleanup,
and immutable trusted coordinated-record assembly. Its prepared record remains
unapproved with every publication surface pending; P6 / I-5 and I-11 are
closed, and no tag or GitHub release was created.

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Native identity and universal DMG | NOT YET | [#9](https://github.com/TrentBrown/gatereeve/pull/9) | Rolling Vale branding, permanent bundle identity, conventional DMG, universal binary inspection, and exact-byte ARM/Intel launch pass for the ad-hoc candidate; trusted public RC and final verification remain P8 and P10 |
| R2 | Packaged runtime independence | PASS | [#7](https://github.com/TrentBrown/gatereeve/pull/7), [#9](https://github.com/TrentBrown/gatereeve/pull/9) | JavaScript/Python resolver parity, Python-free staging, Finder-compatible discovery, Ubuntu regression coverage, and the same mounted packaged bytes observing a real governed fixture without external Node, Python, or CLI pass on ARM and Intel |
| R3 | Setup and readiness | PASS | [#8](https://github.com/TrentBrown/gatereeve/pull/8) | Persistent selected-agent Setup, bounded read-only adapters, native remediation, recheck, one-of-selected readiness, unavailable-state honesty, and historical/offline presentation pass local and exact-head hosted verification |
| R4 | Compatibility governance | PASS | [#8](https://github.com/TrentBrown/gatereeve/pull/8) | Exact project-controlled matched/compatible/incompatible pairs, tested skew, update guidance, and fail-closed unknown or unreported versions pass matrix and UI verification |
| R5 | Apple trust | NOT YET | [#11](https://github.com/TrentBrown/gatereeve/pull/11), [#14](https://github.com/TrentBrown/gatereeve/pull/14) | Enrollment, protected credentials, Developer ID signing, notarization, stapling, Gatekeeper, cleanup, and trusted ARM/Intel rehearsal pass; the trusted public RC and final verification remain P8 and P10 |
| R6 | Coordinated release and recovery | NOT YET | [#10](https://github.com/TrentBrown/gatereeve/pull/10), [#14](https://github.com/TrentBrown/gatereeve/pull/14) | Immutable identity, pre-publication preparation, exact approval guard, ordered recovery, stable-source proof, and trusted record assembly pass; live protected publication and final verification remain P8 and P10 |
| R7 | RC publication and update behavior | NOT YET | [#15](https://github.com/TrentBrown/gatereeve/pull/15) | Fixed bounded manifest discovery, 24-hour persistence, RC/stable isolation, quiet failure, notification-only Desktop UI, and unresolved trust-gated Early Access presentation are implemented and under review; live approved publication and final verification remain P8 and P10 |
| R8 | Cask distribution | NOT YET | - | P9, P10 / I-8 |

## PR Log

Append PR boundary entries here.

### PR #7 - Self-contained runtime foundation

- **URL:** https://github.com/TrentBrown/gatereeve/pull/7
- **Scope:** Delivery boundary 1, runtime foundation
- **Plan steps:** P1, P2
- **Issues:** I-1
- **Rubric movement:** R2 advances but remains `NOT YET` until P4 executes the
  same governed-fixture contract against the universal packaged application
- **Evidence:** [PR #7 packet](pr-7/boundary.json)
- **Boundary result:** Attempt 1 passes exact-head verification, scoped
  specification evaluation, independent judge with bounded packaged-runtime
  concerns, code review with no findings, decision triage, explain-diff, and
  all ten GitHub checks; pattern review is not applicable because no scope is
  configured
- **Status:** Merged; I-1 is closed

### PR #8 - Setup and compatibility

- **URL:** https://github.com/TrentBrown/gatereeve/pull/8
- **Scope:** Delivery boundary 2, Setup and compatibility
- **Plan steps:** P3
- **Issues:** I-2
- **Rubric movement:** R3 and R4 move to `PASS`
- **Evidence:** [PR #8 packet](pr-8/boundary.json)
- **Boundary result:** Attempt 1 passes exact-head verification, scoped
  specification evaluation, independent judge, code review after resolving
  three pre-pin findings, decision triage, explain-diff, and all ten GitHub
  checks; pattern review is not applicable because no scope is configured
- **Status:** Merged; I-2 is closed

### PR #9 - Identity and universal DMG

- **URL:** https://github.com/TrentBrown/gatereeve/pull/9
- **Scope:** Delivery boundary 3, identity and universal DMG
- **Plan steps:** P4
- **Issues:** I-3
- **Rubric movement:** R2 moves to `PASS`; R1 advances with complete candidate
  identity, branding, DMG, architecture, and native runtime evidence but remains
  `NOT YET` until trusted public RC and final verification
- **Evidence:** [PR #9 packet](pr-9/boundary.json)
- **Boundary result:** Attempt 1 passes exact-head verification, scoped
  specification evaluation, independent judge, code review with no findings,
  decision triage, explain-diff, and all twelve GitHub CI jobs; pattern review
  is not applicable because no scope is configured
- **Status:** Merged; I-3 is closed

### PR #10 - Coordinated release and recovery

- **URL:** https://github.com/TrentBrown/gatereeve/pull/10
- **Scope:** Delivery boundary 4, coordinated release and recovery
- **Plan steps:** P5
- **Issues:** I-4
- **Rubric movement:** R6 advances with an immutable two-surface record,
  pre-publication preparation, exact approval binding, stable-source proof, and
  idempotent recovery tests, but remains `NOT YET` until trusted live
  publication and final verification
- **Evidence:** [PR #10 packet](pr-10/boundary.json)
- **Boundary result:** Exact-head verification, scoped specification
  evaluation, judge, code review after remediating record-invariant findings,
  decision triage, explain-diff, and hosted CI pass; pattern review is not
  applicable because no scope is configured
- **Status:** Merged; I-4 is closed

### PR #11 - Apple trust boundary

- **URL:** https://github.com/TrentBrown/gatereeve/pull/11
- **Scope:** Delivery boundary 5, Apple trust boundary
- **Plan steps:** P6
- **Issues:** I-5
- **Rubric movement:** R5 and R6 advance with executed maintainer setup,
  protected ephemeral signing/notarization, exact trust evidence, native
  re-verification, and fail-closed publication guards, but remain `NOT YET`
  until the protected rehearsal, direct public RC, and final verification
- **Evidence:** [PR #11 packet](pr-11/boundary.json)
- **Boundary result:** Exact-head implementation verification, scoped
  specification evaluation, independent judge with the declared live-service
  concern, code review with no findings, decision triage, explain-diff, and
  hosted CI pass; pattern review is not applicable because no scope is
  configured
- **Status:** Merged; I-5 remains open through the post-merge nonpublishing
  protected rehearsal and I-9 follow-up

### PR #12 - Signing keychain discoverability

- **URL:** https://github.com/TrentBrown/gatereeve/pull/12
- **Scope:** Apple trust boundary P6 / I-9 follow-up
- **Plan steps:** P6
- **Issues:** I-9
- **Rubric movement:** R5 and R6 remain `NOT YET`; the fix enables the protected
  rehearsal to continue from identity validation into real Developer ID signing
- **Evidence:** [PR #12 packet](pr-12/boundary.json)
- **Boundary result:** Exact-head workflow-contract verification, feature-doc
  validation, independent judge, code review with no findings, explain-diff,
  and all thirteen hosted checks pass; pattern review is not applicable because
  no scope is configured
- **Status:** Merged; I-9's keychain repair passed its live boundary, while the
  broader rehearsal continues through I-10

### PR #13 - Isolated trusted-package result

- **URL:** https://github.com/TrentBrown/gatereeve/pull/13
- **Scope:** Apple trust boundary P6 / I-10 follow-up
- **Plan steps:** P6
- **Issues:** I-10
- **Rubric movement:** R5 and R6 remain `NOT YET`; the correction preserves the
  successfully signed package result for notarization and trusted verification
- **Evidence:** [PR #13 packet](pr-13/boundary.json)
- **Boundary result:** Exact-head Desktop and workflow-contract verification,
  feature-doc validation, independent judge, code review with no findings,
  explain-diff, and hosted checks pass; pattern review is not applicable because
  no scope is configured
- **Status:** Merged; I-10's dedicated result channel passed its live boundary
  through signing and notarization, while the broader rehearsal continues
  through I-11

### PR #14 - Flat trusted artifact bundle

- **URL:** https://github.com/TrentBrown/gatereeve/pull/14
- **Scope:** Apple trust boundary P6 / I-11 follow-up
- **Plan steps:** P6
- **Issues:** I-11
- **Rubric movement:** R5 and R6 remain `NOT YET`; the change preserves the
  notarized DMG and exact trust evidence while giving native verification and
  coordinated-record assembly their stable flat download contract
- **Evidence:** [PR #14 packet](pr-14/boundary.json)
- **Boundary result:** Exact-head workflow-contract verification, feature-doc
  validation, specification evaluation, independent judge, code review with no
  findings, decision triage, explain-diff, and hosted checks pass; pattern
  review is not applicable because no scope is configured
- **Status:** Merged; protected rehearsal
  [#33144709211](https://github.com/TrentBrown/gatereeve/actions/runs/33144709211)
  passes the complete nonpublishing P6 path, so I-5 and I-11 are closed

### PR #15 - Private update discovery

- **URL:** https://github.com/TrentBrown/gatereeve/pull/15
- **Scope:** Delivery boundary 7, private update discovery and Early Access
  surfaces
- **Plan steps:** P7
- **Issues:** I-6
- **Rubric movement:** R7 advances with fixed, bounded, identifier-free manifest
  discovery, exact RC/stable selection, persistent 24-hour throttling, manual
  freshness, quiet failure, fixed GitHub-tag navigation, notification-only UI,
  and a website surface that remains unresolved without trusted release
  evidence; R7 remains `NOT YET` until P8 publishes and proves the approved RC
  and P10 completes final verification
- **Evidence:** [PR #15 packet](pr-15/boundary.json)
- **Boundary result:** Exact-head workflow-contract verification, feature-doc
  validation, specification evaluation, independent judge, code review with no
  findings, decision triage, explain-diff, and all hosted checks pass; pattern
  review is not applicable because no scope is configured
- **Status:** Boundary complete; I-6 is in review
