# Decisions - tb-review-honest-unavailability

**Feature start:** 2026-11-25

Permanent record of decisions promoted from `scratchpad.md` at the PR
boundary. The design-phase decisions D1–D6 are in `interview.md`.

## DEC-1. Rigor "standard" maps to full (scratchpad S1)

- **Answered by:** agent
- **Decision:** GateReeve has only full and light rigor, so #150's
  "standard" runs as full, with a short design step.

## DEC-2. Mandated autonomy with a fixed mandate (S2)

- **Answered by:** human
- **Decision:** The human granted mandated autonomy at the design gate and
  confirmed the fixed mandate with "Proceed". The mandate: deliver #140 as
  designed in one PR with `Closes #140`; no merge without the human; keep to
  #140's scope; no local paths or other projects in public text; never
  extract, copy or commit run stores.

## DEC-3. Six spec review rounds (S3)

- **Answered by:** human (round 6); agent (fixes)
- **Decision:** Five Codex spec reviews FAILed with narrowing, valid
  findings, each fixed. At the round-6 hand-back the human chose a sixth
  review, which PASSed. Implementation authority cites that PASS.

## DEC-4. Outcome rows follow the attempt that launched (S4)

- **Answered by:** agent
- **Decision:** A reviewer's row is classified across its attempts in the
  round (first, transient retry, repair). It is `refused` only when no attempt
  launched a reviewer.
- **Reversibility:** internal; the recorded fields are additive.

## DEC-5. Round count at provider launch (S5)

- **Answered by:** agent
- **Decision:** The per-reviewer round count runs immediately before the
  provider launch, so a packet-assembly refusal charges no round.

## DEC-6. Repair turn unchanged; stale doc corrected (S6)

- **Answered by:** agent
- **Decision:** The repair turn already covered both providers. Only the
  stale "Claude-only retry" sentence in PROTOCOL.md changed.

## DEC-7. Run-store objects stay out of the PR

- **Answered by:** agent
- **Decision:** Git tracking of evidence is optional. This feature's
  `.gatereeve-current/` objects contain local absolute paths, so they stay
  local and uncommitted, retained in the run store. No ignore rule changed.
- **Alternatives:** commit the objects, as an earlier feature did (rejected
  for this public PR).

## DEC-8. Measurement recorded for reviewers (AC8)

- **Answered by:** agent
- **Decision:** The re-measurement (#140 step 1) is recorded in
  `interview.md` under "Evidence base". The boundary review packet does not
  include `interview.md`, so the same section is reproduced here verbatim for
  the reviewers to check (round 1 found R8 unverifiable).

### Measurement (copied verbatim from interview.md "Evidence base")

Measured 2026-11-25, read-only, from every local run store's retained objects
(28 stores) and every local run archive (7, parsed in memory). Plugin versions
are attributed by the result's completion time against release tag dates, since
run stores do not record the plugin version; treat the split as approximate.

**Review results:** 219, of which 75 (34%) UNAVAILABLE.

| Cause | Count | Versions |
| --- | --- | --- |
| Verdict rejected by bookkeeping/semantic contract (dispositions, claims, PASS with present blocking finding, format repair) | 30 | rc.30, rc.31 |
| Reviewer chose UNAVAILABLE (could not assess: missing evidence or post-merge criteria) | 15 | rc.26–rc.33 |
| Provider failure (11 transient service failures, 1 unsupported model) | 12 | rc.26, rc.30 |
| Malformed JSON | 8 | rc.30, rc.31 |
| Schema shape (missing or extra field) | 8 | rc.30, rc.31 |
| Run-level precondition recorded as a result (planning lint: tracker names an unknown criterion; no reviewer launched) | 2 | rc.33 |

| Version | Results | UNAVAILABLE |
| --- | --- | --- |
| rc.26 | 34 | 3 |
| rc.29 | 16 | 1 |
| rc.30 | 63 | 25 |
| rc.31 | 98 | 43 |
| rc.33 | 8 | 3 |

**Rounds that wrote no reviewer result** (from run-store event logs, which
only the newer stores have): 2 `BOUNDARY_REVIEWED` events (4 provider outcomes)
recorded every provider `unavailable` although no reviewer ran:

- rc.31: "Disposition claim lacks a retained finding" (an implementer claim
  named an ID GateReeve no longer held).
- rc.33: "This assessment requires actual applicable verification evidence"
  (no verification result yet). Both counted a review round.

**Still occurring on rc.33.** rc.33 has only 8 results, too few to rate
frequencies. Every rejection message in the table above is still present in
the rc.33 source (and `main` is identical to rc.33 for the four files this
change edits), so each cause remains reachable. Observed on rc.33: the
verification precondition refusal, the planning-lint precondition recorded as
results, and one reviewer-chosen UNAVAILABLE.
