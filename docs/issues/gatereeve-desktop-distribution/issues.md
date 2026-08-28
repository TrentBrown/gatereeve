# Issues - gatereeve-desktop-distribution

**Feature:** `gatereeve-desktop-distribution`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-27

Operational task breakdown derived from the plan.

This personal project has no external Tree task. These issues are the cumulative
operational record across sequential delivery branches.

## I-1 - Self-contained packaged observation

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P1, P2
- **Rubric criteria:** R2
- **Depends on:** none
- **PR:** [#7](https://github.com/TrentBrown/gatereeve/pull/7)

Replace Desktop's Python context boundary with parity-tested shared JavaScript,
make optional executable discovery honest under Finder launch, and add hermetic
governed-fixture smoke infrastructure plus Ubuntu regression coverage. Exact
packaged-byte execution is completed by I-3.

## I-2 - Setup and compatibility surface

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P3
- **Rubric criteria:** R3, R4
- **Depends on:** I-1
- **PR:** [#8](https://github.com/TrentBrown/gatereeve/pull/8)

Implement persistent selected-agent readiness, supported read-only adapters,
remediation guidance, historical/offline access, and evidence-backed version
compatibility states.

## I-3 - Product identity and universal DMG

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P4
- **Rubric criteria:** R1, R2
- **Depends on:** I-1, I-2
- **PR:** [#9](https://github.com/TrentBrown/gatereeve/pull/9)

Create and select the GateReeve icon, establish the permanent macOS identity,
and package and inspect one native universal drag-to-Applications DMG.

## I-4 - Coordinated release and recovery

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P5
- **Rubric criteria:** R6
- **Depends on:** I-3
- **PR:** [#10](https://github.com/TrentBrown/gatereeve/pull/10)

Bind Plugin and Desktop candidates to one immutable release record, extend the
guarded preparation surface, and prove deterministic continuation after partial
publication.

## I-5 - Apple trust boundary

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P6
- **Rubric criteria:** R5, R6
- **Depends on:** I-4
- **PR:** [#11](https://github.com/TrentBrown/gatereeve/pull/11)

Provide the individual enrollment and credential runbook, validate protected
configuration, sign and notarize with ephemeral CI credentials, and block every
public path without complete trust and approval evidence.

## I-6 - Update discovery and Early Access surfaces

- **Status:** closed
- **Estimate:** 1d
- **Plan steps:** P7
- **Rubric criteria:** R7
- **Depends on:** I-4
- **PR:** [#15](https://github.com/TrentBrown/gatereeve/pull/15)

Implement channel-aware private update notifications and website presentation
that becomes resolvable only for a trusted published release.

## I-7 - Publish and prove the direct RC

- **Status:** closed
- **Estimate:** 0.5d
- **Plan steps:** P8
- **Rubric criteria:** R1, R5, R6, R7
- **Depends on:** I-5, I-6
- **PR:** [#16](https://github.com/TrentBrown/gatereeve/pull/16)

Assemble the exact candidate evidence, obtain explicit user approval, publish
through the recoverable release record, and verify the direct signed DMG,
Plugin, manifest, and website results. Public mutation is not covered by the
standing intermediate-slice authorization.

## I-8 - Final Homebrew Cask distribution

- **Status:** in-progress
- **Estimate:** 0.5d
- **Plan steps:** P9, P10
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-7
- **PR:** pending from `gatereeve-desktop-distribution-08-homebrew-cask`

Pin the proven DMG in a Cask, verify native installation and upgrade, obtain
exact publication approval, and complete the full feature evaluation.

## I-9 - Ephemeral signing keychain discoverability

- **Status:** closed
- **Estimate:** 0.25d
- **Plan steps:** P6
- **Rubric criteria:** R5, R6
- **Depends on:** I-5
- **PR:** [#12](https://github.com/TrentBrown/gatereeve/pull/12)

Preserve the hosted runner's user keychain search list, prepend the ephemeral
Developer ID keychain for signing, restore the original list during cleanup,
and repeat the protected nonpublishing rehearsal.

## I-10 - Isolated trusted-package result channel

- **Status:** closed
- **Estimate:** 0.25d
- **Plan steps:** P6
- **Rubric criteria:** R5, R6
- **Depends on:** I-9
- **PR:** [#13](https://github.com/TrentBrown/gatereeve/pull/13)

Write signed-package metadata to a dedicated JSON result file so Electron
Packager progress output cannot corrupt the protected workflow's machine input,
then repeat the nonpublishing rehearsal through notarization and verification.

## I-11 - Flat trusted artifact bundle

- **Status:** closed
- **Estimate:** 0.25d
- **Plan steps:** P6
- **Rubric criteria:** R5, R6
- **Depends on:** I-10
- **PR:** [#14](https://github.com/TrentBrown/gatereeve/pull/14)

Stage the notarized DMG and its trust evidence under one upload root so GitHub
downloads both files at the stable flat paths consumed by native verification
and coordinated-record assembly, then repeat the nonpublishing rehearsal.
