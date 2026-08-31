# Decisions - tb-desktop-markdown-rendering

**Feature start:** 2026-08-31

Permanent record of decisions promoted from `scratchpad.md`.

---

## Bundle a Unified syntax-tree pipeline

- **Confidence:** HIGH
- **Blast radius:** Desktop dependency lock, Markdown renderer, generated build artifact, tests, staging, and package assembly
- **Triggered by:** Replacing an incomplete handwritten parser without adopting an HTML-string insertion boundary
- **Decision:** Pin `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-sanitize`, and `hast-util-to-dom`, and bundle the browser-facing module with pinned `esbuild`. Keep these as build-time inputs; ship the deterministic renderer bundle rather than a general dependency tree.
- **Alternatives:** Continue the parser; use Marked or markdown-it with sanitized HTML strings; use commonmark.js without the required GFM set.

**Promoted:** 2026-08-31.

---

## Preserve source before sanitizing semantic DOM

- **Confidence:** HIGH
- **Blast radius:** Markdown AST transforms, sanitizer schema, link activation, heading anchors, and hostile-input tests
- **Triggered by:** Raw HTML and image syntax must remain visible while never becoming executable or resource-loading DOM
- **Decision:** Convert raw HTML and image/image-reference nodes back to their original source text before MDAST-to-HAST conversion, sanitize a narrow semantic HAST, and convert it directly to DOM. Use application-generated metadata only as a short-lived bridge for capability-controlled links and logical fragments; do not copy arbitrary content attributes or assign artifact content with `innerHTML`.
- **Alternatives:** Drop unsafe nodes; recreate image text approximately; sanitize an HTML string and insert it; allow raw HTML through the parser.

**Promoted:** 2026-08-31.

---

## Defer Mermaid to an isolated follow-up

- **Confidence:** HIGH
- **Blast radius:** Feature scope, package size, CSP, SVG trust boundary, and code-fence behavior
- **Triggered by:** Mermaid is valuable but nonessential and carries independent dynamic SVG, resource-limit, CSP, and footprint decisions
- **Decision:** Render `mermaid` fences as ordinary code in this feature and add no Mermaid dependency or execution path. Evaluate diagram rendering later as a separately specified feature with SVG isolation and resource limits.
- **Alternatives:** Bundle Mermaid now; load it from a CDN; omit an explicit fence-behavior contract.

**Promoted:** 2026-08-31.
