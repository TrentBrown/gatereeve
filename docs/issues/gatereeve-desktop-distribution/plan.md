# Plan - gatereeve-desktop-distribution

**Feature:** `gatereeve-desktop-distribution`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-27

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Deliver the feature as six mergeable code slices followed by one explicitly
approved direct-release operation and a final Cask slice. Begin by removing the
packaged runtime's Python boundary because every later native smoke test depends
on a self-contained observer. Add setup and compatibility as protocol-backed,
read-only product surfaces before packaging so they can be exercised in both
source and packaged runtimes. Establish the permanent application identity and
universal DMG next, then add a GateReeve-specific release record rather than
copying PortReeve's broader multi-binary release engine.

Signing and notarization remain a late, protected publication step: ordinary CI
builds and exhaustively inspects candidates without secrets, while the protected
job imports credentials only after candidate verification and exact human
approval. Update discovery and website presentation consume the same immutable
release metadata. The direct signed RC must be public and proven before the
final Cask slice is allowed to pin it.

Each sequential PR begins from updated `main` after its predecessor merges and
uses the cumulative feature record in this directory. There is no external Tree
task for this personal project. Intermediate slice approval and merge may use
the user's standing authorization; icon selection, Apple-controlled enrollment
actions, and every public publication remain explicit input boundaries.

## Steps

- **P1.** Implement shared JavaScript workflow-context resolution in the
  canonical protocol source, retain Python/JavaScript parity fixtures during
  migration, and stage only the JavaScript runtime into Desktop. Remove
  Desktop's Python subprocess and packaged Python resources without changing
  CLI or Plugin contracts that still legitimately use Python. **Advances:** R2.

- **P2.** Make packaged dependency discovery explicit and narrow: resolve Git
  under a Finder-like environment, keep `gh` optional, expose source-specific
  degradation, and add a hermetic governed-fixture smoke contract plus Ubuntu
  regression coverage. P4 runs this same contract against exact packaged bytes.
  **Advances:** R2.

- **P3.** Add persistent Codex/Claude selection, supported read-only detection
  adapters, readiness diagnostics, exact native remediation guidance, recheck
  behavior, and historical/offline access. Define and test project-controlled
  matched/compatible/incompatible metadata and render all states without making
  the CLI a prerequisite or mutating another installation. **Advances:** R3,
  R4.

- **P4.** Generate distinct GateReeve architectural-gate icon variants for
  human selection, convert the approved artwork into the macOS asset set, and
  establish the permanent `GateReeve.app` identity and
  `com.trentbrown.gatereeve.desktop` bundle identifier. Package one universal
  application in a conventional drag-to-Applications DMG and inspect its
  identity, architectures, resources, and native launch on Apple Silicon and
  Intel. **Advances:** R1, R2.

- **P5.** Introduce a compact coordinated release model that pins one version,
  source commit, eventual tag, Plugin candidate, Desktop candidate, checksums,
  trust evidence, and per-surface publication state. Extend the guarded release
  CLI and CI preparation path to build and verify both surfaces before public
  mutation; add fault-injection tests proving idempotent convergence after each
  partial-publication boundary and exact-source stable promotion. **Advances:**
  R6.

- **P6.** Write the individual Apple Developer enrollment and recovery runbook,
  add validation for the required certificate and notarization configuration,
  and implement a protected macOS signing job with an ephemeral keychain.
  Record hardened runtime, timestamp, notarization, stapling, and Gatekeeper
  evidence, and make every public output path fail closed when that evidence or
  exact human publication approval is absent. **Advances:** R5, R6.

- **P7.** Add the fixed, bounded, identifier-free release manifest client with
  24-hour automatic caching, fresh manual checks, RC/stable channel rules,
  non-blocking failures, an always-visible in-app banner, opt-in native
  notification, and fixed release-page navigation. Add Early Access website
  presentation that names the Plugin prerequisite and resolves only to a
  trusted published release. **Advances:** R7.

- **P8.** Prepare the exact public RC evidence packet from merged `main`,
  including version, source, Plugin and universal-DMG candidate digests, Apple
  trust results, update and website mutations, recovery state, and publication
  order. Stop for the user's exact approval, then publish and verify the Plugin,
  GitHub prerelease, manifest, and website through the recoverable release
  record. **Advances:** R1, R5, R6, R7.

- **P9.** After the direct RC installation path is proven, render a
  checksum-pinned Homebrew Cask for the identical universal DMG, verify install
  and upgrade behavior on Apple Silicon and Intel, stop for exact publication
  approval, and publish the Cask without assuming ownership of Plugin or CLI
  lifecycles. **Advances:** R8.

- **P10.** Run the complete feature rubric, full repository and Ubuntu
  verification, packaged macOS runtime and trust checks, public-link and
  checksum inspection, and final Cask smoke; produce the completion report and
  retain the cumulative feature record. **Advances:** R1, R2, R3, R4, R5, R6,
  R7, R8.

## Delivery boundaries

1. **Runtime foundation:** P1-P2 / I-1.
2. **Setup and compatibility:** P3 / I-2.
3. **Identity and universal DMG:** P4 / I-3; pauses for icon selection.
4. **Coordinated release and recovery:** P5 / I-4.
5. **Apple trust boundary:** P6 / I-5; may require Apple-controlled user action.
6. **Private update and Early Access surfaces:** P7 / I-6.
7. **Direct public RC:** P8 / I-7; no publication without exact user approval.
8. **Final Cask distribution:** P9-P10 / I-8; final feature slice and separate
   public-approval boundary.

## Verification

- **Per slice:** Run changed-file formatting/lint checks, targeted unit and
  integration tests, the broad applicable suite, and application runtime smoke;
  preserve exact results in the PR evidence packet.
- **Release mechanics:** Exercise candidate preparation and every recovery state
  with fixtures before allowing a protected job to access credentials or mutate
  a public surface.
- **Native evidence:** Inspect and run the exact packaged bytes on hosted Apple
  Silicon and Intel macOS environments with Finder-like process state.
- **Final step:** Run full rubric evaluation and produce the completion report.
