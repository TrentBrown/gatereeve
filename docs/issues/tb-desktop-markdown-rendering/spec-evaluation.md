# Spec Evaluation - tb-desktop-markdown-rendering

**Evaluated:** 2026-08-31
**Scope:** Standalone complete-feature evaluation before a formal PR boundary
**Status:** PASS

## Verification Matrix

| Category | Command or check | Result | Evidence |
|---|---|---|---|
| Build | `cd apps/desktop && npm run build:renderer` | PASS | Browser-ready ESM bundle built at 421,335 bytes. Two final consecutive builds produced SHA-256 `2470eb5f5e74e2e2263a5f93b71816d344c7d2aabc8525bb6a71d8e8e7aaf508`; gzip size was 88,651 bytes. |
| Formatting/static | `git diff --check` | PASS | No whitespace errors. New renderer source contains no artifact-content `innerHTML`, HTML serialization, or resource-URL insertion path. |
| Unit/integration | `cd apps/desktop && npm test` | PASS | Final run: 131 tests passed. Coverage includes CommonMark/GFM DOM, hostile input, links, anchors, both surfaces, accessibility, staging, and existing Desktop behavior. |
| Dependency audit | `cd apps/desktop && npm audit --audit-level=high` | PASS | Zero known vulnerabilities reported. |
| Browser runtime | T3 collaborative browser, `/visual/index.html` | PASS | Production modules loaded in a real browser. CommonMark/GFM structures, disabled tasks, footnote relationships, prefixed heading IDs, and Mermaid-as-code were present; the Markdown subtree contained no Mermaid SVG. At 1280px, document `scrollWidth` equaled `clientWidth`. |
| Hostile browser input | Dynamic import of production `renderer/dom.js` in the browser fixture | PASS | Raw `<img>`, Markdown image, and `javascript:` link stayed literal; no forbidden DOM element and no external resource performance entry appeared. |
| Performance | Linkedom render of 2,000 list items / 127,779 source bytes | PASS | 2,000 semantic list items rendered in 718 ms on this host. |
| Staging/package content | `stageDesktopSource` smoke plus `macos-package.test.js` | PASS | Staged bundle is 421,335 bytes, runtime package has no dependencies, `node_modules` and the unbundled Markdown source are absent, and required-ASAR checks include the bundle. |
| Native Electron app | `electron --version` / smoke prerequisite | N/A (host blocked) | This Linux image lacks `libatk-1.0.so.0`; the existing Electron smoke cannot launch here. The real-browser fixture and complete source/staging test suite pass. Native macOS package smoke remains an exact PR/release-host check. |

## Acceptance Criteria Evaluation

- **AC1 — PASS.** The shared renderer covers the listed CommonMark structures.
  Tests cite representative CommonMark 0.31.2 examples 80, 119/120, 228,
  302, and 633 and exercise adjacent inline behavior. Artifact and Session
  integration use the same `renderMarkdown` seam.
- **AC2 — PASS.** Tables and alignment, strikethrough, disabled task lists,
  autolink literals, and footnotes/backreferences are semantic and tested.
- **AC3 — PASS.** Raw HTML and images are converted back to exact source text
  before HAST conversion. The sanitizer admits no resource element; browser
  hostile-input observation recorded zero external requests.
- **AC4 — PASS.** Inline, reference, formatted-label, autolink, canonical,
  external, fragment, unsafe-scheme, protocol-relative, credential-bearing,
  unresolved, and resolver-less Session behavior is covered. Only accepted
  links retain anchors and activate caller capabilities.
- **AC5 — PASS.** Heading IDs are application-prefixed, deterministic,
  formatted-text-derived, and duplicate-aware. Logical fragments are retained
  in application-generated metadata and artifact integration scrolls through
  that mapping.
- **AC6 — PASS.** Malformed input remains visible, code stays literal,
  Mermaid fences remain `code.language-mermaid`, and the existing artifact
  source/render, reread, and Session refresh tests pass.
- **AC7 — PASS.** Pinned dependencies produce a deterministic ignored bundle;
  pretest/prepack/start and staging build it; staged runtime has no dependency
  tree or unbundled source; existing CSP/isolation/navigation tests pass.
- **AC8 — PASS.** Semantic table structure, disabled task state, footnote
  labels, heading levels, nested lists, local wide-content wrappers, and scoped
  styles are covered by DOM, accessibility, and real-browser fixture checks.

## Rubric Evaluation

| # | Result | Evidence |
|---|---|---|
| R1 | PASS | Shared Unified renderer plus CommonMark DOM and artifact/Session integration tests. |
| R2 | PASS | GFM extension test and browser fixture. |
| R3 | PASS | Hostile DOM tests, sanitizer/source review, and zero-request browser smoke. |
| R4 | PASS | Unit and renderer integration coverage for every accepted/rejected link class. |
| R5 | PASS | Duplicate/formatted/clobber-resistant ID tests and fragment integration test. |
| R6 | PASS | Malformed, code, Mermaid, source-toggle, reread, and refresh coverage. |
| R7 | PASS | Deterministic digest, lifecycle wiring, staging/ASAR contract, isolation regressions, and zero runtime dependencies. |
| R8 | PASS | Accessibility DOM assertions, production visual fixture, and browser containment metrics. |

## Remaining Boundary Checks

- Run the native Electron/macOS smoke on a host with the existing runtime and
  packaging prerequisites.
- Persist formal gate reports at their packet paths after a PR context exists.
