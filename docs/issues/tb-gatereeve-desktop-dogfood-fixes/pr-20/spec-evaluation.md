# Specification Evaluation - PR #20

**Scope:** Product slice P1-P7 / I-1-I-7 at pinned source `28a3971f33d11aaa76f4351057272d3e619f603e`
**Slice diff:** `c030c142ac94611c8d3c37bdaa96125826b0fdb0..28a3971f33d11aaa76f4351057272d3e619f603e`
**Verdict:** PASS

## Definition of Done

- **Build/package status:** PASS - canonical protocol staging and package,
  branding, macOS identity, universal-package, and self-contained-runtime
  contracts pass in the 92-test Desktop check.
- **Lint/format status:** PASS - the pinned diff is whitespace-clean and all
  changed JavaScript loads through the test suite.
- **Tests written:** Yes - focused tests cover every new Python, layout,
  refresh, Markdown, link, IPC, and protocol behavior.
- **Test suite status:** PASS - `npm run check --prefix apps/desktop` passes
  92/92 tests.
- **Integration verified:** Yes - canonical observer-to-renderer snapshot and
  named-read flows, sandboxed preload/main IPC, and application protocols are
  exercised together.
- **Application runs:** Yes for renderer/browser integration. Native Electron
  smoke is unavailable on this Linux host because `xvfb-run` is absent and is
  explicitly required in P8 on packaged macOS ARM/Intel bytes.
- **Pending manual verification:** Release-only AC8 checks: hosted Apple trust,
  both architectures, public Homebrew upgrade, and installed-Mac behavior.

## Acceptance Criteria

| # | Status | Evidence |
|---|---|---|
| AC1 | PASS | Bounded ordered discovery and compatibility-aware Setup probing continue beyond old or unprobeable candidates; explicit overrides remain exclusive. Focused discovery/Setup tests and the full suite pass. |
| AC2 | PASS | The pinned Rolling Vale PNG is served through one exact route, rendered at 60px in the 88px masthead, labeled by the GateReeve brand container, and covered by package/DOM tests and visual inspection. |
| AC3 | PASS | The shared Setup DOM is reparented into the selected workspace while the sidebar remains intact; onboarding remains full-width. Repeated navigation tests and 760x560 visual inspection pass. |
| AC4 | PASS | Canonical `modifiedAt`/`size` changes reread the selected artifact, stale reads cannot win, HTML URLs receive a refresh token, and manual refresh uses the same named-read path without new polling. |
| AC5 | PASS | Ordinary scroll, near-bottom pinning, transient last-good content, stale warning/recovery, and canonical removal are covered by renderer tests. |
| AC6 | PASS | Semantic strong/emphasis/link DOM, code precedence, intraword underscores, malformed literal fallback, literal images, fenced code, and no raw artifact `innerHTML` are covered by the Markdown corpus. |
| AC7 | PASS | HTTP(S) crosses a narrow doubly validated IPC operation; relative links select only current canonical inventory; fragments stay local; unsafe, credentialed, unresolved, image, navigation, and popup targets remain denied. |
| AC8 | NOT YET | Intentionally outside this product slice. The coordinated `v0.1.0-rc.2` release must derive from merged `main` and complete P8-P10 under separate publication approval. |

## Rubric

| # | Criterion | Result | Scope | Evidence |
|---|---|---|---|---|
| R1 | Compatible Python selection | PASS | P1, P6-P7 | Discovery and Setup-observer unit tests cover old-first, compatible-later, missing, unprobeable, aggregate failure, and explicit override cases. |
| R2 | Approved masthead branding | PASS | P2, P6-P7 | Exact asset/dimensions/accessibility/package assertions and visual fixture pass. |
| R3 | Stable Setup layout | PASS | P2, P6-P7 | DOM navigation and minimum-size fixture checks preserve the full sidebar and both Setup contexts. |
| R4 | Automatic artifact freshness | PASS | P3, P6-P7 | Snapshot fingerprint, manual refresh, stale-race, selection, and HTML cache-bust tests pass for the generic artifact viewer. |
| R5 | Resilient reading state | PASS | P3, P6-P7 | Scroll, near-bottom, last-good failure/recovery, and removal cases pass. |
| R6 | Safe Markdown fidelity | PASS | P4-P6, P7 | Focused semantic DOM corpus and renderer link integration pass without raw HTML or image loading. |
| R7 | Confined link navigation | PASS | P5-P7 | Renderer, preload, shared-contract, IPC, application-protocol, and denied-window-navigation tests pass. |
| R8 | Trusted coordinated delivery | NOT YET | Future P8-P10 | Correctly deferred until merged-source release preparation, explicit publication approval, public cask upgrade, and installed-Mac verification. |

## Scope and drift conclusion

The slice implements only the approved P1-P7 Desktop product work and its
governed PR boundary. The two visual-fixture adjustments preserve production
contracts and are recorded for decision triage. No dependency, schema,
workflow mutation, generic execution/filesystem surface, continuous poller,
or release publication entered the product diff. No spec amendment is needed.
