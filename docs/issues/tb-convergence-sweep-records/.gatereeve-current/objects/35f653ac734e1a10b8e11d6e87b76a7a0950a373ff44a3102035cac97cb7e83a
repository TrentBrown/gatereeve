# Interview - tb-convergence-sweep-records

**Feature start:** 2026-11-26
**Status:** concluded 2026-11-26

Goal run. GitHub issue #144 (wave 3 of tracking issue #150) and
`docs/issues/tb-convergence-and-retirement/follow-up-feature.md` (AC4, with
the source design's interview D12) are the design input. The human is not
present, so every open choice below is answered by the agent on the merits,
with its alternatives and reversibility, for Trent to check on the PR.

Each entry: **Question** / **Answer** / **Answered by:** `human | agent` /
**Decision** (with alternatives and reversibility for agent entries).

## Binding input (human)

- Source design D12 (approved in `tb-convergence-and-retirement`): a `fixed`
  disposition carries a sweep record with `class`, `sites` (path and line,
  plus the search used), `fix` (where the single source of truth now lives,
  or why there is none), `test` (the class-level test) and `dependents` (what
  depends on the changed code and how it was checked). The schema enforces
  presence; the next round's reviewers verify truth. A missed site of a class
  claimed as swept is a regression of the previous fix, so it blocks in
  rounds 4-5. One site, with the search that proved it, is valid.
- Issue #144 adds the known follow-up: cross-round regression tracking.
- Verdict correction policy (#150): GateReeve corrects only what follows from
  the verdict itself; meaning-changing gaps go to the repair turn.
- The coordinating thread allows folding in issue #134 if it falls naturally
  out of this change, and asks that the record shape stay extensible for
  #148 (follow-up records).

## Entries

### D1. Where a `fixed` disposition lives

- **Question:** Reviewer dispositions are `resolved`, `unsupported`,
  `unaffected`, `present` and `present-low`; there is no `fixed`. What is a
  "fixed disposition"?
- **Answer:** The implementer's claim. `gate.execute` and `review.execute`
  take `claims: [{findingId, claim}]`, which PROTOCOL.md describes as
  "asserted fixes" and also uses for rebuttals. Each claim gains a required
  `disposition`: `fixed` (the implementer changed code to fix the finding) or
  `disputed` (a rebuttal: the finding is not a defect or is intentionally
  unchanged). A `fixed` claim requires a `sweep` record; a `disputed` claim
  must not carry one.
- **Answered by:** agent
- **Alternatives:** (a) a reviewer disposition `fixed` (rejected: reviewers
  verify fixes, the implementer claims them); (b) `disposition` optional, with
  an unlabeled claim treated as not fixed (rejected: an implementer could skip
  the sweep by leaving the label off, which defeats AC4); (c) every claim is a
  fix (rejected: rebuttals are claims too).
- **Reversibility:** an input-contract change; callers add one field. A later
  version can add more disposition values (for example for #148).

### D2. Sweep record shape and validation

- **Question:** What exactly does GateReeve check?
- **Answer:** `sweep: {class, search, sites: [{path, line}], fix, test,
  dependents}`. Every field is required. `class`, `search`, `fix`, `test` and
  `dependents` are non-empty text of at most 4096 characters; `sites` has 1 to
  256 entries, each a non-empty `path` (at most 1024 characters) and a
  positive integer `line`. Unknown keys are rejected. A failure refuses the
  execution before any reviewer starts and names the field, for example
  `claims[0].sweep.search`. GateReeve checks presence and shape only; the
  reviewers verify truth (D12 item 3). Site paths are not checked against the
  candidate: a swept site may have been deleted by the fix.
- **Answered by:** agent
- **Alternatives:** verify paths exist in the candidate (rejected: deleted
  sites are legitimate, and truth is the reviewers' job); `search` inside each
  site (rejected: the source plan has one `search` for the sweep).
- **Reversibility:** reversible; bounds can be relaxed.

### D3. Which class a sweep record sweeps

- **Question:** `class` is text. How does GateReeve match a later finding to
  a swept class?
- **Answer:** By the claimed finding's `classId`, taken from the retained
  review that reported it (claims naming no retained finding are already
  dropped, #141). The record keeps the implementer's `class` text alongside.
  Reviewers are told to give a missed site of a swept class that record's
  `classId`.
- **Answered by:** agent
- **Alternatives:** the implementer supplies a `classId` (rejected: it would
  let the implementer relabel the class reviewers named); match by class text
  (rejected: free text does not match reliably).
- **Reversibility:** reversible; the record carries both values.

### D4. How sweep records reach the next round

- **Question:** "The next round's reviewers receive the sweep records." Only
  the claims of this round, or all of them?
- **Answer:** All records of the open review scope. A boundary review's
  packet carries `sweepRecords: {format: "sweep-record/1", guide, records}`:
  the records built from this execution's `fixed` claims plus every record in
  the inputs of earlier boundary reviews whose revision belongs to the same
  open scope (`state.reviewScopes`). Each record carries `findingId`,
  `classId`, `round` (the round that received the claim) and the sweep
  fields. When a scope closes (integration, split or amendment) its records
  stop being carried, like its round counter. The field is absent when there
  are no records, so packets without claims are unchanged.
- **Answered by:** agent
- **Alternatives:** only this round's claims (rejected: a round-5 reviewer
  would not see the round-4 sweep it must hold the fix to); a new journal
  event per record (rejected: more machinery; review inputs are already
  retained and content-addressed).
- **Reversibility:** reversible.

### D5. A missed site of a swept class is a regression

- **Question:** How does "the next round treats a missed site of a swept class
  as a regression" become mechanical?
- **Answer:** When a boundary review is qualified, a finding whose `classId`
  equals a record's `classId` (records of rounds up to the one being
  qualified) and whose ID is not that record's claimed finding is a
  regression of the previous fix, in addition to the existing path rule. So a
  medium finding of a swept class keeps blocking in rounds 4-5. GateReeve
  never sets a reviewer's `blocking` flag (correction policy): the reviewer
  instructions and the packet guide tell reviewers that such a finding is a
  regression and blocks in rounds 4-5. A finding raised before the sweep that
  is still reported after it is also a missed site.
- **Answered by:** agent
- **Alternatives:** compare the finding's origin round with the record's round
  (rejected: a site already known when the sweep was claimed and still present
  afterwards is exactly a missed site).
- **Reversibility:** reversible.

### D6. Fold in #134 (peer re-report loses a regression's origin)

- **Question:** Fold in #134?
- **Answer:** Yes. It is the same class as #144's cross-round regression
  tracking and the same function (`findingObligations`' peer prepass). Two
  changes: the prepass counts a peer's re-reported finding ID as still
  present, so a peer's `resolved` cannot clear the origin; and reviews of one
  round are grouped by the round policy's scope, round and revision (the
  boundary review packet's `roundPolicy` gains `revision`), so two individual
  selection-tagged reviews of one round are judged together. Inputs without a
  revision keep the old grouping (`reviewRound`, else the result itself).
- **Answered by:** agent
- **Alternatives:** leave #134 for a separate PR (rejected: the fix sits in
  the code this change edits and has the same tests).
- **Reversibility:** reversible.

### D7. Scope limits

- **Question:** Planning reviews, light runs, metrics?
- **Answer:** Planning reviews take no claims, so they are unchanged. Light
  runs use the same review path and get the same behavior. Metrics for sweep
  records are not added (AC11's remainder is #149).
- **Answered by:** agent
- **Reversibility:** additive later.

### D8. Rigor and autonomy

- **Answered by:** human (relayed by the coordinating thread)
- **Decision:** Full rigor with goal autonomy: "Run it as its own GateReeve
  feature run at full rigor ... with goal autonomy: Trent granted goal autonomy
  for tonight's work and is asleep".
