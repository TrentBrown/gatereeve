# Interview - tb-waiver-light-friction

**Feature start:** 2026-11-25
**Status:** complete

The design input is GitHub issue #145, whose scope the human agreed in the
coordinating thread for tracking issue #150. The interview is therefore short:
it records the settled scope and the implementation questions the agent
answered from the code, for the human to confirm with the design.

## Q1 - Scope

**Question:** What does this feature cover?
**Answer:** Exactly the three items of #145: (1) an explicit human waiver of
`review` and `verification` gets past the verification-coverage check, and is
recorded honestly; (2) a light run's findings-log entries do not need a new
`authorize-implementation`; (3) `run.start` writes the feature base sha so
FEATURE scope works straight after it. Other light-run friction from the same
report (disposition bookkeeping, draft PRs, `gh --slurp`, docs bar, progress
visibility) belongs to #140, #141, #143, #146 and #147.
**Answered by:** human (agreed in the coordinating thread; issue #145 is the record)
**Decision:** Scope is #145 items 1-3 only.

## Q2 - Where the waiver is refused

**Question:** Which check refuses the waiver in the reported scenario?
**Answer:** Reproduced in a protocol test (docs-only second head, narrower
reused verification, one reviewer UNAVAILABLE, waiver of review and
verification with accept). The decision fails with "Required review proof is
missing" because the acceptance check still lists "Verification has uncovered
prior behavior": the coverage check (and the later CI-qualification and
hosted-CI head checks) run whenever the latest verification outcome is PASS
and ignore a current verification waiver. The review waiver itself already
works for an UNAVAILABLE pair.
**Answered by:** agent
**Options:** (a) let a verification waiver cover its coverage and CI-scope
sub-checks, recording each waived residual; (b) add a new waivable "coverage"
gate. (b) adds a protocol surface and a second question for the human.
**Reversibility:** high (one check site).
**Decision:** (a).

## Q3 - Keeping the record honest

**Question:** How is the waived fact preserved?
**Answer:** The verification outcome keeps its real outcome; the residual
coverage/CI-scope failures are attached to the outcome as `waivedCoverage`
(and so retained in the MILESTONE record), and the waive decision records the
observed outcome and reason of each waived gate at decision time
(`observed`). The refusal message names the missing items.
**Answered by:** agent
**Options:** record only the decision text; or record observed facts.
**Reversibility:** high.
**Decision:** Record observed facts on both the decision and the passage.

## Q4 - Findings-log growth

**Question:** How does the findings log grow without re-authorization?
**Answer:** A light run's commitment subject stays the latest authorized
subject while the brief differs from the authorized brief only inside its
findings log (the existing `briefScope` comparison already used for the
delegated hand-back). Any change outside the log yields a new subject, which
still needs authorization. Candidates still pin the exact brief bytes, so
reviews see the log they assessed; a log edit after `candidate.prepare` only
needs a fresh candidate, not a human.
**Answered by:** agent
**Options:** change the subject formula to hash only the scope (breaks the
authority of light runs already in flight); or keep the formula and let the
authorized subject persist (compatible).
**Reversibility:** high.
**Decision:** Keep the formula; the authorized subject persists across
findings-log-only changes.

## Q5 - Feature base sha

**Question:** What does `run.start` record as the feature base?
**Answer:** When it writes the minimal workspace configuration, the merge base
of `HEAD` with the remote-tracking default branch (falling back to the local
default branch), as `featureBaseSha`. If neither resolves, the configuration
is written without it, as today, and the run-start record says why. Existing
hand-written configurations are not rewritten.
**Answered by:** agent
**Options:** fetch first (network side effect); use the default-branch tip
(wrong when the branch is behind).
**Reversibility:** high.
**Decision:** Merge base with the already-fetched default branch, no fetch.
