# Pr Review

Read `<plugin-root>/resources/PROTOCOL.md` for the current operation/input contract.

For the required boundary review, discover available native execution models and
record two different provider choices through `review.select`. Prefer capable
daily-driver models at high supported effort; honor developer instructions,
record class judgments honestly and reuse the pair during the run. No model
selection configuration or hard-coded version list is required.

Prepare pinned source, current requirements, applicable Verification and bounded
review history first. Use `review.execute` to run both fresh contexts in parallel.
Each independently covers code, requirements, evidence, scope and findings.
Initial reviewers do not inherit implementation conversation or the peer report.
Each searches for new supported defects and verifies affected fixes/interactions.

Retain both results and reviewer provenance. Reconcile duplicate findings without
losing their original IDs. Supply labeled disposition claims and per-provider
qualified delta priors for follow-up; the implementer cannot author reviewer
clearance. Individual `gate.execute review` assessments cannot satisfy the pair
by themselves. Missing/unavailable review stays unavailable, never approval.

Claim only findings you changed. A claim asks the reviewer to confirm a fix, so
do not claim advisory findings you intentionally left unchanged; their open
state already carries forward (a reviewer may still mark one `present` on a
PASS when it does not block). Limit follow-up fix claims to new or affected
repairs. Carry forward unchanged closures with supported history applicability;
repeating a fix claim requires a new supported disposition for that finding. A
claim naming a finding GateReeve no longer holds is dropped and recorded
(`claim-not-retained`). A reviewer PASS that gives no disposition for a finding
its paired peer raised records it `not-assessed` (`peer-not-assessed`); the
finding stays open, so claim the fix and let the raising reviewer confirm it.
Reviewers can check their verdict with GateReeve's read-only
`validate_verdict` tool before they answer. Mark a rubric row that can only be
checked after merge by starting its criterion with `After merge:`; boundary
reviews leave it out. In the automatic repair turn the reviewer may supply a
disposition it omitted, but changing a stated disposition still needs a fresh
assessment.

Supervised/delegated disputes require material clearance from both perspectives;
return persistent disputes to the human with evidence. Under explicit autonomous
authority only, use `review.adjudicate` for eligible in-mandate judgment calls,
residual risk and diminishing-returns stopping. Preserve FAIL and dissent.
Mandatory failures, missing perspectives and mandate violations still block.
Publish both perspectives and any adjudication with `review.publish` before
presenting the PR. Supplemental code/spec/Judge reviews remain optional.
