# Design - tb-review-honest-unavailability

**Status:** approved (gate passed 2026-11-25)

GitHub issue #140 (PR 1 of the reviewer-pipeline sequence in tracking issue
#150). Settled entries are in `interview.md` (D1–D6), with the
re-measurement.

## Problem

Paired boundary review (`review.execute`) reports reviewers `unavailable` for
causes that are not reviewer outages, and spends review rounds on them:

- A run-level precondition (no passing verification) is thrown once per
  reviewer and recorded as each provider `unavailable`, and the round is
  counted although no reviewer ran.
- Every non-completed outcome is a single `unavailable`, so a provider outage,
  a rejected verdict, and a reviewer that honestly could not assess look alike.
- A transient provider failure (rate limit, 5xx) loses the reviewer for the
  round.
- Several contract rejections do not say which field or finding failed, so the
  reviewer's repair turn and the implementer cannot target the fix.

Re-measured on 2026-11-25: 75 of 219 local review results (34%) were
UNAVAILABLE; 2 more rounds recorded `unavailable` for every provider without
running a reviewer. Every cause is still reachable on rc.33.

## Intent

A boundary review reports only what happened: a refusal before any reviewer
ran is an operation refusal (or a `refused` outcome), not an outage, and costs
no round. A reviewer that ran and failed is reported by cause, still counts,
and a transient failure gets one automatic retry. Rejections name what to fix.

## Chosen shape

1. **Fail fast (D1).** Extract the consumed-proof resolution and verification
   requirement from `executeGatesPrepared` (`execution.js`) into one exported
   helper. `executeBoundaryReviews` (`boundary-review.js`) calls it before
   `REVIEW_ROUND_STARTED`. A missing or non-passing verification throws a
   `ProtocolError` with code `VERIFICATION_REQUIRED` whose message names
   `candidate.prepare` → `gate.execute ["verification"]` → `review.execute`.
   The per-reviewer path uses the same helper, so an individual
   `gate.execute ["review"]` refuses the same way. Nothing is appended.
2. **Outcome statuses (D2).** `BOUNDARY_REVIEWED` outcome rows get
   `completed | refused | provider-failed | verdict-rejected |
   could-not-assess`. A per-reviewer error thrown before the job was admitted
   is `refused`; a result is classified from its `unavailableReason`
   (`provider-error`/`timeout` → `provider-failed`; `contract`/`malformed-json`
   → `verdict-rejected`; `missing-evidence` → `could-not-assess`; a result
   whose reviewer never launched, for example a packet-assembly precondition,
   → `refused`). Each non-completed row carries `reason`.
3. **Round counting (D3).** The per-reviewer `countReviewRound` moves from
   before job admission to immediately before the provider launch. The
   `BOUNDARY_REVIEWED` projection (`core.js`) counts the round unless every
   outcome is `refused`. Pre-change events have no `refused` rows, so replay
   is unchanged.
4. **Transient retry (D4).** Results record the provider failure category
   (`providerFailure`). In `executeBoundaryReviews`, an UNAVAILABLE result
   with category `transient-service-failure` is re-executed once with a
   distinct operation identity on the same baseline; the existing repair turn
   then applies to the retry's outcome.
5. **Repair turn (D5).** Already offered to both providers; unchanged, covered
   by existing tests plus one new combined test.
6. **Messages (D6).** Rejections in `checkVerdict`, `validateFormatRepair` and
   the claim check keep their leading sentence and append the field path or
   finding/claim ID.
7. **Docs.** `PROTOCOL.md` documents the statuses, the refusal and its
   order, round counting and the retry. The desktop protocol mirror is
   restaged (`npm run stage:protocol`).

## Alternatives considered

- **Only classify, never refuse (handoff option 2):** would still append
  `BOUNDARY_REVIEWED` and `REVIEW_ROUND_STARTED` for a round that cannot run.
  Rejected for verification; kept as the fallback (`refused`) for other
  per-reviewer preconditions that are not checked up front.
- **Stop counting all-`unavailable` rounds on replay:** would retroactively
  lower counters and re-band retained proof in existing runs. Rejected in
  favor of the new `refused` marker.
- **Retry timeouts too:** a timed-out review usually takes the full timeout
  again. Rejected; timeouts are reported as `provider-failed`.
- **New result-level `unavailableReason` codes:** unnecessary, since the
  existing codes already separate the classes; the boundary status is derived
  from them.

## Constraints

- Contract stays `gatereeve/current/8`; existing runs replay unchanged.
- Keep scope to #140: no verdict normalization (#141) or packet completeness
  and reviewer self-validation (#142), which follow on the same files.
- #145 runs in parallel and may touch `core.js` near the `BOUNDARY_REVIEWED`
  projection; expect a small merge conflict.
- Edit `plugin-src/`; restage the tracked desktop mirror; never edit `dist/`.
- Public text names no local paths or other projects.

## Open risks

- Version attribution in the measurement is by date, not recorded version.
- Moving the round count past job admission means a crash between job start
  and provider launch leaves the round uncounted until `BOUNDARY_REVIEWED`;
  this errs toward not charging a round in which no reviewer ran.
- The transient classifier is a stderr regular expression in the local
  adapters; a misclassified permanent failure gets one wasted retry.

## Changes
