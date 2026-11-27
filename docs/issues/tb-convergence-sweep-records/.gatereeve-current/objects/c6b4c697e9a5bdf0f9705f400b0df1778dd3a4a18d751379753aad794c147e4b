# Design - tb-convergence-sweep-records

**Status:** draft

GitHub issue #144 (AC4 of `tb-convergence-and-retirement`, moved to its
follow-up feature by D36), with the cross-round regression tracking follow-up
and issue #134 folded in. Settled entries are in `interview.md` (D1-D8).

## Problem

Review rounds do not converge: in the source run, several rounds found the
same defect class (regression-origin tracking) through a new path each time.
An implementer can claim a finding fixed without saying whether every site
of its class was found, so the next round has nothing to hold the fix to, and
a missed site of the class reads as a new, demotable finding in rounds 4-5.
Separately (#134), a peer that re-reports a regression as a finding, rather
than through a `present` disposition, is not counted as still present, so the
other peer's `resolved` clears the regression's origin; and two individual
selection-tagged reviews of one round are never grouped as one round.

## Intent

A fix claim states the class it fixes and the sweep that found every site.
GateReeve enforces the record's presence and shape; the next rounds' reviewers
receive the records and verify them; and a later finding of a swept class is
a regression of the previous fix.

## Chosen shape

1. **Claims carry a disposition (D1).** `claims[i]` is `{findingId, claim,
   disposition, sweep?}` with `disposition` `fixed` or `disputed`. `fixed`
   requires `sweep`; `disputed` forbids it. Validation moves from the inline
   loop in `execution.js` to a new module `current/sweep-records.js`.
2. **Sweep record (D2).** `{class, search, sites: [{path, line}], fix, test,
   dependents}`, all required, bounded, unknown keys rejected; errors name the
   field path. One site is valid.
3. **Swept class (D3).** Records take `classId` from the claimed finding in
   retained history.
4. **Next-round input (D4).** Boundary-review packets carry
   `sweepRecords: {format, guide, records}`: this execution's records plus the
   open scope's earlier records. The packet's `roundPolicy` gains `revision`.
   Reviewer instructions point to the guide in one sentence.
5. **Regression rule (D5).** `roundSchedule` (`boundary-review.js`) collects
   the open scope's records; its `blocks` treats a finding of a swept class
   (other than the claimed finding) as a regression.
6. **#134 (D6).** In `review-findings.js`, the prepass counts re-reported
   finding IDs as present, and groups reviews by round policy scope, round and
   revision.
7. **Docs.** PROTOCOL.md (claims, sweep records, round policy regression
   definition), `commands/pr-review.md` (how to write fixed and disputed
   claims), desktop protocol mirror restaged.

## Boundaries and parallel work

#142 and #143 edit `execution.js` and reviewer instructions in parallel. The
edits there are kept to: claim validation call, packet fields, one instruction
sentence. Everything else lives in `sweep-records.js`, `review-findings.js`
and `boundary-review.js`'s schedule. #148 (follow-up records) can extend the
record with new optional fields under a new format version.

## Risks

- Existing callers that send `{findingId, claim}` are refused until they add
  `disposition`. The error names the field and the allowed values.
- Class matching depends on reviewers reusing a record's `classId` for a
  missed site; a reviewer that invents a new `classId` gets only the path
  rule. The guide states the rule; the paired peer is the second check.

## Changes

Append design revisions here.
