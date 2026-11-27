# Scratchpad - tb-brief-scope-fixes

## Decision 1: which raw HTML blocks compare verbatim

**Answered by:** agent

**Question:** #157 names `<pre>` and suggests failing closed for any raw HTML
block "if that is simpler". Which tags should compare verbatim?

**Options considered:**
- `<pre>` only: matches the issue's example, but `<textarea>` content is also
  rendered with its whitespace, and `<script>`/`<style>` bodies are content.
- The four tags CommonMark treats as "raw text" HTML blocks (`<pre>`,
  `<textarea>`, `<script>`, `<style>`), which end only at their closing tag.
- Every raw HTML block: simplest to state, but it would make ordinary inline
  tags such as `<br>` or `<kbd>` turn whole paragraphs strict, and other HTML
  blocks do not preserve inner whitespace.

**Choice:** the four CommonMark raw-text tags. The tag is detected anywhere in a
prose line (outside inline code spans), not only at the line start, so an
inline `<pre>` also fails closed; an unclosed tag makes the rest of the brief
verbatim.

**Reversibility:** fully reversible. It only changes which brief edits count as
scope changes, and every widening is stricter (fail closed).

## Decision 2: when a trailing double space is a hard break

**Answered by:** agent

**Question:** should every line ending in two spaces keep a marker?

**Options considered:**
- Mark every such line: simple, but it would change the existing, tested rule
  that trailing whitespace at the end of a paragraph is ignored.
- Mark only a prose line followed by another prose line of the same paragraph,
  which is exactly where Markdown renders a hard break, but needs paragraph
  parsing (an indented line can still continue a paragraph).
- Mark a non-heading line followed by any line that is neither blank nor a
  heading: never looser than rendering, and stricter only before a new list
  item or a fence.

**Choice:** the third. The marker is a flag, so the number of trailing spaces
(two or more) does not matter, as it does not when rendered.

**Reversibility:** fully reversible; no stored data depends on it.
