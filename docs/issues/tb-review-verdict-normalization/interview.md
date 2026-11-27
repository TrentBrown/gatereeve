# Interview - tb-review-verdict-normalization

**Feature start:** 2026-11-26
**Status:** concluded 2026-11-26

Short design step. The human agreed the scope and the correction policy for
this PR in the coordinating thread (tracking issue #150); GitHub issue #141 is
the design input. Entries below record what was settled from the issue, the
source on `main` after PR #152, and a re-tally of retained reviewer results,
plus the choices the issue left to the implementer.

Each entry: **Question** / **Answer** / **Answered by:** `human | agent` /
**Decision**.

## Binding policy (human, coordinating thread)

GateReeve may correct a verdict automatically only where the answer follows
from the verdict itself. Examples: a PASS with a blocking finding becomes FAIL;
unknown extra properties are stripped; prose around a single JSON object is
unwrapped. Anything that changes meaning goes back to the reviewer through the
repair turn with the exact field path, and is never guessed (for example a
missing `blocking` value). Every correction is recorded with per-rule counts.

## Evidence base: re-tally of retained results (2026-11-26)

Read-only scan of every local run store's retained `result` objects (52 stores,
396 review/code/spec/judge results, 88 UNAVAILABLE). Stores deleted since the
PR #152 measurement are not included, so the rc.30/rc.31 bookkeeping cases are
under-represented; that measurement's table (PR #152 `decisions.md` DEC-8)
remains the priority order. Classes that #141 targets, as seen here:

| Class (rejection message) | Seen | Handling in this PR |
| --- | --- | --- |
| Unsupported model / configuration / authentication | 20 | Out of scope (provider configuration) |
| `Missing supported disposition for <id>` on a PASS (implementer claims the reviewer left undisposed) | 5 | Repair turn; the repair may now supply the omitted disposition |
| `Substantive assessment changes are not format repair` (the repair added the missing disposition) | 2 | Accepted: supplying an omitted disposition is format repair |
| `findings[0].blocking is required` (old-contract shape) | 3 | Repair turn with the field path (meaning, never guessed) |
| `Claude Code structured output returned malformed JSON` | 4 | Unwrap a single JSON object from prose; raw output was not retained, so fixtures are synthetic |
| `<field> is not allowed` (unknown extra property) | 1 | Stripped and recorded |
| `Assessment PASS contradicts criterion outcomes` (a criterion UNAVAILABLE on a PASS) | 1 | Repair turn with the criterion path (meaning) |
| `Finding must name source in scope` | 1 | Unchanged (repair turn) |
| Reviewer chose UNAVAILABLE, missing evidence | many | Out of scope (#142, #143) |

PR #152's measurement (219 results) attributed 30 rejections to bookkeeping
("PASS contradicts a present blocking finding" 7, missing disposition, undisclosed
disposition IDs, open finding carried as unaffected, format repair), 8 to
malformed JSON and 8 to schema shape.

## Entries

### D1. Unwrap one JSON object from prose

**Question:** When does GateReeve extract a JSON object from surrounding text?
**Answer:** Only when the whole output does not parse. GateReeve then scans for
balanced top-level `{...}` spans (string- and escape-aware) and keeps those that
parse as JSON objects. Exactly one: it is the output, recorded as rule
`prose-unwrapped`. None or more than one: the output stays malformed JSON
(`malformed-json`), so no competing verdict is ever chosen. Applies to Codex's
output file and to Claude's structured or text result, in the shared adapter
parser, and only for a caller that records the correction (the review gate
execution). Callers that cannot record it (planning reviews, analysis) parse
as today, so no correction is ever unrecorded.
**Answered by:** human (policy example); scanning rule by agent
**Decision:** As stated.

### D2. A PASS with a blocking finding is a FAIL

**Question:** Which PASS verdicts are recorded as FAIL?
**Answer:** A PASS that itself reports a blocking non-low finding, or a
`present` disposition for an earlier blocking finding, is recorded as FAIL
(rule `pass-with-blocking-finding`, original outcome kept in the record). Low
findings never block (unchanged), so a PASS with only low findings stays PASS.
The rounds 4-5 band still applies afterwards: a FAIL resting only on findings
the band demotes counts as PASS for the pair, as today.
**Answered by:** human (issue #141 scope, policy example)
**Decision:** As stated.

### D3. The same correction in format repair

**Question:** What does "allow this in format repair too" mean?
**Answer:** A repair turn may return FAIL where the original said PASS only
when the verdict itself shows the blocking finding (D2): the original reported
it, or a disposition the repair supplied for an omitted ID (D7) marks an
earlier blocking finding `present`. That FAIL is what GateReeve would record
anyway. A repair that keeps the PASS
is normalized to FAIL by D2. Any other outcome change stays a substantive
change and is rejected.
**Answered by:** agent
**Decision:** As stated.

### D4. `present` on a PASS for a non-blocking earlier finding

**Question:** When is `present` accepted on a PASS?
**Answer:** When the earlier finding does not block (`blocking: false`, or low).
This is the case seen downstream: the implementer claimed advisory findings it left
unchanged on purpose, and the reviewer honestly marked them present. The
disposition is accepted as given and recorded as rule `present-non-blocking`.
A `present` blocking finding is D2.
**Answered by:** human (issue #141 scope)
**Decision:** As stated.

### D5. Stale or extra disposition and claim IDs

**Question:** Which IDs are dropped with a note, and which still need repair?
**Answer:**
- A disposition naming an ID disclosed nowhere (not in supplied history,
  claims or the verdict's own findings) is dropped, rule
  `disposition-not-disclosed`. It disposes of nothing GateReeve knows.
- An implementer claim naming a finding no retained review reports is dropped
  before the reviewer starts, rule `claim-not-retained`, recorded on the
  result. Today this refuses the reviewer.
- A disposition repeated with a different status stays a contract error
  (meaning: which status is meant).
- `Open finding <id> cannot be carried as unaffected` stays a repair-turn
  error, now naming `dispositions[i]`: whether an unaffected open finding is
  resolved or still present is meaning.
- A required disposition the PASS omits stays a repair-turn error (meaning).
**Answered by:** human (issue #141 scope); split by agent under the policy
**Decision:** As stated.

### D6. Unknown extra properties

**Question:** What is stripped?
**Answer:** Any property the verdict schema does not define, at any object level
of a verdict (verdict, coverage, findings, criteria, dispositions, dimensions,
coverage decisions, history and mandate assessments), and extra top-level keys
of the `{verdicts}` envelope. Each is recorded with its field path, rule
`unknown-property`. Missing required properties, wrong types and invalid enum
values are not touched: they go to the repair turn with the field path.
**Answered by:** human (policy example)
**Decision:** As stated.

### D7. The repair turn can supply an omitted disposition

**Question:** Why do repairs of a missing disposition fail today?
**Answer:** `validateFormatRepair` compares disposition rows exactly, so a
repair that adds the disposition the error asked for is rejected as a
substantive change (seen twice in the re-tally). A disposition the original
omitted may now be supplied, like any other omitted field; stated dispositions
must keep their status.
**Answered by:** agent (observed defect in the repair path)
**Decision:** As stated.

### D8. Recording and per-rule counts

**Question:** Where are corrections and rejections counted?
**Answer:** Each result keeps `normalized` rows (`rule`, `field`, `id`, optional
`original`), as today. A contract rejection also records a stable
`rejectionRule` on the UNAVAILABLE result. The metrics projection writes one
observation per rule per result (`check: verdict-normalization` or
`verdict-rejection`, `rule`, `count`), so the metrics store holds per-rule
counts. Reporting surfaces are #149.
**Answered by:** human (issue #141 scope: "per-rule rejection and
normalization counts in the metrics store"); shape by agent
**Decision:** As stated.

### D9. Documentation

**Question:** Which documents change?
**Answer:** `PROTOCOL.md`: the normalization rules, the format-repair
allowance, and a corrected paragraph that today says disclosed-but-not-required
disposition IDs are dropped (they are kept; only `historyAssessment.affected`
extras are dropped). Implementer guidance where claims are described: claim
only findings you changed.
**Answered by:** human (issue #141 scope)
**Decision:** As stated.

### D10. Leftovers from PR #152

**Question:** Do #154 and the low PR #152 finding belong here?
**Answer:** #154 (spawn the wrapped reviewer directly) is in the adapter
process code this PR does not otherwise touch: left for its own PR. The PR
#152 finding (a failed read of a just-saved reviewer result drops the outcome
row's reference) is independent of #141 and outside the mandate's scope
constraint: also left for its own change. (First answer folded it in; the
spec planning review found that outside the mandate, see scratchpad S2.)
**Answered by:** agent (coordinating thread asked to fold in only what is in
the path)
**Decision:** Neither is in this PR.
