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
