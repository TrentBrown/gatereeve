# Scratchpad - tb-publish-github-rewrites

## D1 - Neutralize the rendered section rather than relax the read-back

**Answered by:** agent
**Date:** 2026-11-26
**Options considered:** (a) neutralize rewritten text in the rendered
section before writing; (b) normalize the read-back (apply gh's rewrite to
the expected section) before comparing; (c) read the description through a
path that skips gh's sanitizer.
**Choice:** (a). The mandate prefers it and forbids weakening the read-back.
(b) would accept any host change that happens to match the normalization;
(c) adds a second GitHub client and token handling.
**Detail:** the backslash before a JSON-style control escape becomes the
entity `&#92;` (GitHub's Markdown renders the same backslash; inside a code
span the entity shows as text); a raw control character other than tab and
line feed becomes U+FFFD. The neutralized set covers all of C0, DEL and C1,
a small superset of what gh 2.97.0 rewrites, so a gh version that rewrites a
little more still reads back equal.
**Reversibility:** fully reversible; rendering only, no stored data or
contract change.

## D2 - Leave the author's text outside the section to a follow-up

**Answered by:** agent
**Date:** 2026-11-26
**Options considered:** fix it here; file a follow-up.
**Choice:** filed #161. The text outside the summary is read through the
same sanitizer and written back rewritten. Fixing it needs a different read
path, which is outside the narrow fix the mandate asks for.
**Reversibility:** reversible; nothing is decided beyond scope.
