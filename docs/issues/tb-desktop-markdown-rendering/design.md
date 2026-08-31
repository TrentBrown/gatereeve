# Design - tb-desktop-markdown-rendering

**Status:** approved (gate passed 2026-08-31)

## Problem

GateReeve Desktop renders Markdown artifacts through a handwritten mixture of
line scanning and regular expressions. It covers a small useful subset, but it
does not implement CommonMark nesting and delimiter rules or ordinary
GitHub-flavored constructs such as tables, task lists, autolinks, footnotes,
and strikethrough. Extending that parser one construct at a time would continue
to duplicate a mature parsing problem and increase the malformed-input and
security cases that GateReeve must own.

The renderer is also a security boundary. Artifact content is local but not
trusted as application code: it must not inject HTML, initiate arbitrary
resource loads, navigate the application window, or escape canonical artifact
link resolution. A replacement therefore cannot simply emit an HTML string
into the page.

## Intent

Give workflow artifacts and Session Markdown complete, predictable CommonMark
and GitHub-flavored rendering while retaining GateReeve's semantic-DOM,
read-only, offline, and capability-based boundaries. Move Markdown parsing and
syntax correctness to a maintained library and keep only GateReeve-specific
presentation policy in application code.

## Chosen shape

Use a pinned Unified pipeline composed of `unified`, `remark-parse`,
`remark-gfm`, `remark-rehype`, `rehype-sanitize`, and `hast-util-to-dom`.
Markdown is parsed to MDAST, transformed to HAST under explicit product policy,
sanitized with a narrow allow-list, and converted to real DOM nodes. No
artifact-derived value is assigned through `innerHTML`.

Target complete CommonMark plus the GitHub-flavored extensions supplied by
`remark-gfm`, including tables, task lists, autolinks, footnotes, and
strikethrough. Apply the same renderer to canonical workflow artifacts and the
Session Markdown detail surface.

Preserve the established trust policy while expanding syntax fidelity:

- Raw HTML remains visible literal text rather than executable markup.
- Markdown images remain visible but never create an `img` or initiate local or
  remote loading.
- Links become interactive only when GateReeve's existing resolver accepts an
  `http:`/`https:` URL, a current canonical artifact target, or a fragment.
  Unsafe, unknown, credential-bearing, and unresolved targets remain inert and
  visible.
- Generated heading anchors use a collision-resistant application prefix while
  preserving logical Markdown fragment navigation and deterministic duplicate
  handling.
- The sanitizer allows only the semantic elements and properties needed by the
  supported Markdown output. Event handlers, style, generic resource URLs, and
  application-controlled attributes are not copied from content.

Add a deterministic renderer build step that bundles the pinned ESM pipeline
into the staged `renderer/` directory. The shipped application remains
self-contained, uses no CDN, exposes no `node_modules` tree through the custom
protocol, and retains its no-network renderer content security policy.

Mermaid rendering is explicitly outside this feature. Fenced `mermaid` blocks
remain syntax-highlightable ordinary code. A follow-up feature may add diagram
rendering after independently resolving SVG isolation, CSP, lazy loading,
resource limits, and package footprint.

## Alternatives considered

- Continue extending the handwritten parser: rejected because every added
  construct multiplies delimiter, nesting, malformed-input, and compatibility
  behavior that mature parsers already solve.
- Use Marked: retained as the lightweight fallback, but its normal contract is
  unsanitized HTML and using its lexer safely would leave GateReeve maintaining
  a broad token-to-DOM renderer.
- Use markdown-it: rejected in favor of Unified because its principal renderer
  also produces HTML strings and full GitHub-style behavior depends on a less
  cohesive plugin set.
- Use commonmark.js: rejected because it omits the desired GitHub-flavored
  extensions and has a less convenient module/runtime shape for this app.
- Render library HTML through `innerHTML` after sanitization: rejected because
  direct syntax-tree-to-DOM conversion better preserves the existing structural
  safety invariant and avoids a string insertion boundary.
- Include Mermaid now: rejected because its dynamic SVG and CSP implications
  are independent of Markdown correctness and the user explicitly made it
  nonessential.

## Constraints

- GateReeve remains a read-only observer; rendering never mutates canonical
  feature records or protocol state.
- Artifact reads continue to originate only from canonical IDs supplied by the
  trusted main process.
- Context isolation, renderer sandboxing, denied direct navigation and popups,
  narrow IPC, and the current offline CSP remain in force.
- Artifact Markdown cannot initiate local or remote resource loads.
- Dependencies and generated bundles are reproducible from the Desktop package
  lock and are included through the established staging/package flow, not by
  shipping a general dependency tree.
- The renderer must degrade to visible source text for unsupported or malformed
  constructs rather than silently losing meaningful content.
- Implementation begins only after the governed design, specification, and plan
  gates pass.

## Open risks

- A sanitizer schema that is too broad could reintroduce navigation, resource,
  property, or DOM-clobbering behavior; one that is too narrow could strip GFM
  semantics such as task-list state or footnote relationships.
- Heading-prefix changes must preserve current intra-artifact fragment behavior
  and deterministic duplicate anchors.
- The new bundle step must work in source tests, renderer-only visual fixtures,
  macOS staging, ASAR verification, and coordinated release builds without
  checking in stale generated output.
- Synchronous parsing of pathological documents could block the renderer; the
  implementation needs bounded fixtures and representative large-artifact
  measurements.
- `linkedom` may not model every browser DOM detail used by `hast-util-to-dom`,
  so unit tests need a packaged or real-browser smoke path in addition to the
  existing renderer test harness.

## Changes

- None.
