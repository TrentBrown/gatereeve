# Interview - tb-review-self-validation

**Feature start:** 2026-11-26
**Status:** concluded 2026-11-26

Short design step under goal autonomy. The human agreed the scope and the
correction policy in the coordinating thread (tracking issue #150); GitHub
issue #142 is the design input. The human is not present, so every open choice
below is answered by the agent on the merits, with its alternatives and
reversibility, and listed on the PR for the human to check.

Each entry: **Question** / **Answer** / **Answered by:** `human | agent` /
**Decision**, plus **Alternatives** and **Reversibility** for agent entries.

## Binding policy (human, coordinating thread)

GateReeve may correct a verdict automatically only where the answer follows
from the verdict itself. Anything that changes meaning goes back to the
reviewer through the repair turn with the exact field path, and is never
guessed. The self-validation check stays read-only inside the reviewer
sandbox; the sandbox is not widened.

## Evidence base: read-only tally (2026-11-26)

Read in place from every local run store's retained result objects (53 stores,
378 review/code/spec/judge results, 92 UNAVAILABLE). Classes this change
targets:

| Class | Seen | Handling in this PR |
| --- | --- | --- |
| Reviewer chose UNAVAILABLE because the spec says the global Definition of Done applies and it is not in the pinned materials (one run, repeated every round) | ~10 | The packet carries the Definition of Done (D5) |
| Reviewer chose UNAVAILABLE because a rubric row is a live or deployment acceptance check that can only run after merge | ~4 | The row is marked after-merge and left out of boundary review (D6) |
| Verdict rejected by the contract (`contract`), then repaired or not | 11 | Reviewers check the verdict themselves before answering (D1-D3) |
| `Missing supported disposition` for an earlier finding | 2 | Peer findings: `not-assessed` (D4); own findings: repair turn, unchanged |
| Reviewer chose UNAVAILABLE for incomplete manual evidence | several | Out of scope (evidence the run must supply) |

## Entries

### D1. How a reviewer validates its verdict inside a read-only sandbox

**Question:** Issue #142 asks for a read-only `validate-verdict` check
available inside the reviewer sandbox. The Claude reviewer has only Read,
Glob and Grep, so it cannot run a command; Codex runs a read-only shell. How
is the check offered to both without widening either sandbox?
**Answer:** As one MCP tool, `validate_verdict`, served over stdio by a
GateReeve process that the provider CLI starts for the reviewer. The tool
takes the verdict object the reviewer intends to return and answers with
GateReeve's own contract result. The server reads one context file that
GateReeve wrote into the sealed, read-only reviewer view, writes nothing,
opens no network connection and runs no command. Claude gets it through
`--strict-mcp-config --mcp-config` (only this server) and an allow rule for
exactly this tool; Codex through `-c mcp_servers.gatereeve.*`. Both providers
were checked with the installed CLIs: each called a read-only MCP tool from
its sandbox (Claude `--restricted` with Read/Glob/Grep, Codex
`--sandbox read-only`).
**Answered by:** agent
**Alternatives:** (a) a shell command: Codex only, and giving Claude a shell
widens its sandbox; (b) a rules file the reviewer reads: it cannot execute
the checks, so it would drift from them; (c) only GateReeve's existing repair
turn after the answer: no in-turn check, which is what the issue asks for.
**Reversibility:** reversible; adapters without the capability run exactly as
before, and the tool can be removed without touching retained results.
**Decision:** As stated.

### D2. One contract for the tool and for the recorded verdict

**Question:** How is it guaranteed that a verdict the tool accepts is also
accepted when GateReeve records it?
**Answer:** The per-verdict checks of the review execution (envelope,
unrequested gate, unknown-property strip, schema, verdict rules, coverage
decisions, mandate, format repair, namespaced identity) move into one exported
function. The execution and the tool call that same function with the same
context (gates, candidate criteria and paths, delta paths, history, claims,
closures to reconsider, coverage claims, mandate, repair original, provider).
A test runs the tool and the execution on the same verdicts and requires the
same acceptance and the same message.
**Answered by:** agent
**Alternatives:** a separate, simplified validator for the tool (rejected: it
would accept verdicts the execution rejects).
**Reversibility:** refactor only; behavior of the execution is unchanged.
**Decision:** As stated.

### D3. What the tool reports

**Question:** What does `validate_verdict` return?
**Answer:** For each requested gate: `valid`, the first contract error with
its field path (the same text the repair turn would receive), the outcome
GateReeve would record, and the correction rules it would record (for example
`pass-with-blocking-finding`). The reviewer corrects only what it reports and
calls it again. The tool never changes the verdict itself. A reviewer that
does not call it is not penalized; GateReeve's own check and the single
repair turn still apply.
**Answered by:** agent
**Alternatives:** return every error at once (rejected: the execution stops at
the first error, so later messages could be wrong after a fix).
**Reversibility:** reversible.
**Decision:** As stated. The receipt records whether the tool was offered
(`isolation.selfValidation`).

### D4. `not-assessed` for a missing peer disposition

**Question:** On a PASS, a reviewer may give no disposition for an earlier
finding its paired peer raised. Today this rejects the whole verdict
(`Missing supported disposition`). What follows from the verdict itself?
**Answer:** Only that this reviewer did not assess that finding. GateReeve
records a `not-assessed` disposition for it (rule `peer-not-assessed`) and
accepts the verdict. `not-assessed` never resolves anything: the finding stays
open in every ledger, the member stays unreconciled for it, and the peer that
raised it still owns it. A reviewer's own earlier finding, a row with a wrong
status, and an open finding carried as `unaffected` are unchanged: they go to
the repair turn. A peer finding is one whose recorded provenance names the
other provider of the selection.
**Answered by:** agent
**Alternatives:** (a) count the peer's same-round resolution as reconciliation
for this member (saves one re-review, but decides for the reviewer that the
peer's assessment stands; left for a later change); (b) keep rejecting
(rejected by the issue).
**Reversibility:** reversible; one rule in the verdict check.
**Decision:** As stated.

### D5. Documents a spec incorporates by reference

**Question:** Which referenced documents enter the packet, and what happens
when one cannot?
**Answer:** Two kinds. (1) The global Definition of Done: the spec template
says "The global Definition of Done in the software development workflow
applies", but no such document existed. This PR adds it as one canonical file
shipped with the protocol, and a spec whose Definition of Done section names
it gets that file in the packet. (2) Relative Markdown links in `spec.md` to
files in the feature home that the packet does not already carry (for
example `interview.md`). Each document is captured into the execution input,
so the result is bound to its bytes, and written into the reviewer view under
`incorporated/`. A link that does not resolve to a regular file inside the
feature home, or exceeds the bounds (16 documents, 256 KiB each), becomes a
non-blocking note in the packet. External URLs are never fetched. Reviewers
are told that a missing incorporated document is a note, not by itself a
reason for UNAVAILABLE; but when a selected criterion cannot be judged
without it, the reviewer fails that criterion with evidence naming the
missing document. A missing required document therefore never yields a PASS,
and the human sees an actionable FAIL (include or shrink the document)
instead of a reviewer outage (design review round 1).
**Answered by:** agent
**Alternatives:** (a) only a note for the Definition of Done, no document
(rejected: the reviewer still cannot check project rules); (b) incorporate
every link anywhere in every planning document (rejected: unbounded).
**Reversibility:** reversible.
**Decision:** As stated.

### D6. After-merge criteria

**Question:** How does GateReeve know a rubric row can only be checked after
merge, and what happens to it?
**Answer:** The spec marks it: the row's criterion text starts with
`After merge:`. Such a row is left out of boundary review. `candidate.prepare`
refuses to select it, and a FEATURE candidate covers every row that is not
marked (instead of every row). The packet lists the marked rows in
`afterMergeCriteria`, and reviewers are told not to score them, report them as
coverage limits or return UNAVAILABLE for them. The classification is a
separate function, so the planning parser and its validation binding do not
change (no re-validation of existing specs). Completion does not assess these
rows; that remains with the human or a later change.
**Answered by:** agent
**Alternatives:** (a) a new rubric column (rejected: changes the extractor and
existing tables); (b) let the reviewer decide which rows are post-merge
(rejected: a guess by the policy); (c) a completion-time assessment of those
rows (rejected: new mechanism beyond #142).
**Reversibility:** reversible; a spec without the marker is unaffected.
**Decision:** As stated.

### D7. Repair-turn tokens and duration

**Question:** Where are a repair turn's tokens and duration recorded?
**Answer:** Each execution already retains its provider usage, so the record
is the attribution. The execution receipt records which attempt it was
(`initial`, `transient-retry` or `repair`); each paired outcome row lists its
attempts with their result, token usage and duration; and the metrics
projection stores each review result's attempt, duration and tokens. Unknown
usage stays null, never zero.
**Answered by:** agent
**Alternatives:** a new metrics table (rejected: observation rows suffice; #149
owns surfaces).
**Reversibility:** reversible; additive fields.
**Decision:** As stated.

### D8. Scope fences

**Question:** What stays out?
**Answer:** `publication.js` and `review.publish` (#155), storage roots (#159),
`briefScope` (#156/#157), metrics surfaces (#149), incomplete manual evidence,
and a completion-time assessment of after-merge rows. Contract stays
`gatereeve/current/8`; retained results replay unchanged.
**Answered by:** agent (from the mandate's constraints)
**Decision:** As stated.
