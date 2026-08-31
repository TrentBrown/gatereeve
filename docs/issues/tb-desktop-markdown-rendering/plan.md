# Plan - tb-desktop-markdown-rendering

**Feature:** `tb-desktop-markdown-rendering`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-31

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Replace only the Markdown parsing and DOM-construction seam. Keep the existing
artifact loading, Session loading, source/render toggle, canonical-link
resolver, activation callbacks, custom protocols, CSP, and window security
controls intact.

Add a small renderer source module that constructs a pinned Unified processor.
A product-policy transform will convert raw HTML and image nodes back to source
text before `remark-rehype`; a narrow `rehype-sanitize` schema will admit only
the semantic CommonMark/GFM output and application-created metadata needed for
link activation; and `hast-util-to-dom` will create nodes against the supplied
document. A post-conversion policy layer will generate prefixed heading IDs,
map logical fragments to physical IDs, disable task controls, and activate only
links accepted by the caller's existing resolver. No generated resource URL is
left in the DOM.

Pin the Unified packages and `esbuild` in the Desktop lockfile. A deterministic
script will bundle the Markdown module to an ignored generated renderer module
before source startup, tests, visual-fixture use, and macOS staging. The staged
and packaged application will contain that bundle but not `node_modules` or a
runtime dependency lookup. Build-contract tests will fail if a supported entry
path omits the build or if packaged-source exclusions regress.

Verification will proceed from syntax-tree/DOM unit tests to application
integration tests, then a real Electron visual/network smoke and the existing
macOS staging/package contract. Fixtures will cover representative numbered
CommonMark examples, every required GFM extension, hostile raw HTML and URLs,
duplicate/formatted headings, malformed source, Mermaid-labelled code, both
rendering surfaces, accessibility semantics, and constrained-width overflow.

## Steps

- **P1.** Add the pinned Unified and build dependencies, the renderer source
  entry, deterministic bundle script, ignored generated-output path, and npm
  lifecycle wiring for test, start, visual, staging, and packaging. Extend
  build/package contract tests so a clean checkout cannot run a supported
  renderer path with a missing or stale bundle. **Advances:** R7.
- **P2.** Implement the shared Markdown processor and source-preserving policy
  transforms for CommonMark/GFM nodes, raw HTML, image/image-reference syntax,
  malformed input, literal code, disabled task controls, sanitizer allow-list,
  and syntax-tree-to-DOM conversion. Replace the handwritten parser and add
  representative CommonMark/GFM and hostile-input DOM tests. **Advances:** R1,
  R2, R3, R6.
- **P3.** Implement application-owned heading IDs and logical-fragment mapping,
  route all link forms through the existing resolver/activation capabilities,
  and explicitly keep resolver-less Session links inert. Integrate the shared
  renderer at both call sites and test external, canonical-artifact, fragment,
  rejected, reference, autolink, duplicate-heading, refresh, and source-toggle
  behavior. **Advances:** R4, R5, R6.
- **P4.** Add scoped Markdown presentation for tables, nested lists, task
  state, footnotes, code, block quotes, and heading levels four through six.
  Extend the visual fixture and accessibility checks for semantics, focus and
  labels, local table/code scrolling, and no page-level overflow at supported
  widths. **Advances:** R2, R8.
- **P5.** Exercise clean bundle generation, all Desktop tests, the production
  renderer under Electron with hostile-input network observation, visual
  fixture capture, macOS source staging, package verification, and packaged-app
  smoke where the host permits. Resolve regressions without weakening the spec
  or security controls and record exact evidence in the tracker. **Advances:**
  R1, R2, R3, R4, R5, R6, R7, R8.
- **P6.** Run the required pattern-review, independent workflow-judge, spec
  evaluation, decision triage, and PR-boundary reconciliation. Address all
  blocking findings and prepare the completion report and PR text. This is a
  coordination and final-verification step.

## Verification

- **Unit:** Markdown semantic DOM, sanitizer/resource safety, links, heading
  anchors, malformed source, code/Mermaid literal behavior, and build helpers.
- **Integration:** canonical artifact and Session rendering, artifact
  resolution, fragment activation, refresh, source/render toggle, and
  accessibility assertions.
- **Runtime:** real Electron renderer smoke with request observation and visual
  checks at supported widths.
- **Distribution:** clean staging, ASAR/package-content verification, and
  packaged-app smoke when macOS tooling is available.
- **Final step:** Run full rubric evaluation and produce the completion report.
