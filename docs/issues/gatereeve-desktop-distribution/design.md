# Design - gatereeve-desktop-distribution

**Status:** approved (2026-08-27)

## Problem

GateReeve Desktop is a complete read-only development application but is not an
installable product. A user must clone the repository, install development
dependencies, stage the protocol, and launch Electron from a terminal. There is
no permanent macOS identity, application icon, universal application bundle,
DMG, Developer ID signature, notarization, release artifact, update discovery,
or public installation path.

Merely wrapping the current source tree would produce a misleading release. The
application shells out to Python to resolve a workflow context and assumes shell
discovery of Git and the optional GitHub CLI. A Finder-launched, ASAR-packaged
application cannot inherit those assumptions safely. Native notifications also
need the stable signed identity that the development application lacks.

GateReeve's surfaces compound the distribution problem. The Plugin supplies the
governance that gives Desktop operational value, while Codex and Claude own
Plugin installation, the optional CLI has a separate lifecycle, and system
package managers own external prerequisites. GateReeve needs one coherent setup
and release experience without turning its read-only Desktop surface into a
brittle cross-product installer.

## Intent

Ship GateReeve as a trusted, ordinary macOS application that a real user can
download, drag to Applications, open without a Gatekeeper workaround, and use to
understand both GateReeve setup readiness and durable workflow state.

Treat Plugin and Desktop as coordinated surfaces of one product: build and test
them from one semantic version, tag, and source commit, while preserving the
native installer and upgrade owner for each surface. Make mismatches explicit,
guide users through native setup, and keep all workflow observation and existing
record inspection read-only.

Release the first signed application as a public RC, learn from that installed
experience, and promote only the exact tested source. Favor inspectable,
recoverable release mechanics over a large general-purpose workflow engine or
the appearance of impossible cross-system atomicity.

## Chosen shape

### Product and installation boundary

`GateReeve.app` is an optional visual companion; the GateReeve Plugin remains
the prerequisite for governing new or active work. The DMG and later Homebrew
Cask install only the application. Codex and Claude plugin managers continue to
install, update, enable, disable, and remove their respective Plugins. The
optional Commander CLI and system prerequisites retain their own installation
lifecycles.

Desktop unifies the experience through a persistent Setup view, not a monolithic
installer. On first launch it asks the user to select Codex, Claude, or both,
persists only that explicit choice, and checks only the selected agents and
relevant components. It classifies setup plainly, supplies exact native actions
and official guidance, and revalidates after the user acts. It never silently
installs, upgrades, enables, disables, or removes another component.

Missing Plugin installation makes operational readiness incomplete. Desktop
still launches and may inspect an explicitly selected existing feature record as
historical or offline evidence. This preserves the value of durable records
without implying that ungoverned new work is ready. The optional CLI is never a
Desktop prerequisite.

### Packaged runtime boundary

Initial end-user packaging targets one universal macOS application supporting
Apple Silicon and Intel. Existing Ubuntu source/runtime support remains intact;
Linux installers are deferred to a separate feature.

Canonical workflow-context resolution moves from Desktop's Python subprocess to
the shared JavaScript protocol core. Migration evidence proves parity with the
existing Python resolver. The packaged application therefore requires neither a
system Python executable, a separate Node.js runtime, nor the optional GateReeve
CLI for local observation.

Git remains a separately discovered repository dependency for complete Git
facts. Authenticated `gh` remains optional PR enrichment. Missing or inaccessible
executables produce source-specific diagnostics and reduced enrichment; they do
not make the canonical local workflow record disappear. Release verification
must exercise a packaged application under a Finder-like environment against a
real governed fixture, not merely prove that an empty Electron window launches.

### Compatibility model

Plugin and Desktop share one coordinated GateReeve release identity, but
independent installation lifecycles make version skew possible. Setup reports
three states:

- **Matched:** both surfaces come from the same coordinated release.
- **Compatible:** versions differ but project-controlled metadata and testing
  explicitly permit the pair; normal use continues with an update
  recommendation.
- **Incompatible:** the relevant protocol contract is outside the declared
  range; operational readiness is blocked while safely interpretable existing
  records remain readable.

Semantic-version proximity never establishes compatibility by itself. Release
metadata and protocol contracts are the authorities.

### Application identity and icon

The installed product is `GateReeve`, the bundle is `GateReeve.app`, and the
permanent bundle identifier is `com.trentbrown.gatereeve.desktop`. Finder, Dock,
notifications, DMG contents, preferences, signing, and upgrades use this
identity across RC and stable releases. Documentation may say `GateReeve
Desktop` when distinguishing the application surface from the Plugin or CLI;
`Desktop` is not part of the proper application name.

This feature creates the production application icon. Visual exploration starts
from a simple architectural gate or portcullis with one clearly open passage,
using GateReeve's purple-and-ink vocabulary. The selected design must remain
legible at macOS Dock and notification sizes and remain distinct from
PortReeve's human portrait. Text, initials, faces, generic checkmarks, and
fragile miniature workflow details are excluded. Visual variants require human
selection before the final assets are generated.

### Apple trust and credential custody

Apple Developer Program enrollment is a guided prerequisite within the feature.
The user enrolls as an individual and completes Apple's identity, agreement,
payment, and approval steps. Guidance states accurately where Apple uses the
account holder's legal identity and never presents GateReeve, Quality Code, or a
trade name as the enrolled legal entity.

The user creates the Developer ID Application identity and notarization
credential with guided instructions, retains an encrypted offline recovery
copy, and stores CI copies only in a protected GitHub `release-publication`
environment. Candidate verification completes before a signing job receives
those secrets. Human environment approval gates access; CI uses an ephemeral
keychain and removes it after the run. Repository files, commands, logs, and
release artifacts contain no secret value.

Every public Desktop RC must prove the exact Developer ID identity, hardened
runtime, secure timestamp, successful notarization, stapled ticket, and accepted
Gatekeeper assessment. Ad-hoc-signed candidates may support development and
unpublished pipeline rehearsal, but the project never advertises an unsigned
Desktop artifact through GitHub Releases, the website, update metadata, or
Homebrew.

### Coordinated release and recovery

One GateReeve semantic version and immutable `v*` tag bind Plugin and Desktop to
the same source commit. The first public Desktop release uses the existing RC
convention; stable promotion remains bound to the exact tested RC source under
GateReeve's current release policy.

Preparation builds and verifies both surfaces before public publication. The
release record distinguishes Plugin marketplace evidence from Desktop artifact
and Apple trust evidence while converging them on one coordinated identity.
Cross-surface publication cannot be atomic, so adapters publish in a
deterministic order and recover idempotently. If a later surface fails, the
release remains visibly incomplete and resumes from the same immutable RC.
Already published tags, packages, and assets are not deleted, replaced, or
rewritten to conceal the interruption.

Standing authorization permits agents to deliver and merge intermediate
implementation slices, but not to publish a release. Public tag and release
creation require the user's separate approval of the exact version, source
commit, Plugin and Desktop results, DMG checksum, Apple trust evidence, and
publication plan.

### Distribution surfaces

GitHub Releases is the canonical byte host. The primary initial installer is one
signed, notarized universal DMG containing `GateReeve.app` and a normal
Applications shortcut. Release metadata and checksum files identify the exact
artifact.

The first RC is public and linked from `gatereeve.pages.dev` as clearly labeled
Early Access. The site keeps Plugin installation visibly prerequisite, presents
Desktop as the optional visual companion, links to the exact GitHub prerelease
rather than duplicating bytes, reports signed/notarized trust, and explains RC
update behavior.

After direct DMG installation is proven, the final distribution slice publishes
a checksum-pinned Homebrew Cask. The Cask installs the same approved DMG; it does
not build, repackage, install Plugins, or assume ownership of other GateReeve
components.

### Notification-only updates

RC and stable channels remain isolated. An RC installation may discover later
RCs and the eventual stable release on its version line. A stable installation
discovers only newer stable releases and is never prompted toward an RC. The
initial application has no channel switcher.

Desktop checks one fixed, project-controlled manifest automatically only when a
prior automatic result is older than 24 hours. A manual Check for Updates action
performs a fresh check. Requests carry no installation identifier, analytics,
worktree content, or dynamic query parameters. Network, size, HTTP, parse,
schema, and compatibility failures reduce to a quiet unavailable state and
never delay or disable local observation.

A newer compatible-channel release produces an in-app banner regardless of
native-notification preference. Native delivery occurs only after the existing
notification opt-in. The only update action opens the fixed official release
page; Desktop never downloads, replaces, restarts, or installs itself.

## Alternatives considered

- **Continue source-only operation:** rejected because it is not a real-user
  installation path and cannot provide stable macOS identity or trust.
- **Copy PortReeve's entire release engine:** rejected because PortReeve
  coordinates a native service, CLI matrix, Desktop architectures, formula, and
  Cask. GateReeve should reuse its evidence, recovery, and distribution
  principles without importing unrelated product machinery.
- **Publish an unsigned preview while Apple setup is pending:** rejected because
  Gatekeeper friction and unreliable macOS notification behavior defeat the
  feature's purpose.
- **Install Plugin, Desktop, CLI, and prerequisites from one DMG:** rejected
  because it crosses native manager boundaries, couples platform-specific and
  portable lifecycles, complicates authentication and uninstall, and turns the
  observer into a mutating installer.
- **Keep every component's onboarding entirely separate:** rejected because it
  leaves users to discover prerequisites, compatibility, and corrective actions
  without a coherent product status surface.
- **Require exact Plugin/Desktop version equality:** rejected because independent
  native updates make harmless skew inevitable; compatibility must be explicit
  and tested instead.
- **Keep the signing key only on one Mac:** rejected as the normal release path
  because it makes every release machine-dependent and manual. Protected CI
  custody plus offline recovery provides repeatability with a deliberate
  approval boundary.
- **Automatic in-place updates:** deferred because notification-only discovery
  is easier to inspect and recover while the first installed release is being
  learned from.
- **Separate Apple Silicon and Intel downloads:** not preferred because
  GateReeve has no bundled architecture-specific CLI payload; a universal
  application gives users one installation choice. Packaging evidence may
  revisit this only if the universal candidate fails materially.
- **Linux installers in the first distribution feature:** deferred while
  retaining existing Ubuntu source and runtime support. macOS trust and direct
  installation are the immediate objective.

## Constraints

- Desktop remains read-only with respect to GateReeve workflow state and other
  components' installation state.
- Plugin installation in at least one explicitly selected supported agent is
  required for operational readiness.
- Existing durable records remain inspectable when setup is incomplete.
- The optional GateReeve CLI is never required by Desktop.
- Public Desktop artifacts are Developer ID signed, hardened, securely
  timestamped, notarized, stapled, and Gatekeeper accepted; there is no unsigned
  public fallback.
- Signing and notarization secrets never enter repository history, ordinary
  workflow artifacts, logs, or commands.
- Release identity is coordinated, immutable, and recoverable; cross-system
  publication is not described as atomic.
- Update discovery is channel-aware, bounded, privacy-preserving, and incapable
  of installing code.
- GitHub Releases remains the canonical byte host for direct DMG and Cask
  installation.
- The final public publication is outside the standing authorization for
  intermediate slice approval and merge.
- Existing supported Ubuntu development behavior must not regress even though
  Linux packaging is out of scope.

## Open risks

- Apple individual enrollment, Developer ID issuance, or account verification
  may delay the public release and cannot be automated by the project.
- Universal Electron packaging, signing, notarization, stapling, and
  Finder-like launch must be proven on hosted macOS rather than assumed from
  source runtime tests.
- Codex and Claude expose different and evolving plugin-manager surfaces.
  Setup detection must use supported read-only adapters, degrade honestly, and
  avoid broad filesystem scanning.
- Compatibility metadata can become misleading unless every declared range is
  backed by cross-version tests and removed when evidence expires.
- Protected CI materially reduces manual release friction but makes GitHub a
  custodian of encrypted signing material; environment policy and credential
  rotation must remain operable.
- A coordinated release can become partially public despite pre-publication
  verification. Recovery tests must prove convergence without replacement or
  historical cleanup.
- The architectural icon direction is settled, but visual variants still need
  generation, small-size evaluation, and human selection.
- Website and update metadata must never point at a release until the exact
  signed/notarized bytes are publicly available and verified.

## Changes

None.
