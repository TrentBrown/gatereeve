# Spec - tb-gatereeve-desktop-dogfood-fixes

**Feature:** `tb-gatereeve-desktop-dogfood-fixes`
**Created:** 2026-08-29

## Summary

GateReeve Desktop must discover a compatible Python installation on macOS,
present stable GateReeve branding and Setup navigation, keep the selected
workflow artifact current as agents edit it, and render common inline Markdown
without weakening its read-only and renderer-isolation boundaries. The result
must ship as the coordinated, Apple-trusted `v0.1.0-rc.2` Desktop/plugin release
and be verified through the public Homebrew cask upgrade path on the user's Mac.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** Without `GATEREEVE_PYTHON3_PATH`, Setup evaluates only GateReeve's bounded, de-duplicated candidate list in deterministic order and selects the first executable Python whose reported version is 3.10 or newer, continuing past missing, unprobeable, and older candidates. When `GATEREEVE_PYTHON3_PATH` is set, Setup evaluates only that path and reports its real missing, unavailable, incompatible, or compatible status without fallback. If no compatible candidate exists, Setup reports evidence that distinguishes absence from incompatible or unprobeable installations and retains applicable remediation.
- **AC2.** The masthead displays the approved Rolling Vale artwork from `apps/desktop/assets/branding/gatereeve-rolling-vale.png` instead of the `GR` monogram, at 60px square in an approximately 88px-tall masthead, with an accessible GateReeve label.
- **AC3.** With a selected worktree, opening Setup renders the same Setup content in the ordinary workspace content region while preserving the complete sidebar at its stable width. With no selected worktree, Setup remains a full-width onboarding surface. Repeated navigation between Setup and every ordinary workspace view leaves no collapsed, resized, partially hidden, or stranded sidebar.
- **AC4.** While a canonical artifact is selected, a changed `modifiedAt` or `size` fingerprint in a newly published canonical snapshot automatically triggers a named re-read and re-render of that same artifact without another selection click. The viewer preserves selection, prevents an older asynchronous read from replacing a newer selection or refresh, bypasses stale HTML-frame caching, exposes a viewer-level manual Refresh control, and introduces no continuous polling.
- **AC5.** Automatic and manual artifact refreshes keep a reader who was near the bottom pinned to the bottom and otherwise restore the prior scroll position within the refreshed document's bounds. A transient re-read failure retains the last successfully rendered content, marks it as potentially stale, explains the failure, and leaves manual Refresh available. If the artifact leaves the canonical inventory, the viewer clears its selection and content and explains that it is no longer available.
- **AC6.** In ordinary inline Markdown, GateReeve constructs semantic DOM elements for strong emphasis written as `**...**` or `__...__`, emphasis written as `*...*` or `_..._`, and Markdown links. Inline code takes precedence, fenced code is never reparsed, intraword underscores such as `feature_id` remain literal, malformed or unsupported markup degrades to visible text, Markdown image syntax remains literal, no local or remote image is loaded, and artifact-generated content is never inserted through raw `innerHTML`.
- **AC7.** An absolute `http:` or `https:` Markdown link opens in the system browser through a narrowly validated preload/main-process operation. A relative link selects a target only when it resolves to an artifact in the current canonical inventory. A same-document fragment scrolls within the current artifact. `javascript:`, `file:`, unknown schemes, unresolved relative targets, and image targets remain inert. Renderer navigation and popup windows remain denied, and no link can nominate an arbitrary filesystem read.
- **AC8.** GateReeve Desktop and the GateReeve plugin are prepared from the same approved source as the exact coordinated `v0.1.0-rc.2` release. The release rechecks that the live tag and release namespace are unused; passes the repository's coordinated package verification, Apple signing, notarization, stapling, architecture smoke tests, and publication-plan checks; and is not published or used to mutate the Homebrew cask without explicit release-boundary approval. After approved publication, upgrading through the public Homebrew cask on the user's Mac installs `v0.1.0-rc.2`, and the corrected AC1 through AC7 behaviors applicable to macOS are verified in that installed application.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Compatible Python selection | Every no-override, explicit-override, incompatible, unprobeable, and missing path in AC1 behaves exactly as specified using only bounded candidates. | An older candidate blocks a later compatible candidate; an override falls back; discovery becomes unbounded; status is misclassified; or useful failure evidence/remediation is lost. | Executable-discovery and Setup-observer unit tests plus packaged macOS runtime evidence with Apple's older Python preceding a compatible Homebrew Python. |
| R2 | Approved masthead branding | The approved asset, specified dimensions, masthead sizing, and accessible GateReeve label are present, and the `GR` monogram is absent. | The monogram remains; the asset or dimensions differ; the masthead obscures the application; or branding lacks an accessible label. | Renderer DOM assertions, packaged-asset verification, and visual/runtime evidence at supported window sizes. |
| R3 | Stable Setup layout | Both selected and unselected worktree states satisfy AC3 through repeated navigation. | The sidebar collapses, changes width, disappears in the selected state, remains in onboarding, or Setup behavior diverges between layouts. | Setup renderer DOM tests and application visual/runtime checks for both states and repeated view switching. |
| R4 | Automatic artifact freshness | Selected Markdown, JSON, JSONL, text, and HTML artifacts refresh through bounded existing triggers; selection and request ordering remain correct; HTML is fresh; and manual Refresh works. | The viewer stays stale; loses selection; accepts an obsolete read; serves cached HTML; lacks manual recovery; or introduces continuous polling. | Test-first watcher/coordinator/renderer integration tests, including deferred-read races and HTML source fingerprint changes. |
| R5 | Resilient reading state | Near-bottom, ordinary scroll, transient failure, deletion, and manual recovery cases all satisfy AC5. | Refresh jumps unexpectedly; fails to follow appended content from the bottom; blanks last-good content; hides failure; or keeps displaying an artifact removed from inventory. | Renderer DOM tests covering scroll restoration, bottom pinning, stale warnings, recovery, and canonical removal. |
| R6 | Safe Markdown fidelity | Every supported delimiter and link-label case renders semantically, and every protected literal/safety case in AC6 remains intact. | Required formatting remains literal; code or identifiers are misparsed; malformed input disappears; images load; or raw `innerHTML` receives artifact content. | Focused Markdown DOM corpus and regression assertions against headings, paragraphs, lists, quotes, inline code, fenced code, malformed syntax, identifiers, and image syntax. |
| R7 | Confined link navigation | Every target class follows AC7 and existing isolation/navigation restrictions remain effective. | An unsafe or unresolved target opens; arbitrary paths resolve; the GateReeve window navigates; a popup is permitted; or a valid target uses the wrong destination. | Renderer, preload-contract, IPC, and Electron-window tests proving URL validation, canonical-relative resolution, fragment handling, trusted-frame enforcement, and denied navigation/popups. |
| R8 | Trusted coordinated delivery | Exact matched `v0.1.0-rc.2` artifacts from the approved source satisfy all trust and smoke checks, publication occurs only after approval, and Homebrew upgrade plus installed-app verification succeeds. | Versions or sources differ; the namespace is reused; any trust, package, smoke, or publication-plan check fails; external publication precedes approval; or installed-Mac verification is incomplete. | Immutable coordinated release record, Apple trust evidence, architecture verification, dry-run and approved publication plans, GitHub release/tag evidence, Homebrew cask smoke results, and user-Mac installation checklist. |

## Changes

- None.
