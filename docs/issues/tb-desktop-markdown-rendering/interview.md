# Interview - tb-desktop-markdown-rendering

**Feature start:** 2026-08-31
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

## D1 - Full Markdown means CommonMark plus GitHub-flavored extensions

**Question:** Should GateReeve continue extending its deliberately small
Markdown subset, or replace its parsing layer with a standards-oriented
library, and what syntax target should “full Markdown” mean?

**Answer:** The user asked to replace the ad hoc renderer with a library that
supports full Markdown and approved the survey recommendation.

**Decision:** Target complete CommonMark parsing plus GitHub-flavored tables,
task lists, autolinks, footnotes, and strikethrough. Retire GateReeve's regular
expression parsing rather than extending the subset again. Product security
policies may deliberately restrict how otherwise-valid Markdown constructs are
presented.

## D2 - Use the Unified remark/rehype pipeline

**Question:** Which maintained JavaScript Markdown stack best fits GateReeve's
vanilla Electron renderer, extension needs, and semantic-DOM safety boundary?

**Answer:** The survey compared Unified/remark/rehype, Marked, markdown-it, and
commonmark.js. The user approved the recommendation to use Unified.

**Decision:** Use `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`,
`rehype-sanitize`, and `hast-util-to-dom`. The parser owns Markdown semantics;
GateReeve retains only the narrow product-policy transforms and interactions
that are specific to its artifact viewer.

## D3 - Preserve the semantic DOM and navigation boundary

**Question:** Should full Markdown support relax the existing renderer
isolation by inserting library-produced HTML or loading content nominated by
artifact text?

**Answer:** The approved direction preserves GateReeve's existing safety
invariants while expanding syntax fidelity.

**Decision:** Convert Markdown syntax trees to an allow-listed, sanitized HAST
tree and then to DOM nodes without assigning artifact-derived `innerHTML`.
Render raw HTML as visible literal text. Keep Markdown image syntax visible but
non-loading. Continue resolving links only through GateReeve's existing
external, canonical-artifact, and fragment policies; unresolved or unsafe
targets remain inert and visible.

## D4 - Bundle renderer dependencies into the self-contained application

**Question:** How should a multi-package ESM pipeline reach a renderer whose
custom protocol serves only staged application files and whose package excludes
`node_modules`?

**Answer:** The approved survey direction requires an offline, self-hosted
runtime rather than a CDN or packaged dependency tree.

**Decision:** Add a deterministic renderer build step that bundles the pinned
Markdown pipeline into the staged `renderer/` tree. Do not broaden the custom
protocol to expose arbitrary `node_modules`, and do not introduce runtime
network access. The package lock remains the dependency source of truth.

## D5 - Keep Mermaid out of the required Markdown feature

**Question:** Should Mermaid remain a non-blocking second slice of this
feature, or move to a separate follow-up after the standards-based Markdown
renderer is complete?

**Answer:** The user confirmed the recommendation to treat Mermaid separately.

**Decision:** This feature ends at secure CommonMark-plus-GFM rendering.
Mermaid remains a desired follow-up with its own design because dynamic SVG,
content security policy, lazy loading, and materially larger runtime footprint
need an independent stop/go decision. This feature may preserve fenced
`mermaid` blocks as ordinary code but will not render them as diagrams.

## Interview close

The core design is settled: replace regex parsing with Unified, retain a
sanitized syntax-tree-to-DOM pipeline, preserve GateReeve's link/image/raw-HTML
policies, and bundle all runtime code locally. Mermaid is consciously deferred
rather than allowed to delay or weaken the required Markdown work.

The remaining questions concern implementation mechanics—the exact sanitizer
schema, bundle command, and verification corpus—and belong in the specification
and plan rather than the product design.
