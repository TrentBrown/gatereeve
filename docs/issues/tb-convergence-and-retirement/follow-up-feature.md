# Follow-up feature - remaining convergence and retirement work

**Origin:** `tb-convergence-and-retirement`, cut at the human's direction on
2026-11-24 so the delivered work (slice 1, PR A, PR B1, PR C1) can ship as a
release first.
**Status:** seed for a new GateReeve feature run; not started.

## Recommendation: what to do first (convergence speed)

Measured in the source run after PR B1 and PR C1:

- **Fixed:** rounds lost to contract and bookkeeping rejections. C1's 12
  reviewer results across 6 rounds produced no contract rejection and no
  repair turn.
- **Fixed:** cost per round. Local verification now takes about 8 minutes,
  and a paired round about 25-35 minutes. Hosted CI runs once, after
  convergence.
- **Not fixed:** the number of rounds. B1 took 4 rounds and C1 took 6, after
  a pre-review. In nearly every round the reviewers, mostly Codex, confirmed
  the earlier fixes and then found new, narrower edge cases in the same area,
  rated "high". C1's round policy only bounds this at the round 6 hand-back:
  in rounds 4-5 high findings still block.

Do these first, in this order:

1. **AC4 - class-level fix records (sweep records).** Every `fixed`
   disposition names the defect class, all sites with their search, the fix,
   the test and the dependents. The next round treats a missed site of a swept
   class as a regression. Several C1 rounds hit one class (regression-origin
   tracking) through a new path each time.
2. **AC8 - failure model in specs.** Add a required `Failure model` section, a
   lint for unbounded words, and the rule that out-of-model findings are rated
   low (non-blocking). Most of C1's round 4-6 findings were unusual
   combinations of conditions.
3. **Severity calibration** (small; not yet an AC). Reviewer instructions
   should make a finding that "needs an unusual combination of conditions"
   reliably low, as D8 already defines.

## Remaining scope moved here from the source spec

- **AC4** - sweep records (all of it).
- **AC5 (remainder)** - read-only `validate-verdict` in the reviewer sandbox;
  mechanical normalization of misplaced known fields; `not-assessed` for a
  missing peer disposition; repair-turn tokens and duration recorded;
  per-rule rejection and normalization counts in the metrics store.
- **AC7** - follow-up records with origin data and a generated
  `follow-ups.md`; Completion refused while any follow-up is undecided; bulk
  decisions; `policy-default` authority (low accepts risk, medium becomes new
  work); goal runs file medium follow-ups as issues and park on open high.
  This is the main gap left in the shipped round policy: demoted findings
  stay visible but are not tracked to a decision.
- **AC8** - failure model in specs (all of it).
- **AC11 (remainder)** - per-finding and per-reviewer metrics fields; the four
  D6 measures from the store alone; CLI status and desktop surfaces; user
  guide.
- **AC12** - reviewer input and activity retention: prompt, input, schema and
  event streams stored and reconstructible; Claude via stream-json.

## Known follow-ups (not in the source spec)

- Exit-time SIGABRT in isolated `node --test` processes under load (source
  scratchpad [10]); CI reruns of the failed job are the workaround.
- Cross-round regression tracking: Codex's round-6 findings on C1 were fixed
  in `ad075ed` but not re-reviewed (human waiver). Further edge cases may
  exist. Raised since, against the merged code (docs PR #132 review):
  - a peer that re-reports a finding as a finding, rather than through a
    `present` disposition, is not counted as "still present", so a peer's
    `resolved` can still clear the original regression origin
    (`review-findings.js` peer prepass; Codex, high);
  - individual selection-tagged reviews have no shared `reviewRound`, so peer
    disagreement between two individual results is not grouped (Claude,
    low).
- Two pending verification jobs from before the run moved from Playpen to aws-1
  cannot be abandoned: they predate owner records.
- PR A open items:
  - isolation evidence should also count execution records;
  - a tombstone inventory lstat race in `inspectScratch`;
  - the doctor's quick inventory walks mount-root runs;
  - a stale `purge-test-data --apply` line in PERFORMANCE.md;
  - a regenerable-set test pinned to the constant;
  - PID reuse in slice-1 escalation (`local-agent-adapters.js`).
- Purge test rows from the live metrics store on Playpen
  (`metrics purge-test-data --workflows-file`).
- PROTOCOL.md overstates disposition normalization (B1 round 4, low).
