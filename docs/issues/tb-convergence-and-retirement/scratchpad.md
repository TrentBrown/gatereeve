# Decision Scratchpad - tb-convergence-and-retirement

**Feature start:** 2026-11-21 (Mac); continued on Linux 2026-11-22

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Low severity takes precedence over the regression rule

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Context:** Planning review F5 found D7 (regressions of the previous fix block
in rounds 4–5) and D8 (low findings never block) contradict for a low
regression.

**Options:** low never blocks, even as a regression; regressions block at any
severity.

**Decision:** Low never blocks in any round. Rounds 4–5 block high findings and
medium regressions of the previous fix. A low regression becomes a follow-up.

**Rationale:** D8 defines low as unusual conditions or out-of-model, which is
the class whose pursuit caused non-convergence; the human approved D8 without
exceptions. Reversible by a later amendment.

## [2] Lock probe before launch for refusal fallback

[ ] **Promote**

**Answered by:** agent

**Confidence:** MEDIUM

**Context:** Planning review F2: the design requires an unwrapped launch when
`systemd-inhibit` refuses, but a refusal inside the wrapper would look like a
reviewer failure.

**Options:** probe before launch; inspect wrapper stderr after a failure and
relaunch.

**Decision:** Probe the lock with `systemd-inhibit … true` before each launch;
a non-zero probe exit launches unwrapped with `idleInhibitor: false`.

**Rationale:** Keeps reviewer failures and lock refusals distinguishable at the
cost of one short process per launch, and never relaunches a reviewer.
Reversible.

## [3] Open-PR status unknown skips the worktree

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Context:** Planning review F3: open-PR worktrees must always be skipped, but
other candidate rules (merged branch, COMPLETE run) could select a worktree
whose PR state cannot be read.

**Decision:** Skip any worktree whose open-PR status cannot be established,
with reason `pr-state-unknown`.

**Rationale:** Fails safe on an irreversible deletion. Reversible.

## [4] Local evidence rule, legacy compatibility and the exact regenerable set

[ ] **Promote**

**Answered by:** agent

**Confidence:** MEDIUM

**Context:** Second planning review F1–F3 asked the spec to settle the local
evidence the design left open, the boundary for runs from earlier contracts,
and the sweep's exact regenerable set.

**Decision:** (a) Each round's Verification has a receipt on the candidate tree
plus focused-test receipts for every changed source area and every affected
suite, assessed by reviewers. (b) New contract rules apply to reviews executed
under this version; retained results keep their outcome with `unrated`
findings. (c) A fixed list of git-ignored directory names, extendable only by
local git configuration; anything else ignored is listed.

**Rationale:** Each fails safe or preserves existing proof; none weakens an
obligation. Reversible by amendment.

## [5] Scratch retention limits

[ ] **Promote**

**Answered by:** agent

**Confidence:** MEDIUM

**Context:** D28 asked for an age and count limit on scratch reports and an age
limit for stranded runs without numbers.

**Options:** 7/14/30/90 days; 1,000/5,000/20,000 reports.

**Decision:** Reports: 30 days, then newest 5,000, never a report whose run
folder still exists. Stranded runs: older than 7 days with dead owners.

**Rationale:** Reports are 4 KiB each and useful for a few weeks of diagnosis;
5,000 covers several full test-heavy weeks if tests ever leak again. Seven days
outlives any review or release job. Reversible.

## [6] PR A: a third, delta-only paired round for blocking fixes

**Answered by:** human (2026-11-23, "Fix + one delta round")

**Context:** After the two paired rounds D33 allows, round 2 still raised four
blocking findings (purge name pattern matching real folders, unreachable
tombstone reclaim, global git config in the sweep skip list, check replacement
not bound to a recorded boundary pair). D33 says blocking findings are still
fixed, and acceptance needs a passing pair on the current candidate, so any
fix needs a further round.

**Decision:** Fix all four (plus the cheap non-blocking bury-failure and
mounted-count findings), verify once, and run one delta paired round limited
to these fixes. Non-blocking findings after it are adjudicated; no further
rounds for PR A.

**Rationale:** Two of the four could delete real data; accepting them as risk
contradicts D33. One short delta round costs about 45 minutes.

## [7] PR A: purge deletes only human-named workflows; full-suite isolation evidence

**Answered by:** human (2026-11-23, "Descope purge apply")

**Context:** After the delta round, Codex still held that any folder-name rule
can classify a real `/tmp` workspace as test data, and Claude returned
UNAVAILABLE because no receipt showed a full CLI run leaving the shared metrics
store and host scratch counts unchanged.

**Decision:** `metrics purge-test-data` previews candidates by fixture shape
(exact suite prefixes and `mkdtemp`/`tempfile` suffixes, folder gone), but
`--apply` removes only the workflows the human names from the preview
(`--workflow`, `--workflows-file`). AC2's purge is met as "previews by default,
removes the confirmed fixture rows, leaves every other row unchanged".
Tombstones are shown in cleanup and doctor output. Verification adds
`node cli/scripts/isolation-evidence.js` (full CLI suite with before/after
shared-store workflows and host scratch run/report counts). One final paired
round (round 4); then adjudicate.

**Rationale:** Automatic deletion by name pattern kept failing review; human
confirmation removes the risk class instead of narrowing it.

## [8] PR C1: readings of AC6 and AC9

[ ] **Promote**

**Answered by:** agent (implementation sub-agent, 2026-11-24)

**Confidence:** MEDIUM

**Context:** AC6 and AC9 leave several mechanics open; PR B1's severity field
lands in parallel.

**Decision:**
- (a) Scopes are `slice`, `feature-final` and `planning:<artifact>`. A round is
  one reviewed candidate *content* revision; reviewing the same revision again
  (for example after an UNAVAILABLE peer) is the same round. Observing a slice's
  integration closes the `slice` scope, so the next slice PR starts at round 1.
  In a light run, which has no `amend`, a human re-authorization of a changed
  brief is the amendment that resets the counters.
- (b) A "regression of the previous fix" is a finding new in the round on a path
  (planning: a document) the previous round's revision changed. No reviewer
  field is added.
- (c) Rounds 4-5 demote findings mechanically; a reviewer FAIL explained only by
  demoted findings counts as PASS for the pair, the original outcome is kept.
  Until B1 lands, findings read `unrated` and block as before.
- (d) Round 6: new decision kind `review-rounds` (`continue` or `split`, human
  only); after it, later rounds keep the round 4-5 band. A new revision is not
  reviewed past round 6 without it. `amend` resets; `waive` uses the existing
  waiver. Adjudication at round 6 or later is refused in every autonomous mode.
- (e) Acceptance (human decision D35, 2026-11-24, option A): a candidate
  repository whose tree has hosted CI workflows (`.github/workflows/`) is
  accepted only on a passing `ci` Verification for the exact candidate head;
  local evidence alone never suffices there (AC9, R9). A repository with no
  hosted CI keeps the independently assessed local `alternative`, as before,
  because it has no CI to run. A latest local Verification the converged
  reviews did not assess is refused either way. A `ci` Verification recorded
  after convergence is qualified by the runner-role check, derived at each
  milestone and at reuse (no model call, no separate event). A local receipt is
  matched to a CI check through an optional `ciCheck` on the check (else its
  `purpose`).
- (f) A `ci` Verification may carry no local checks; a review consuming only
  such a Verification has no receipt on the candidate tree and is not
  qualifying.

**Rationale:** Each reading fails safe or keeps existing proof; requiring CI for
every acceptance would break every repository without hosted CI. Reversible by
amendment.

## [9] PR B1: scope of the reviewer-contract speed-ups

**Answered by:** agent (under the mandate and D34)

**Context:** D34 scopes PR B1 to the P4 verdict work plus the P3 severity field.
D8 also requires a failure scenario and a class statement for every finding.

**Decision:**
- B1 includes all AC3 finding fields (`severity`, `failureScenario`,
  `classId`, `classStatement`) for code, spec, review and planning gates, since
  D8 makes them one contract.
- The paired higher-severity rating is recorded on the boundary review
  (`severities`); C1's round schedule consumes it.
- Format repair keeps the full mandate assessment (AC5's first bullet names it);
  other dependent text may change.
- Dispositions naming disclosed IDs are kept (they were never rejected); only
  `historyAssessment.affected` extras and repeats are normalized, which is where
  rc.31 rejected substantively valid verdicts.
- Deferred to B2: per-rule rejection and normalization counts in the metrics
  store (the store has a fixed outcome/reason vocabulary that B2's per-finding
  metrics extend), `validate-verdict`, misplaced-field normalization,
  `not-assessed`, sweep records and retention.

**Rationale:** Ship the changes that stop bookkeeping rejections first and keep
the store schema change in one PR.

## [10] Exit-time SIGABRT in isolated test processes: timebox closed, follow-up

**Answered by:** agent (D34 item 5: timeboxed, never blocks a PR)

**Context:** In CI (PR A, current-core shard) and earlier local runs, a
`node --test` file process inside an isolated shard passed every assigned test
and then died with SIGABRT, printing nothing.

**Decision:** Not reproduced on aws-1 within the timebox, with core dumps
enabled (apport writes to `/var/lib/apport/coredump`; gdb extracted from the
Ubuntu package): one full CLI suite on 8 cores (566 tests, 11.5 min, load ~22)
plus repeated isolated runs of current-core, current-light, current-tripwires,
current-delivery-targets and current-boundary-review, including runs pinned to
2 CPUs to match hosted runners. Recorded as a follow-up; a hosted CI rerun of a
job that fails only this way is acceptable evidence handling.

**Next step for the follow-up:** run CI with `ulimit -c unlimited` and upload
any core as an artifact, or run the shard under `catchsegv`-style gdb batch
(`gdb -batch -ex bt`) on a 2-CPU runner.
