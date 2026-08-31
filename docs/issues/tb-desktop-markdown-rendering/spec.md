# Spec - tb-desktop-markdown-rendering

**Feature:** `tb-desktop-markdown-rendering`
**Created:** 2026-08-31

## Summary

Replace GateReeve Desktop's handwritten Markdown parser with a pinned,
self-contained Unified rendering pipeline. Canonical workflow artifacts and
Session Markdown must render complete CommonMark plus the selected
GitHub-flavored extensions without weakening the renderer's existing offline,
navigation, resource-loading, or DOM-injection boundaries. Mermaid remains a
separate follow-up feature.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** Canonical artifact content and Session Markdown use the same renderer
  and correctly render representative CommonMark coverage for ATX and Setext
  headings through level six, paragraphs and hard breaks, nested ordered and
  unordered lists, block quotes, thematic breaks, indented and fenced code,
  inline code, emphasis and strong emphasis, inline and reference links,
  escapes, and character references. The implementation's conformance suite
  includes representative official CommonMark examples for every listed node
  type and passes them on both surfaces where surface behavior differs.
- **AC2.** Both Markdown surfaces render GitHub-flavored tables (including
  alignment semantics), strikethrough, task lists, autolink literals, and
  footnotes with usable references and backreferences. Task-list controls are
  disabled and cannot mutate application or artifact state.
- **AC3.** Markdown cannot inject executable or application-controlled DOM.
  Inline and block raw HTML remain visible as literal text; image and
  image-reference syntax remains visible without creating `img`, `picture`,
  `source`, `audio`, `video`, `iframe`, `object`, or other resource-loading
  elements; and artifact-derived values are never inserted with `innerHTML`.
  Rendering any supported or malformed input initiates no local or remote
  resource request.
- **AC4.** Link behavior preserves GateReeve's capability boundary. External
  `http:` and `https:` destinations without credentials open only through the
  existing external-link handler; resolvable relative canonical-artifact links
  open the canonical target; and fragment links scroll within the current
  rendered document. Unknown schemes, credential-bearing URLs, unresolved
  targets, and every Session Markdown link when no resolver is supplied remain
  visible but inert. This policy also applies to reference links, autolinks,
  and formatted link labels.
- **AC5.** Rendered headings receive deterministic, unique DOM identifiers that
  are derived from their visible text, handle inline formatting and duplicate
  headings, and use an application-owned prefix to prevent DOM clobbering.
  Logical Markdown fragments such as `#rubric` continue to reach the matching
  heading despite the physical DOM-ID prefix.
- **AC6.** Unsupported and malformed Markdown remains visible rather than being
  silently discarded. Code spans and blocks are never reparsed as Markdown.
  A fenced block labelled `mermaid` renders as ordinary code and neither loads
  nor invokes Mermaid. The existing rendered/source artifact toggle and
  refreshed artifact and Session views continue to work.
- **AC7.** The production renderer uses pinned dependencies bundled by a
  deterministic Desktop build step. Source tests, the renderer visual fixture,
  staged application startup, and the packaged macOS application load the
  renderer without a CDN or runtime dependency-tree lookup. The package does
  not expose or include a general `node_modules` tree, and the current renderer
  CSP, context isolation, sandboxing, popup denial, and direct-navigation
  denial remain in force.
- **AC8.** Added semantic structures are legible and keyboard/screen-reader
  coherent in the existing Desktop theme: tables expose header and cell
  structure and can scroll horizontally within their content area, nested
  lists retain visible hierarchy, task state is perceivable but noninteractive,
  footnote navigation has descriptive accessible labels, and headings through
  level six remain visually distinguishable. Existing artifact and Session
  layouts do not gain page-level horizontal overflow at supported fixture
  widths.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | CommonMark rendering on both surfaces (AC1) | All listed CommonMark structures produce the expected semantic DOM in canonical artifacts and Session Markdown, with representative official examples passing. | Any listed structure is missing, materially mis-nested, rendered differently by the two surfaces without a documented surface policy, or lacks representative conformance coverage. | Automated DOM tests mapped to CommonMark example numbers plus artifact and Session integration assertions. |
| R2 | GitHub-flavored extensions (AC2) | Tables, strikethrough, disabled task lists, autolink literals, and footnotes render semantically on both surfaces. | Any required extension is absent, task controls are interactive, or extension behavior bypasses product policy. | Automated renderer tests and browser/visual fixture evidence for each extension. |
| R3 | DOM and resource safety (AC3) | Raw HTML and image syntax stay visible and inert, forbidden/resource-loading elements are absent, no artifact-derived `innerHTML` path exists, and hostile fixtures cause no resource requests. | Input becomes executable DOM, creates a forbidden/resource-loading element, is assigned through `innerHTML`, disappears instead of remaining visible, or initiates a request. | Hostile-input DOM tests, source inspection/static assertion, and browser network observation. |
| R4 | Capability-controlled links (AC4) | Each accepted link class invokes only its existing capability; fragments scroll correctly; rejected and resolver-less Session links remain inert and visible. | A rejected target navigates or invokes a capability, an accepted target stops working, a fragment escapes the current document, or a Session link gains navigation without a resolver. | Unit tests for inline/reference/autolink destinations plus renderer integration tests for external, artifact, fragment, and inert cases. |
| R5 | Stable collision-resistant heading anchors (AC5) | Heading IDs are deterministic, unique, prefixed, derived from visible formatted text, and logical duplicate-aware fragment links select the intended heading. | IDs can clobber application DOM, vary for identical input, collide, omit formatted heading text, or break existing logical fragment links. | DOM tests covering formatting, punctuation, duplicates, reserved application IDs, and fragment activation. |
| R6 | Graceful degradation and existing flows (AC6) | Malformed/unsupported input remains visible, code is literal, Mermaid fences stay ordinary code with no Mermaid runtime, and source/render plus refresh flows pass. | Meaningful source vanishes, code is interpreted as Markdown, Mermaid code executes/loads, or an existing view flow regresses. | Malformed-input and code-fence unit tests, dependency/bundle inspection, and renderer flow tests. |
| R7 | Reproducible offline integration (AC7) | Clean source, test, visual, staging, and macOS packaging paths build and load the pinned renderer bundle offline; package verification excludes general dependencies; existing isolation controls remain enabled. | A supported path requires CDN/runtime dependency lookup, omits or stales the bundle, packages `node_modules`, or weakens CSP/isolation/navigation controls. | Lockfile and build-script diff, clean build/test logs, visual startup smoke, package verification output, and packaged-app smoke evidence. |
| R8 | Semantic presentation and accessibility (AC8) | New structures are semantically exposed, legible, noninteractive where required, locally scrollable when wide, and do not cause page-level overflow at supported fixture widths. | Structure is flattened or inaccessible, task controls accept input, headings are indistinguishable, or new content causes page-level horizontal overflow. | DOM accessibility assertions and before/after visual fixture screenshots at supported widths. |

## Changes

- None.
