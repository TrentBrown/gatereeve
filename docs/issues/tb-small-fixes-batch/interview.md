# Interview - tb-small-fixes-batch

**Feature start:** 2026-11-25
**Status:** concluded

Started as a light run for issue #146. The independent brief review found that
accepting non-draft PRs in `merge.prepare` changes a documented contract, so
the human raised the run to full rigor. The other #146 items are settled in
`brief.md` and carry over unchanged.

## Q1 - Accept open PRs, or explain the draft requirement?

**Question:** #146 allows either accepting a PR that is ready for review in
`merge.prepare`, or explaining the draft requirement up front. Accepting it
changes the documented contract.
**Answer:** "Accept open PRs, go full".
**Answered by:** human
**Decision:** `merge.prepare` accepts open non-draft PRs; the run is full rigor.

## Q2 - How should draft state be recorded and matched?

**Question:** If the prepared merge action records draft state, should it be a
field only for non-draft PRs (`draft: false`) or always present? And if
draft status flips after authorization, should `merge.execute` refuse or
merge anyway?
**Answer:** "`draft: false` only" and "ignore and merge". Once told the two
answers conflict (a field in the matched action makes a flip a mismatch), the
human said: "I want to relax any restrictions on whether a PR is draft or not
draft. Re-examine these two questions in that light."
**Answered by:** human
**Decision:** Draft status is not a GateReeve precondition anywhere. The
prepared action does not record it, so a flip never invalidates an
authorization. `merge.execute` still marks a draft ready, because GitHub cannot
merge a draft. Nothing turns a PR back into a draft afterwards: the "restore
draft" steps existed only so a retry could pass the old draft-only
preparation check.

## Q3 - Does the relaxation reach `goal.park`?

**Question:** `goal.park` also requires an open draft PR.
**Answer:** Covered by the Q2 instruction ("relax any restrictions on whether a
PR is draft or not draft").
**Answered by:** human
**Decision:** `goal.park` accepts any open PR whose description lists every
blocker. Open drafts stay the documented default for new GateReeve PRs, as a
recommendation, not a check.
