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

## Decision 3: state the fail-closed contract instead of chasing every lookalike

**Answered by:** agent

**Question:** after four review rounds, the remaining findings are text that
only looks like an opening tag or comment (a link destination such as
`[x](<pre>)`, a paragraph comment spread over lines, a code span wrapped across
lines). Each makes nearby prose compare verbatim, which forces a recoverable
re-authorization. None lets a rendered change pass. Keep patching, or state the
contract?

**Options considered:**
- Keep adding special cases: each round has found new lookalikes, and an exact
  answer needs a CommonMark inline parser (links, autolinks, multi-line spans
  and comments), which goes beyond the mandate's "small, well-tested change".
- Fall back to the mandate's alternative: fix #156 only and leave #157 open.
  That throws away a working, tested fix for the issue's actual risk (a changed
  `<pre>` or hard break comparing equal).
- Keep the fix and amend the brief's Goal to state the fail-closed contract
  that #157 itself allows ("Fail closed for any raw HTML block if that is
  simpler"): no tags, no comments and no trailing double spaces mean the
  comparison is exactly as before. Lookalike text may compare strictly, and
  rendered changes never compare equal.

**Choice:** the third. The amended brief gets a fresh independent review and
authorization.

**Reversibility:** fully reversible. A later change can narrow the strict
cases. Nothing stored depends on them, and the strict direction only asks for
re-authorization.

