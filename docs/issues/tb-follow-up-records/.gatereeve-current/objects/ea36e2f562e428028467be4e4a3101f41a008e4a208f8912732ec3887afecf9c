# Decision Scratchpad - tb-follow-up-records

**Feature start:** 2026-11-27

Working record of decisions made during this feature's lifetime. Triage at
each PR boundary; promoted entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**.

## S1. Full rigor, supervised

- **Answered by:** human (relayed by the coordinating thread)
- **Decision:** Full rigor, supervised autonomy, feature id
  `tb-follow-up-records`; the issue is the design input and only genuinely
  open choices go to Trent.

## S2. Design approved with the GitHub surface

- **Answered by:** human
- **Decision:** Trent approved the design with interview D10 ("Hybrid, PR
  lists all"), after asking whether follow-ups belong in GitHub issues.

## S3. Spec review rounds 1-5 and implementation authority

- **Answered by:** human
- **Decision:** Five planning review rounds (Codex x4, Claude x1), every
  finding addressed in the spec's Changes section. Trent: "I approve the
  documents and I authorize implementation. Furthermore, I grant mandated
  autonomy for you to complete the rest of the work for this feature."

## S4. Amendment 1 found during implementation

- **Answered by:** agent
- **Decision:** Latest-report rule for review follow-ups (a finding demoted
  when re-reported is a follow-up), the own-repository-name exception to the
  folder redaction, and `follow-up` metric rows for measure 2. Recorded as
  spec amendment 1 before the first candidate.
- **Options:** keep first-raise semantics (leaves demoted re-reports
  untracked, the case #148 exists for); compute measure 2 from finding rows
  (counts re-reports and blocked-then-fixed rows as undecided).
- **Reversibility:** high.

## S5. Measure 2 keeps the #149 reading as a fallback

- **Answered by:** agent
- **Decision:** Without tracking rows, `decided` still reads `followUp` on
  demoted finding rows (the #149 behaviour its tests pin), so earlier
  snapshots and tests keep their meaning.
- **Reversibility:** high.

## S6. Review dispositions on low findings in fixtures

- **Answered by:** agent
- **Decision:** The paired-review fixture does not reliably retain
  dispositions on a low finding (depends on provider order and disclosure),
  so the fixed / unsupported / peer-present / reopen rules are tested through
  the pure `deriveReviewRecords`, with an end-to-end test of decisions
  surviving later rounds.
- **Reversibility:** high.
