# Interview - gatereeve-desktop-distribution

**Feature start:** 2026-08-27
**Status:** complete

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists.

## D1 - Make Apple trust setup part of the feature

**Question:** Is an Apple Developer membership and Developer ID signing identity
already available, or should enrollment and credential creation be included in
the work?

**Answer:** No membership or identity exists yet. Include setup in the work and
walk the user through it.

**Decision:** Treat Apple Developer Program enrollment, Developer ID Application
certificate creation, and notarization credential setup as guided release
prerequisites. The user completes Apple-controlled identity and payment steps;
the feature supplies exact instructions and validates the resulting setup. No
signing secret is committed to the repository.

## D2 - Coordinate Plugin and Desktop release identity

**Question:** Should GateReeve Desktop and the GateReeve Plugin share one
coordinated version and `v*` tag?

**Answer:** Yes.

**Decision:** One GateReeve semantic release identity and source tag coordinates
the Plugin marketplace package and Desktop application. Release verification
must distinguish the two publication surfaces while binding both to the same
tag and source commit.

## D3 - Release an RC before stable

**Question:** Should the first public Desktop artifact be a release candidate or
a stable release?

**Answer:** Release candidate.

**Decision:** The first public signed Desktop distribution is an RC, using the
existing GateReeve `vX.Y.Z-rc.N` release convention. Stable promotion remains
bound to the tested RC source under GateReeve's existing release policy.

## D4 - Package macOS first as a universal application

**Question:** Is a macOS-first universal application acceptable, with packaged
Ubuntu distribution deferred?

**Answer:** Yes.

**Decision:** Initial end-user packaging targets one universal macOS application
and DMG supporting Apple Silicon and Intel. Existing Ubuntu source/runtime CI
support remains intact, but Linux installers are a separate future feature.

## D5 - Keep initial updates notification-only

**Question:** Should the first release notify users of updates or install updates
automatically?

**Answer:** Notification-only first.

**Decision:** Desktop checks bounded, fixed, project-controlled release metadata
and may direct the user to the approved download page. It does not download,
replace, restart, or automatically install an application update.

## D6 - Design the application icon in this feature

**Question:** Is existing GateReeve icon artwork available, or should icon design
be included?

**Answer:** Design the icon in the feature work.

**Decision:** Create and approve an original GateReeve application icon as a
first-class release asset. It must use GateReeve's own visual identity and not
inherit PortReeve branding.

## D7 - Prove direct DMG distribution before Homebrew

**Question:** Should the initial public scope include Homebrew, or should direct
DMG installation be proven first?

**Answer:** Direct DMG first and Homebrew Cask as the final distribution slice.

**Decision:** GitHub Releases hosts the signed and notarized DMG as the primary
installation path. After that path is verified, the final distribution slice
adds a checksum-pinned Homebrew Cask that installs the same approved release
artifact rather than building or repackaging it.

## D8 - Enroll as an individual Apple developer

**Question:** Should the Apple Developer Program membership used to sign and
notarize GateReeve be enrolled as an individual or an organization?

**Answer:** Individual.

**Decision:** Enroll the user's Apple Account in the Apple Developer Program as
an individual. The guided setup must make clear where Apple uses the account
holder's legal identity and must not imply that GateReeve, Quality Code, or
another trade name is the enrolled legal entity.

## D9 - Coordinate publication through recoverable convergence

**Question:** Because Plugin marketplace publication and Desktop release
publication cannot be one atomic transaction, should GateReeve build and verify
both before publication, publish them in a deterministic order, and recover a
partial failure by resuming the same RC rather than deleting or replacing an
already published surface?

**Answer:** Yes.

**Decision:** Coordinated release means shared version, tag, source commit,
pre-publication verification, and a release record that converges both surfaces
to verified completion. It does not claim impossible cross-system atomicity. A
partial publication is visibly incomplete and is resumed idempotently from the
same immutable RC; published artifacts, tags, and marketplace identities are not
rewritten to conceal the interruption.

## D10 - Isolate stable and RC update channels

**Question:** Should RC installations follow newer RCs and the eventual stable
release on their version line, while stable installations see only newer stable
releases and never receive an RC prompt?

**Answer:** Yes.

**Decision:** Release metadata and comparison are channel-aware. An RC may
advance through later RCs to stable; a stable installation observes only stable
updates. The initial application has no channel-switching control, so opting
into an RC remains an explicit installation decision.

## D11 - Make packaged local observation self-contained

**Question:** Should canonical feature-context resolution move into the shared
JavaScript protocol core so installed Desktop requires neither Python, Node.js,
nor the optional GateReeve CLI for local observation, while Git remains a
discoverable repository dependency and authenticated `gh` remains optional
enrichment?

**Answer:** Yes.

**Decision:** Replace Desktop's Python subprocess boundary for context resolution
with a shared JavaScript implementation whose behavior is proven against the
existing Python contract during migration. Packaged local observation is
self-contained within Electron and the staged protocol. Git and GitHub facts
remain separately diagnosed: missing Git may reduce repository facts, while a
missing or unauthenticated `gh` never invalidates the canonical local workflow
record.

## D12 - Give GateReeve a distinct architectural icon

**Question:** Should GateReeve follow PortReeve's human-reeve portrait style, or
use a distinct architectural gate symbol grounded in GateReeve's existing
purple-and-ink visual identity?

**Answer:** Make GateReeve distinct from PortReeve using the proposed direction.

**Decision:** Design a simple architectural gate or portcullis icon with one
visibly cleared passage. Use GateReeve's purple-and-ink family, avoid the
PortReeve portrait vocabulary, and avoid text, initials, faces, generic
checkmarks, and details that disappear at Dock or notification sizes. Explore
and review visual variants before selecting the production asset.

## D13 - Unify setup guidance without unifying installation ownership

**Question:** Should GateReeve use independent native installation mechanisms
for Desktop, the Codex and Claude Plugins, the optional CLI, and system
prerequisites while presenting them through one coordinated setup and status
experience?

**Answer:** Yes. Adopt the hybrid model. The Plugin is a necessary prerequisite
for the application to have practical value.

**Decision:** Preserve component lifecycle ownership: the DMG and later Cask
install only Desktop, agent plugin managers own their Plugins, and system package
managers own external prerequisites. Coordinate versions and compatibility, and
add a friendly Desktop setup/status surface that identifies the user's chosen
agents, checks relevant components without indiscriminate scanning, explains
missing or incompatible states, supplies exact native installation actions, and
revalidates after the user completes them. Desktop does not silently install,
upgrade, enable, disable, or remove another component. Whether missing Plugin
installation blocks all record reading or only normal workflow readiness remains
an explicit follow-up decision.

## D14 - Require the Plugin for readiness, not historical reading

**Question:** Should Plugin installation be required for operational readiness
while Desktop remains able to launch and read an existing durable feature record
when the Plugin is missing, disabled, or later removed?

**Answer:** Yes.

**Decision:** Desktop always launches. Without a GateReeve Plugin installed in
at least one user-selected supported agent, it presents setup as incomplete and
does not imply that new or active work can be governed. Existing feature records
remain available for explicitly labeled historical or offline observation. This
exception does not turn the optional CLI into a prerequisite and does not permit
Desktop to advance workflow state.

## D15 - Govern version skew through declared compatibility

**Question:** Should independently updated Desktop and Plugin installations be
classified as matched, explicitly compatible, or incompatible using tested
release metadata and protocol contracts rather than requiring exact version
equality?

**Answer:** Yes.

**Decision:** An exact coordinated release pair is the preferred matched state.
Different versions may remain operational only when project-controlled metadata
declares and testing proves their compatibility. Compatible skew produces a
visible update recommendation; incompatible skew blocks operational readiness
without hiding any existing record that Desktop can still interpret safely.
Semantic-version proximity alone never establishes compatibility.

## D16 - Keep signing credentials in protected release CI

**Question:** Should signed releases use an encrypted Developer ID export and
notarization API credential stored in a protected GitHub publication
environment, with an offline backup retained by the user, rather than requiring
every release to be signed manually on the user's Mac?

**Answer:** Yes.

**Decision:** GitHub-hosted release CI may temporarily import the encrypted
Developer ID identity and use the notarization credential only inside an
environment-gated signing job. Candidate verification precedes secret access;
human approval controls entry to the environment; the temporary keychain is
removed after use; and signature identity, hardened runtime, secure timestamp,
notarization, stapling, and Gatekeeper acceptance become recorded release
evidence. The user retains an encrypted offline recovery copy and repository
history contains no secret material.

## D17 - Publish no unsigned Desktop release

**Question:** While Apple enrollment or trust setup is pending, should ad-hoc or
unsigned Desktop candidates remain unpublished development artifacts rather
than appearing on GitHub Releases, the website, update metadata, or Homebrew?

**Answer:** Yes.

**Decision:** A public GateReeve Desktop RC must carry a verified Developer ID
signature, hardened runtime, secure timestamp, successful Apple notarization,
stapled ticket, and accepted Gatekeeper assessment. Ad-hoc-signed candidates may
exercise packaging and local verification, but no public installation or update
surface advertises them. Failure or delay in Apple trust setup blocks Desktop
publication rather than weakening the release standard.

## D18 - Make update discovery bounded and notification-only

**Question:** Should Desktop check a fixed project-controlled manifest at most
once per 24 hours automatically, offer an explicit fresh manual check, send no
identifying or worktree data, fail non-disruptively, show an in-app update
banner, use native notification only after opt-in, and open only the fixed
official release page without downloading or installing anything?

**Answer:** Agreed.

**Decision:** Adopt that complete update-discovery contract. Automatic checks
are cached and bounded; manual checks are fresh; requests contain no analytics,
installation identity, worktree content, or dynamic query parameters. A failure
never delays or disables local observation. A compatible-channel update is
visible in-app regardless of native-notification preference, while native
delivery honors the existing opt-in. Updating remains an explicit user-driven
download and installation from the approved release page.

## D19 - Establish one permanent macOS application identity

**Question:** Should the installed product be named `GateReeve`, with bundle
`GateReeve.app` and permanent identifier `com.trentbrown.gatereeve.desktop`,
while prose uses `GateReeve Desktop` only to distinguish this surface from the
Plugin and CLI?

**Answer:** Yes.

**Decision:** Use that identity for Finder, Dock, notifications, DMG contents,
preferences, signing, and upgrades. RC and stable releases retain the same
bundle identifier and user-data lineage. `Desktop` describes a product surface;
it is not part of the installed application's proper name.

## D20 - Make Setup a persistent, non-blocking readiness surface

**Question:** Should first launch open a persistent Setup view that asks the user
to select Codex, Claude, or both, remembers only that explicit choice, checks
only selected agents, keeps missing Plugin installation visibly incomplete, and
still permits historical feature inspection outside Setup?

**Answer:** Yes.

**Decision:** Setup is a durable product surface rather than a dismissible
one-time wizard. Agent selection is explicit, revisable, and narrowly persisted.
Operational readiness reflects only the selected agents and their relevant
components. Setup does not trap the user: existing records remain inspectable
under the historical/offline rule, while incomplete setup remains easy to find
and cannot be mistaken for a ready governed environment.

## D21 - Publish the signed RC as website-linked Early Access

**Question:** Should the first signed RC be publicly discoverable from the
GateReeve website as clearly labeled Early Access, with GitHub Releases hosting
the canonical bytes, rather than remaining a GitHub-only tester artifact?

**Answer:** Yes.

**Decision:** The first signed and notarized RC is public and linked from
`gatereeve.pages.dev` as an Early Access macOS companion. The site keeps Plugin
installation visibly prerequisite, identifies Desktop as optional, links to the
exact GitHub prerelease rather than duplicating files, states its trust status,
and explains RC-channel update behavior. Stable presentation is deferred until
the tested RC is deliberately promoted.

## D22 - Require exact human approval for public publication

**Question:** Should the standing authorization to approve and merge intermediate
implementation slices stop short of authorizing tag creation and public release
publication, which instead requires explicit human review of the exact version,
source, verification, checksum, Apple trust evidence, and publication plan?

**Answer:** Yes.

**Decision:** Agents may prepare, verify, and converge the complete release
candidate under the normal implementation workflow, but public publication is a
separate human-authorized mutation. The user approves one exact coordinated RC
identity and evidence packet before the tag, GitHub prerelease, update metadata,
website link, Plugin marketplace publication, or later Cask becomes public. An
earlier general instruction to continue through slices does not substitute for
that approval.

## Closing summary

The feature has a settled product boundary. GateReeve becomes one coordinated
product with independently owned installation lifecycles: agent-native Plugin
installation, a signed macOS application, an optional CLI, and system-owned
prerequisites. Desktop provides one persistent setup/readiness experience but
does not become a cross-product installer or workflow mutator. The Plugin is
required for operational value; existing durable records remain readable when
setup is incomplete.

The release direction is also settled. One immutable RC identity coordinates
Plugin and Desktop, direct signed/notarized universal DMG distribution precedes
a checksum-pinned Cask, update discovery is bounded and notification-only, and
public mutation requires exact human approval. Partial cross-surface publication
converges through idempotent recovery rather than rollback or rewritten history.

The remaining unknowns are consciously accepted execution risks: Apple
enrollment and certificate timing, hosted universal packaging behavior,
supported Codex and Claude detection adapters, icon variant selection, and
recovery testing for a partially published coordinated release. None changes the
chosen product shape; each must be resolved and evidenced before publication.
