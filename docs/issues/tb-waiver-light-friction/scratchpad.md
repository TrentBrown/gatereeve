# Decision Scratchpad - tb-waiver-light-friction

**Feature start:** 2026-11-25

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1 - "standard" rigor maps to full

The coordinator relayed "standard rigor" for #145. GateReeve rigor is
`full | light`; standard is the non-light choice, so the run started at full
(the default) under supervision.
**Promoted:** D1
**Answered by:** agent
**Options:** light (contradicts "standard"); full.
**Reversibility:** rigor can only rise within a run.

## S2 - Round 1 review fixes

Round 1 (codex gpt-6-sol, claude-code claude-opus-5-5) found: the findings-log
carry-forward reused the whitespace-normalizing `briefScope`, so re-indenting a
scope list kept authority (high); a PASS with `waivedCoverage` still counted as
an all-PASS gate for delegated/standing authority (medium); the PR explainer did
not show waived residuals (low). Fixed: carry-forward compares the brief outside
the findings log exactly (`briefScope(..., { exact: true })`; the delegated
hand-back comparison is unchanged); `allowedRunOutcome` rejects a PASS with
`waivedCoverage`; the explainer lists the waived residuals.
**Answered by:** agent
**Options:** normalize less (still lossy) vs exact bytes (conservative).
**Reversibility:** high.

## S3 - Round 2 review fixes

Round 2 confirmed the round-1 fixes and found two more instances of the same
classes: the delegated hand-back still ignored indentation (high), and standing
application still treated a PASS with `waivedCoverage` as passing (medium).
Fixed at the root rather than per call site: `briefScope` (one comparison for
authority carry-forward and delegated hand-back) keeps leading indentation and
ignores only trailing/inner whitespace and blank lines, preserving the earlier
deliberate whitespace rule; a shared `passingGate` (autonomous.js) now backs
standing application, unattended merge, adjudication and `allowedRunOutcome`.
**Answered by:** agent
**Options:** exact bytes for both paths (would break the earlier whitespace
rule its tests pin); per-site patches (leaves the class open).
**Reversibility:** high.

## S4 - Round 3 review fix

Round 3: claude-code PASS; codex confirmed every earlier finding resolved and
raised whitespace inside fenced code or inline code spans being collapsed (high).
Fixed by comparing whitespace the way Markdown renders it: prose collapses
(preserving the earlier deliberate whitespace rule its tests pin), leading
indentation counts, fenced code lines (blank ones included) and inline code spans
are verbatim.
**Answered by:** agent
**Options:** exact bytes (breaks the pinned prose-whitespace rule for delegated
hand-back); Markdown-semantic comparison.
**Reversibility:** high.

Triage 2026-11-25: S1 -> D1; S2, S3 -> D2 and D3; S4 -> D3.

## S5 - Round 5 and the round-6 hand-back

Round 5: both reviewers PASS; acceptance passed on green hosted CI (attempt 1 hit
the exit-time abort parked in #150; the documented rerun passed). `review.publish`
then could not verify the PR description: a reviewer quoted the comparison's
NUL-prefix sentinel as a backslash-u escape, and GitHub stores that escape text
altered, so the byte-exact read-back never matches. The human chose to continue
to round 6 (rather than accept as is). Round 6 removes the sentinel (the
comparison is now a list of typed entries, so no line content can collide with
it) and closes the two round-5 low findings: blank lines inside indented code,
and indentation counted in columns with tabs to the next multiple of four. The
publication escape itself is a separate GateReeve issue.
**Answered by:** human (round 6: continue)
