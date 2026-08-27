# Spec - gatereeve-desktop-distribution

**Feature:** `gatereeve-desktop-distribution`
**Created:** 2026-08-27

## Summary

GateReeve Desktop becomes an installable, trusted macOS product distributed as
one universal application and coordinated with the GateReeve Plugin through a
shared release identity. The installed application remains a read-only observer,
provides an honest setup and compatibility surface without taking ownership of
other components, runs without development runtimes, discovers updates without
installing them, and reaches users first through a signed release-candidate DMG
and finally through a Cask that installs those same approved bytes.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** **Native macOS product.** A user can download one DMG, drag
  `GateReeve.app` to Applications, and run it natively on both Apple Silicon and
  Intel. The application consistently uses the name `GateReeve`, bundle
  identifier `com.trentbrown.gatereeve.desktop`, persistent RC/stable identity,
  an Applications shortcut, and an approved purple-and-ink architectural-gate
  icon that remains recognizable at standard macOS sizes.

- **AC2.** **Self-contained packaged observation.** A Finder-launched packaged
  application can open and correctly render a real governed GateReeve fixture
  without Python, a separate Node.js runtime, the GateReeve CLI, or
  terminal-derived environment configuration. JavaScript context resolution
  remains behaviorally equivalent to the existing Python resolver. Missing Git
  reduces only Git-derived facts, and missing or unauthenticated `gh` reduces
  only GitHub enrichment, with clear source-specific diagnostics. Existing
  Ubuntu source/runtime behavior remains supported.

- **AC3.** **Honest, non-mutating setup experience.** Setup is always accessible,
  asks the user to select Codex, Claude, or both, remembers only that explicit
  selection, and examines only selected agents. It reports applicable Plugin
  and prerequisite states, supplies exact manager-owned remediation
  instructions, and can recheck afterward without installing, upgrading,
  enabling, disabling, or removing anything. Missing Plugin installation makes
  operational readiness incomplete while still allowing explicitly labeled
  historical/offline record inspection. The CLI is never required.

- **AC4.** **Evidence-backed compatibility.** Setup classifies Plugin/Desktop pairs
  as matched, compatible, or incompatible from project-controlled compatibility
  metadata. Differing versions are accepted only when cross-version evidence
  explicitly permits them; semantic-version proximity alone is insufficient.
  Compatible skew produces an update recommendation, while incompatible skew
  blocks operational readiness without hiding safely readable historical
  records.

- **AC5.** **Apple trust and credential readiness.** Maintainer guidance walks the
  user through individual Apple Developer enrollment, Developer ID Application
  identity creation, notarization credentials, encrypted offline recovery, and
  protected GitHub environment configuration. Candidate signing uses temporary
  CI credential material without exposing secrets. Every publicly distributable
  DMG has verifiable hardened-runtime Developer ID signing, secure timestamping,
  notarization, stapling, and Gatekeeper acceptance. Unsigned or ad-hoc
  candidates cannot reach public release, website, update, or Cask surfaces.

- **AC6.** **Coordinated and recoverable releases.** Plugin and Desktop candidates
  are built and verified from one semantic version, immutable source commit, and
  eventual tag. A durable release record distinguishes each surface and permits
  deterministic, idempotent continuation after partial publication without
  deleting or replacing published history. Stable promotion selects the exact
  tested RC source. Tag creation and every public surface remain unavailable
  until the user explicitly approves the exact version, source, checksums, trust
  evidence, and publication plan.

- **AC7.** **Public RC and private update discovery.** The first approved Desktop
  release appears as a GitHub prerelease with the universal DMG and checksums,
  and the GateReeve website links to that exact release as an optional Early
  Access macOS companion whose Plugin prerequisite and RC behavior are clear.
  Desktop checks a fixed project manifest automatically no more than once per
  24 hours; manual checks are fresh. Requests include no identifiers, analytics,
  worktree data, or dynamic query parameters. Failures do not disrupt
  observation. RC installations see later RCs and stable; stable installations
  see only stable. Updates produce an in-app banner and, when opted in, a native
  notification; the only action opens the fixed release page without
  downloading or installing software.

- **AC8.** **Homebrew Cask distribution.** After direct DMG installation is proven,
  a checksum-pinned Cask installs the same approved universal DMG bytes from
  GitHub Releases. It does not rebuild, repackage, install the Plugin or CLI, or
  claim ownership of their lifecycles. Installation and upgrade smoke tests
  succeed on supported macOS architecture runners.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Native identity and universal DMG | One installable DMG contains the correctly identified, branded universal application and works natively on ARM and Intel | Identity, icon, DMG layout, architecture, or native launch is wrong | Bundle inspection, mounted-DMG checks, icon assets, and ARM/Intel native smoke results |
| R2 | Packaged runtime independence | A Finder-like packaged run observes a real fixture without Python, external Node, or CLI; optional-tool failures degrade narrowly; resolver parity and Ubuntu checks pass | Packaged observation requires a prohibited runtime, loses canonical state, changes resolver behavior, or regresses Ubuntu support | Hermetic runtime tests, parity fixtures, missing-tool tests, and Ubuntu CI |
| R3 | Setup and readiness | Selected-agent setup is persistent, accurate, actionable, non-mutating, and preserves historical reading | Detection scans unrelated agents, mutates installations, requires the CLI, misstates readiness, or blocks historical records | Setup integration tests, adapter fixtures, and renderer/runtime inspection |
| R4 | Compatibility governance | All three compatibility states follow explicit, tested project metadata | Version proximity is treated as compatibility or an unproven pairing remains operationally ready | Schema tests, version-matrix tests, and Setup UI evidence |
| R5 | Apple trust | Enrollment and setup guidance is actionable and every public candidate satisfies the complete Apple trust chain without secret leakage | Guidance is incomplete, secrets escape, or any public artifact lacks a required trust property | Maintainer walkthrough plus CI secret-boundary, `codesign`, notarization, stapling, and `spctl` evidence |
| R6 | Coordinated release and recovery | Both surfaces share immutable release identity; partial failures resume safely; stable uses the exact RC source; publication requires exact approval | Surfaces diverge, history is rewritten, recovery duplicates publication, or public mutation can bypass approval | Release-record tests, fault-injection recovery tests, dry-run publication packet, and stable-source proof |
| R7 | RC publication and update behavior | The approved RC, website link, manifest channels, privacy limits, caching, notifications, and fixed-page navigation all behave as specified | Public metadata points to untrusted or missing bytes, channel isolation fails, requests leak data, failures disrupt use, or the app downloads or installs updates | Release inspection, website link test, request-contract and channel tests, and packaged UI smoke |
| R8 | Cask distribution | The Cask installs the checksum-matched approved DMG and leaves other component lifecycles independent | The Cask uses different bytes, rebuilds the app, or manages Plugin or CLI installation | Cask rendering tests, checksum comparison, and ARM/Intel installation and upgrade smoke evidence |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
