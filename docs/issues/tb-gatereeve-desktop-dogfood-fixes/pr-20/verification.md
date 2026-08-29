# Verification - PR #20

**Scope:** Product slice P1-P7 / I-1-I-7 / R1-R7
**Slice diff:** `c030c142ac94611c8d3c37bdaa96125826b0fdb0..28a3971f33d11aaa76f4351057272d3e619f603e`
**Result:** PASS

## Verification matrix

| Category | Result | Exact command and evidence |
|---|---|---|
| Build/package and type checks | PASS | `npm run check --prefix apps/desktop` stages the canonical protocol and passes 92/92 Desktop tests. Package, branding, icon generation, macOS identity, universal packaging, application composition, and self-contained staging contracts pass. The package has no separate compile/typecheck step. |
| Syntax/lint/format | PASS | `git diff --check` passes for the boundary evidence worktree. JavaScript parsing and contract checks run through the Node test suite. The pinned product diff changes no package manifest or lock file. |
| Unit and DOM tests | PASS | The 92-test suite covers bounded executable discovery, Python compatibility selection and authoritative overrides, Setup layout, masthead branding, artifact freshness/races/failures/scrolling, semantic Markdown, link confinement, IPC/preload contracts, renderer protocol, and window navigation policy. |
| Integration | PASS | Real canonical observer/renderer integration proves selected-artifact rereads after canonical fingerprint changes, safe relative/fragment/external-link behavior, no journal mutation, and the existing watcher publication path without added continuous polling. |
| End-to-end/browser smoke | PASS | The production renderer ran through the repository visual fixture in T3 at ordinary and 760x560 sizes. Rolling Vale branding is legible, Setup preserves the sidebar, bold/italics/links render semantically, and selecting a canonical relative artifact link updates the viewer. |
| Application runtime | PASS with environment deferral | Renderer integration and visual fixture runtime pass on this Linux host. Native Electron launch is unavailable here because `xvfb-run` is absent. The approved P8 release-preparation step will run packaged macOS ARM/Intel application, signing, notarization, and Homebrew-installed runtime checks before R8 can pass. |
| Branch documents | PASS | `validate_branch_docs.py docs/issues/tb-gatereeve-desktop-dogfood-fixes` passes. Its only warning is the expected unreviewed decision log, which is owned by the later decision-triage gate. |
| Scope and safety constraints | PASS | The pinned diff adds no dependency or lockfile change, no raw `innerHTML` artifact path, no new polling loop, no generic filesystem or process-execution IPC, and no relaxation of renderer navigation or popup denial. |

## Focused evidence

- Python discovery retains a bounded deterministic candidate list, probes past
  Apple's compatible-executable but version-incompatible Python, and selects
  the first candidate at 3.10 or newer. An explicit override remains the whole
  search and failure evidence distinguishes missing, unprobeable, and old
  candidates.
- The approved `gatereeve-rolling-vale.png` is the single pinned brand source.
  The renderer serves it through one exact confined application route and
  presents it at 60px inside the approximately 88px masthead.
- The same Setup DOM moves between full-width onboarding and the selected
  workspace content region. The normal sidebar remains structurally present
  and stable when Setup is selected.
- Selected artifacts retain identity and fingerprints. Existing snapshot
  publications trigger ordered named rereads; stale asynchronous responses are
  ignored; HTML URLs are fingerprinted; manual refresh, scroll restoration,
  last-good stale content, recovery, and canonical removal are tested.
- Markdown is built from semantic DOM nodes. Inline code wins over emphasis;
  intraword underscores and images remain literal; malformed markup remains
  visible; artifact content never enters raw HTML.
- HTTP(S) links cross one validated external-open operation, credentialed or
  unsafe schemes remain inert, relative links can select only current
  canonical inventory entries, and fragments stay within the artifact.

## Slice conclusion

R1-R7 pass for the exact PR #20 product source. R8 is outside this slice and
remains `NOT YET` by design until the merged source has passed the coordinated
Apple-trust release, publication approval, public Homebrew upgrade, and
installed-Mac checklist in P8-P10.
