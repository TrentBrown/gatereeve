# Interview - tb-gatereeve-desktop-dogfood-fixes

**Feature start:** 2026-08-29
**Status:** complete

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

## D1 - One focused desktop dogfooding feature

**Question:** Should the newly observed Python discovery defect, header
branding improvement, and Setup-layout defect be handled together or split
into unrelated efforts?

**Answer:** The user asked to remain in the GateReeve repository and address
all three while PortReeve continues on the Mac.

**Decision:** Treat the work as one focused GateReeve Desktop dogfooding
feature. Keep the scope limited to prerequisite executable selection, existing
header branding, Setup navigation/layout stability, live artifact freshness,
and focused safe Markdown fidelity.

## D2 - Reuse the approved icon at a visibly useful size

**Question:** Should the header retain the generic `GR` monogram, introduce new
artwork, or use GateReeve's existing approved application icon?

**Answer:** The user wants GateReeve's own icon baked into the header and wants
a somewhat larger rendition so its detail is visible.

**Decision:** Replace the `GR` monogram with the approved Rolling Vale artwork
already pinned as the application icon. Render it at 60px square in an
approximately 88px-tall masthead so the artwork remains detailed without
dominating the application. Do not generate new artwork.

## D3 - Automatically refresh the artifact currently being viewed

**Question:** Should a viewed workflow artifact require manual refresh, poll
for changes, or update automatically when its backing file changes?

**Answer:** The user prefers automatic updates for `interview.md` and every
other workflow artifact, with an explicit refresh control or polling as a
fallback if necessary.

**Decision:** Reuse GateReeve's existing debounced feature-record filesystem
watcher. When the canonical snapshot reports that the selected artifact's
`modifiedAt` or `size` fingerprint changed, re-read and re-render that exact
named artifact while preserving selection. Add a viewer-level refresh control
as a deterministic fallback. Do not add continuous polling because local file
events, application-focus refresh, and manual refresh already provide three
bounded refresh paths. Protect the viewer against stale asynchronous read
results and ensure HTML artifacts bypass stale frame caching when refreshed.

## D4 - Preserve normal navigation when Setup is opened

**Question:** When a worktree is selected, should Setup remain inside the
ordinary workspace grid with the full sidebar, while initial setup without a
selected worktree remains a full-width page?

**Answer:** The user confirmed the recommended dual behavior.

**Decision:** With a selected worktree, render Setup in the normal workspace
content region and keep the complete sidebar visible at its stable width.
Without a selected worktree, retain the full-width onboarding Setup view. Both
states must present the same setup content and behavior rather than maintaining
two divergent implementations.

## D5 - Render Markdown strong emphasis semantically and safely

**Question:** What should happen when an artifact contains Markdown strong
emphasis such as `**Feature start:**`?

**Answer:** The user expects it to appear as a bold “Feature start:” text run,
not as literal asterisks.

**Decision:** Add support for well-formed `**...**` strong emphasis, `*...*`
emphasis, and Markdown links in ordinary inline content by constructing
semantic DOM elements. Preserve the renderer's text-node-based safety boundary:
do not use raw `innerHTML`, and do not interpret inline markers inside inline
or fenced code. Define an explicit safe link-target and navigation policy before
implementation.

## D6 - Keep Markdown links useful without weakening navigation boundaries

**Question:** Which link targets should be allowed, and should external links
open in the system browser rather than navigating the GateReeve window?

**Answer:** The user approved the recommended link policy.

**Decision:** Open absolute `http:` and `https:` targets in the user's system
browser through a narrow, validated main-process operation. Resolve relative
targets only against GateReeve's canonical artifact inventory and select the
known target in the artifact viewer; never expose a generic local-path reader.
Handle same-document fragments within the current rendered artifact. Leave
unsafe or unsupported schemes, including `javascript:` and `file:`, inert.
Retain the existing denial of renderer navigation and popup windows.

## D7 - Keep the explicit Python override authoritative

**Question:** If `GATEREEVE_PYTHON3_PATH` is set but names an incompatible
interpreter, should GateReeve honor that explicit choice and report the
incompatibility, or fall back to another compatible Python installation
automatically?

**Answer:** The user confirmed that the explicit override should remain
authoritative.

**Decision:** When `GATEREEVE_PYTHON3_PATH` is set, inspect only that executable
for the Python prerequisite and report its actual missing, unavailable, or
incompatible status without silently substituting another interpreter. When no
override is set, discovery may evaluate multiple bounded candidates and select
a compatible interpreter.

## D8 - Select the first compatible bounded Python candidate

**Question:** With no explicit override, should GateReeve use the first
compatible Python in its established candidate order, or prefer the newest
compatible version among all bounded candidates?

**Answer:** The user approved first-compatible selection.

**Decision:** Evaluate GateReeve's existing bounded, de-duplicated candidate
order and select the first executable whose probed version satisfies the
minimum. Do not scan the broader filesystem or rank all installations by
version. Continue past executable candidates that are unavailable, cannot be
probed, or are older than the minimum, retaining useful diagnostic evidence if
no compatible candidate is found.

## D9 - Preserve reading position across automatic artifact refreshes

**Question:** When the selected artifact refreshes automatically, should the
viewer preserve the reader's current scroll position rather than returning to
the top?

**Answer:** The user approved position-preserving refresh behavior.

**Decision:** If the artifact viewer is near the bottom before a refresh, keep
it pinned to the bottom so newly appended material remains visible. Otherwise,
restore the reader's prior scroll position after re-rendering. Apply the same
rule to automatic and manual viewer refreshes, subject to the bounds of the new
document size.

## D10 - Retain last good content through transient refresh failures

**Question:** If refreshing an artifact encounters a transient read failure,
should the viewer retain the last successfully rendered content with a visible
warning, while clearing it only when the artifact actually leaves the canonical
inventory?

**Answer:** The user approved the recommended failure behavior.

**Decision:** A failed re-read must not replace valid rendered content with a
blank viewer. Keep the last successful content visible, mark it as potentially
stale, explain that refresh failed, and retain a working manual Refresh control.
If a new canonical snapshot no longer inventories the selected artifact, clear
the selection and content and explain that the artifact is no longer available.
The next filesystem event, focus refresh, or manual refresh may recover a
transient failure.

## D11 - Support standard emphasis forms without mangling identifiers

**Question:** Should inline emphasis support both standard asterisk and
underscore forms, while deliberately avoiding emphasis inside identifiers such
as `feature_id`?

**Answer:** The user approved both delimiter forms and identifier protection.

**Decision:** Render `*italic*` and `_italic_` as emphasis, and `**bold**` and
`__bold__` as strong emphasis, when the delimiters are well formed. Do not
interpret intraword underscores as emphasis, so paths, protocol IDs, code-like
identifiers, and ordinary snake_case text remain intact. Inline code continues
to take precedence over all emphasis parsing.

## D12 - Do not load Markdown images

**Question:** Should Markdown image syntax remain unsupported so artifact
rendering never initiates remote image requests or expands the named-artifact
read boundary?

**Answer:** The user confirmed that images should remain unsupported.

**Decision:** Do not interpret Markdown image syntax or load local or remote
image targets from artifact content. Keep `![alt](target)` visibly literal.
This feature adds text formatting and controlled links only; it does not add a
network-capable or arbitrary-file media surface.

## D13 - Deliver the fixes through a signed Mac release

**Question:** Does completion include publishing and installing a new signed
and notarized GateReeve Desktop release, or stop at a verified merge-ready
product change?

**Answer:** The user confirmed the release-and-installation target.

**Decision:** Carry the product changes through GateReeve's existing release
process to a signed and notarized Mac release that can be installed and
dogfooded on the user's laptop. Treat irreversible hosted publication as a
separate release boundary requiring explicit user approval after the product
change, release evidence, and exact version are ready. Completion includes
confirming the installed Mac application exhibits the corrected behavior.

## D14 - Preserve coordinated Desktop and plugin versions

**Question:** Must the next Desktop release remain version-coordinated with the
GateReeve plugin, and if so does this feature also need to publish a matching
plugin package?

**Answer:** The user confirmed that Desktop and plugin versions should remain
matched.

**Decision:** Preserve GateReeve's coordinated release contract. Build and
publish the Desktop application and plugin package at the same exact release
version, even if this feature changes only Desktop product code. Do not weaken
Setup's explicit tested-pair policy merely to reuse an older plugin artifact.
The coordinated preparation, trust evidence, smoke tests, and publication plan
remain the release authority.

## D15 - Use v0.1.0-rc.2 for the coordinated release

**Question:** What exact next coordinated release version should carry these
changes?

**Answer:** After confirming that the live repository has only the published
`v0.1.0-rc.1` tag and release, the user approved `v0.1.0-rc.2`.

**Decision:** Prepare the Desktop application and plugin as the coordinated
`v0.1.0-rc.2` release. Revalidate the live tag and release namespace before
publication and refuse to overwrite or reuse the version if external state has
changed.

## D16 - Verify installation through the public Homebrew cask

**Question:** Should final Mac installation verification use the published
Homebrew cask upgrade path, rather than validating only a direct DMG
installation?

**Answer:** The user confirmed that the Homebrew cask upgrade should be the
final installation test.

**Decision:** Verify the signed and notarized DMG as a release artifact, then
publish and exercise the public Homebrew cask upgrade path on the user's Mac.
The installed `v0.1.0-rc.2` application must pass the selected dogfooding
checks. Publication and cask mutation remain subject to the explicit release
approval in D13.

## Open questions

- None blocking design synthesis. Release credentials, hosted-run identifiers,
  and final publication approval are operational inputs resolved at the release
  boundary rather than product-design questions.

## Closing summary

The feature is a single GateReeve Desktop dogfooding improvement covering
compatibility-aware Python discovery, existing-icon masthead branding, stable
Setup navigation, live selected-artifact refresh, and a deliberately bounded
safe Markdown expansion. Existing observation, named-artifact, renderer
isolation, and release-trust boundaries remain intact. Delivery targets a
coordinated Desktop and plugin `v0.1.0-rc.2`, signed and notarized through the
existing hosted workflow, published only after explicit approval, and finally
verified through the public Homebrew cask on the user's Mac.
