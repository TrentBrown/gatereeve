# Design - tb-waiver-light-friction

**Status:** approved (gate passed 2026-11-25)

## Problem

The first real light run (issue #145) hit three protocol refusals that pushed
the human outside GateReeve:

1. An explicit human waiver of `review` and `verification` was refused with
   "Required review proof is missing" after CI reused an earlier full run on a
   docs-only head and one reviewer was UNAVAILABLE. The PR was merged outside
   GateReeve and the run is left unmerged in its records.
2. Under supervision, every findings-log entry changed the brief hash and
   needed a new human `authorize-implementation`.
3. FEATURE scope failed with "Feature review must use configured original
   featureBaseSha", because `run.start` writes no feature base.

## Intent

An explicit human waiver is honored and recorded honestly; routine light-run
logging needs no new approval; FEATURE scope works straight after `run.start`.
No integrity, truth or authority rule is weakened.

## Chosen shape

### 1. A verification waiver covers its coverage and CI-scope checks

In the milestone check (`core.js` `checkObserved`), the checks that run after
a PASS verification outcome - prior-coverage (`verificationCoverage`), the
assessed-evidence/CI-qualification check and the hosted-CI exact-head check -
are verification obligations. When the verification gate has a current waiver
(the same `waiverFor` binding as today: subject or content applicability,
risk hash, policy), their failures are attached to the verification outcome as
`waivedCoverage` instead of being added to `missing`. Without a waiver nothing
changes. The waived facts stay visible:

- the verification outcome keeps its real outcome (PASS) and gains
  `waivedCoverage` (the exact residual messages), retained in the acceptance
  `MILESTONE` record;
- a `waive` decision records `observed`: for each waived gate, the outcome and
  reason the acceptance check reported when the human decided;
- the refusal of a waive-and-accept names what is still missing
  ("Required review proof is missing: ...").

A review waiver already satisfies an UNAVAILABLE pair; a finding-scoped review
waiver still cannot replace a missing reviewer. Context and packet integrity
remain unwaivable.

### 2. The findings log grows without re-authorization

`commitments()` for a light run returns the latest authorized subject while
the current brief equals the authorized brief outside its findings log (the
existing `briefScope`). Otherwise it returns the fresh subject, so any goal,
scope or other change still needs `authorize-implementation` (and still hands
a delegated run back). Candidates continue to pin the exact brief bytes.

### 3. `run.start` records the feature base

When `run.start` (or `workspace.configure`) writes the minimal configuration,
it includes `featureBaseSha`: `git merge-base HEAD <remote>/<default>`, else
`git merge-base HEAD <default>`. No fetch. When neither resolves the
configuration is written without it and the record carries the reason.

## Alternatives considered

- A separate waivable "coverage" gate: more surface and a second human
  question for one decision.
- Hashing only the brief scope into the light subject: invalidates light runs
  already authorized under the current formula.
- Using the default-branch tip as the feature base: wrong when the branch is
  behind; fetching first adds a network side effect to `run.start`.

## Constraints

- Protocol source is `plugin-src/shared/resources/protocol/current/`; the
  desktop copy under `apps/desktop/resources/protocol/current/` must match.
- #140 edits `core.js` near the `BOUNDARY_REVIEWED` projection and
  `boundary-review.js`/`execution.js`; this feature stays out of the reviewer
  pipeline.
- Contract stays `gatereeve/current/8`.

## Open risks

- A findings-log edit after `candidate.prepare` still invalidates the
  candidate (its pinned brief bytes); re-preparing needs no human. Accepted:
  reviewers must see the log they assessed.
- Hand-written configurations without `featureBaseSha` keep the current
  refusal; the error is unchanged.

## Changes
