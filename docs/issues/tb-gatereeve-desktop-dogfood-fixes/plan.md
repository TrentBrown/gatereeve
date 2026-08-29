# Plan - tb-gatereeve-desktop-dogfood-fixes

**Feature:** `tb-gatereeve-desktop-dogfood-fixes`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-29

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Implement the Desktop corrections as one reviewable product slice, ordered from
main-process prerequisite discovery through renderer structure, stateful
artifact refresh, and safe inline navigation. Preserve the existing canonical
observer, named-artifact reads, sandboxed preload, IPC allow-list, and denied
window-navigation defaults.

Use test-first changes for Python candidate compatibility selection and the
asynchronous artifact refresh/race behavior. Extend the existing DOM-based
Markdown subset without adding raw HTML rendering or image/network loading.
After focused tests pass, run the full Desktop suite, package checks, visual
fixture, and supported runtime checks before the PR boundary.

Only after the product PR is merged to `main`, prepare the exact coordinated
`v0.1.0-rc.2` plugin/Desktop release through the hosted Apple-trust workflow.
Inspect immutable evidence and a dry-run publication plan before requesting the
separate approval required to publish, mutate the public cask, or install the
release from that channel.

## Steps

- **P1. Pin compatible Python selection with failing tests, then implement it.** Add executable-discovery and Setup-observer cases in which Apple's executable Python 3.9 precedes a compatible Homebrew Python, candidates cannot be probed, no compatible candidate exists, and `GATEREEVE_PYTHON3_PATH` is compatible, incompatible, missing, or unavailable. Confirm the new happy-path test fails for the current first-executable behavior before changing discovery. Introduce the smallest compatibility-aware candidate/probe contract that selects the first passing bounded candidate while leaving other prerequisite and agent discovery semantics intact. **Advances:** R1.
- **P2. Stabilize masthead branding and Setup layout.** Replace the monogram with the packaged Rolling Vale asset, apply the approved dimensions and accessible label, and refactor view switching so one Setup content surface renders full-width only during onboarding and inside the normal workspace grid when a worktree is selected. Add renderer DOM assertions for both states, repeated navigation, sidebar stability, and packaged asset inclusion. **Advances:** R2, R3.
- **P3. Add selection-aware artifact refresh with race and failure coverage first.** Write failing renderer/integration cases for snapshot fingerprint changes, selection preservation, stale asynchronous reads, manual refresh, HTML cache busting, scroll restoration, near-bottom following, transient read failure/recovery, and removal from inventory. Retain selected artifact identity/fingerprint in renderer state, reuse watcher and focus snapshot publications, add a viewer Refresh control, order read results, and present bounded stale/removed states without polling or arbitrary paths. **Advances:** R4, R5.
- **P4. Extend the safe inline Markdown tokenizer.** Add a DOM corpus for strong and emphasis using asterisk/underscore forms, code precedence, intraword underscores, malformed delimiters, nested ordinary text, and literal image syntax. Extend the semantic node builder to emit `strong` and `em` elements while preserving text-node fallback and the prohibition on artifact-generated `innerHTML`. **Advances:** R6.
- **P5. Add confined Markdown-link behavior across renderer, preload, and main process.** Test HTTP(S), canonical relative artifacts, same-document fragments, unresolved paths, images, and unsafe/unknown schemes. Add only the narrow validated external-link IPC operation required for HTTP(S); resolve relative targets against the current snapshot inventory in the renderer; retain denied direct navigation and popup behavior; and support fragments without creating a generic local-file surface. **Advances:** R6, R7.
- **P6. Verify the assembled Desktop slice.** Run formatting/static checks, the complete Desktop unit and integration suite, package allow-list/ASAR verification, visual fixture checks at supported dimensions, and application runtime smoke where available. Confirm no journal mutation, polling expansion, unsafe renderer API, unexpected dependency, or unrelated protocol behavior entered the diff. Record Linux limitations and the exact hosted/macOS checks deferred to release preparation. **Advances:** R1, R2, R3, R4, R5, R6, R7.
- **P7. Complete the governed product PR boundary.** Reconcile the issue ledger and rubric tracker, run scoped spec evaluation, independent judge, applicable pattern review, code review, decision triage, explain-diff, and packet validation against one pinned PR context. Commit and push only intended topic-branch changes, open the topic branch into `main`, and never merge or rebase a `development*` branch into this or another branch. Obtain human review and merge the verified product slice before release preparation. **Advances:** R1, R2, R3, R4, R5, R6, R7.
- **P8. Prepare and inspect coordinated `v0.1.0-rc.2` release evidence.** From the exact merged `main` commit, recheck the live tag/release namespace and dispatch the existing coordinated release preparation with Apple trust enabled. Require matched plugin/Desktop versions, universal DMG package evidence, arm64/x64 verification, signing, notarization, stapling, and an immutable coordinated release record. Generate and inspect the dry-run publication and Homebrew plans without publishing. **Advances:** R8.
- **P9. Request release approval, then publish and dogfood through Homebrew.** Present the exact source SHA, tag, artifacts, trust evidence, publication operations, and cask mutation for explicit user approval. Only after approval, run the repository-owned publication path, verify the GitHub release and plugin package, complete cask smoke checks, upgrade GateReeve through the public cask on the user's Mac, and execute the AC1-AC7 installed-app checklist. **Advances:** R8.
- **P10. Run final rubric evaluation and produce the completion report.** Evaluate R1-R8 from persisted evidence, require zero `NOT YET` or `FAIL` results, confirm the installed release and public artifacts match the approved source, and produce the workflow completion report and final checkpoint. **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.

## Verification

- Confirm P1's new compatibility case fails before implementation and passes afterward.
- Confirm P3's stale-view and deferred-read race cases fail before implementation and pass afterward.
- Run targeted tests after each step and the full `npm run check --prefix apps/desktop` suite before the PR boundary.
- Verify package contents and branding through the existing macOS package contract and hosted native evidence.
- Exercise renderer behavior through DOM integration tests plus visual/runtime inspection for Setup, artifacts, Markdown, and links.
- Treat hosted Apple trust, native architecture evidence, public cask smoke, and the user-Mac installation checklist as required R8 evidence, not optional follow-up.
- **Final step:** Run full rubric evaluation and produce the completion report.
