# Design - tb-convergence-and-retirement

**Source:** `interview.md`, decisions D1–D31 (D1–D19 from the Mac interview,
D20–D27 added on Linux, 2026-11-22).
**Rigor:** full, supervised.

## Problem

GateReeve review loops often fail to converge.

Measured across recent runs:
- 15.7 h of review and verification job time, 5.3 h of it in review jobs that
  returned FAIL;
- two runs ended by waiving after long FAIL streaks;
- spec planning reviews failed 10 of 13 times.

Finding-level analysis of three runs found four causes:
1. **Every finding blocks.** All 117 findings were `blocking: true`, none had
   a severity, and nothing separates a data-loss bug from a rare edge case.
2. **Open-ended criteria.** Unbounded criteria ("conflicts are preserved, and
   replay converges") drew 34 of 67 findings in one run, each a rarer case
   than the last.
3. **Instance-level fixes.** Patching one site created the next mismatch
   (caps 50 → 200 → 1,000), and some fixes caused regressions.
4. **A broken second reviewer.** The paired Claude reviewer produced 0
   findings and 23 UNAVAILABLE results across 30 candidates, mostly from
   contract errors GateReeve could have repaired.

Three supporting problems:
- **The metrics store couldn't measure any of this.**
  - Test suites filled it (2,817 of 2,834 workflows), evicting real data.
  - `capture` and `status` are broken.
  - Human wait time reads as zero.
  - It holds no finding-level data, so the analysis needed the per-worktree
    databases.
- **Hosted CI runs between review rounds.** Every intermediate push runs the
  full CI matrix, or a narrowed docs scope that reviewers reject as evidence.
  Replacing a local Verification with the final CI Verification changes the
  reviews' consumed proof, which forces a full paired re-review at the end.
  Separately, Fleet's coming 30-minute idle stop would interrupt a quiet
  reviewer process, because reviewers run inside one long tool call that
  emits no T3 events.
- **Finished worktrees accumulate.** Removing 116 of them freed 31.1 GiB and
  about 2.65M inodes. Nothing cleans them up, and doing it by hand already
  destroyed two runs' review history once.

## Intent

- Review loops converge in a bounded number of rounds without silently
  dropping real defects. Anything not fixed is recorded and decided, never
  discarded.
- The second reviewer works, or its failures are visible with a reason.
- The shared metrics store is trustworthy, and rich enough to repeat the
  convergence analysis without any worktree.
- Hosted CI runs once per review scope, after the paired reviews converge,
  and qualifies acceptance without another paired review.
- Reviews are not killed by idle-stop automation while they run.
- Finished worktrees can be removed safely with one outside command that
  shows you anything that might matter before deleting.

Success (D6), measured over the next several real runs:
1. The median number of review rounds to PASS is 3 or fewer, and no run ends
   with a waive after a FAIL streak.
2. Every demoted finding is recorded as a follow-up with its severity and
   failure scenario, and decided at Completion.
3. Escaped defects traced to demoted follow-ups are counted, using the
   existing escaped-defect rule, with the human naming origins.
4. The second reviewer's UNAVAILABLE rate is below 10%, and it produces
   findings of its own.

## Chosen shape

Six slices (D24), each a PR into the `tb-convergence-and-retirement`
integration branch.

### Slice 1 - Reviewer idle-inhibitor lock (D21)

- On Linux, when `systemd-inhibit` is on PATH, every reviewer launch (the
  shared `runAgentProcess` path in `local-agent-adapters.js`) runs as
  `systemd-inhibit --what=idle --mode=block --who=GateReeve --why="<provider> <role> review: <feature id>" <executable> <args…>`.
  Elsewhere the launch is unchanged.
- stdin/stdout piping, exit codes, the timeout and its kill (which must reach
  the reviewer process, not only the wrapper) and the argument-size guard
  behave exactly as before.
- `--why` is short and carries no secrets: it is visible to every local user.
- The lock is held by the process's descriptor and released on exit or crash.
  Fleet treats it as "kept awake"; the two changes ship independently.

### Slice 2 - Metrics repair (D3)

- Test suites never write to the shared store, and existing test-suite data
  is purged.
- Fix the `capture` "Conflicting values for the same observation time" bug
  and `status` reporting 0 records.
- Record `DECISION_PENDING` when the question is asked, not when it is
  answered.
- Scratch area (D28): test suites never use the host scratch area
  (`/tmp/gatereeve`); diagnostic reports get an age and count limit applied
  by `gatereeve cleanup --apply`; cleanup and `doctor` report file counts;
  runs left behind past an age limit are labeled `stranded` for removal.

### Slices 3 and 4 - Review convergence

Slice 3 carries the reviewer contract (severity, failure scenario, class
statement, sweep record, contract robustness, and the per-finding metrics
fields), plus reviewer input and activity retention (D29, D30): instructions,
input and output schema, the Codex event stream, a Claude `stream-json` event
stream, and the raw output of contract failures, stored whole as
content-addressed objects referenced from the receipt, so the exact prompt of
any review round can be reconstructed and re-run. Slice 4 carries the round policy, follow-ups, the failure-model rule,
light-run rules and goal-mode wiring.

**Severity and failure scenarios (D8).**
- Every finding carries a severity and a failure scenario
  (`trigger → observable wrong outcome`). The contract rejects a finding
  without one.
- **High:** a realistic scenario causes data loss, a security problem, wrong
  results reported as success, or a broken acceptance criterion.
- **Medium:** a realistic scenario causes a visible, recoverable or reported
  failure, or an edge case within the failure model.
- **Low:** needs an unusual combination of conditions, or lies outside the
  failure model. Low findings never block.
- The reviewer assigns severity. The implementer may dispute it in a
  disposition but never change it. When paired reviewers rate a class
  differently, the higher rating counts.

**Round policy (D7).**
- A round is one paired review of one candidate revision. A round where one
  reviewer was UNAVAILABLE still counts.
- The counter belongs to the review scope: a slice PR, a feature-final
  review, or a planning document. Only a human-approved amendment resets it.
- The schedule:
  - Rounds 1–3: in-scope findings with a failure scenario block.
  - Rounds 4–5: only high-severity findings, or regressions introduced by the
    previous fix, block. The rest become follow-ups.
  - Round 6: hand back to the human with the evidence. The human chooses to
    continue, amend, waive or split. This applies in every autonomy mode; in
    goal mode the hand-back is `goal.park` with the PR and the round evidence
    (D23), never adjudication past round 6.
- Planning reviews follow the same policy.
- This replaces the protocol's current "no fixed ratios or round cap"
  statement.

**Follow-ups (D9, D10).**
- Non-blocking and demoted findings are recorded in the workflow database:
  the original finding, its round and reviewer, and why it didn't block.
  `follow-ups.md` is generated from that record.
- Completion requires a decision on each follow-up: accept the risk, turn it
  into new work, or reject it. Decisions can be made in bulk.
- Default decisions, recorded under a new `policy-default` authority kind and
  listed by `status`:
  - Low: accept the risk.
  - Medium: turn it into new work (a GitHub issue, or a seed for the next
    feature).
  - High: never decided by default. An open high follow-up keeps the run
    incomplete and blocks the release merge.

  "Accept the defaults" is a single supervised answer. Goal runs apply the
  defaults at Completion; an open high follow-up parks the goal run with
  `goal.park` instead of reaching a ready PR (D22).

**Failure model for specs (D11).**
- The spec template requires a `Failure model` section: the handled
  conditions, and detect-and-refuse behaviour outside them.
- `spec.validate` checks two things and names the offending line on failure:
  - the section is present and not empty;
  - criteria don't use unbounded wording ("always", "any", "all cases",
    "never fails", "converges", "robust") without a bound or a reference to
    the failure model.
- Planning review judges testability, and whether the model has gaps.
- Code reviewers receive the failure model. Out-of-model findings are low, so
  they become follow-ups or amendment proposals.
- The rule applies only to specs validated under the new version; old specs
  get a warning.

**Class-level fixes (D12).**
- Reviewers add a one-line class statement to each finding.
- A "fixed" disposition must carry a sweep record, or the contract rejects it:
  - `class`;
  - `sites`, with path and line, plus the search used;
  - `fix`: the single source of truth, or why there isn't one;
  - `test`: a class-level test;
  - `dependents`: how dependents were checked.
- The next round verifies the record. A missed site of a class claimed as
  swept is a regression of the previous fix, so it blocks in rounds 4–5.
- `sites: 1`, with the search that proved it, is valid.

**Reviewer contract robustness (D13).**
- A contract error triggers one automatic format-repair turn with the same
  reviewer. It receives the exact validation errors, and the existing
  `validateFormatRepair` checks that nothing substantive changed. It fails
  only after that.
- An unambiguous misplaced known field is moved without a model call and
  recorded as `normalized`.
- A missing disposition for a peer's finding is recorded as `not-assessed`.
  The verdict isn't rejected, and the finding stays open.
- Each UNAVAILABLE result has a reason code: `contract`, `malformed-json`,
  `provider-error`, `timeout`, `missing-evidence` or `other`.
- Repair turns don't count as rounds, but their tokens and time are recorded.

**Light runs (D14).**
- All review policy applies in both rigors.
- The failure model is optional in a light brief, with no lint when it's
  absent.
- The Completion follow-up decision applies in light runs too.
- When a light run reaches round 4, `status` advises raising rigor.

**Convergence metrics (D6, D17).**
- New content in the shared store (slice 3 for finding and reviewer fields,
  slice 4 for rounds and follow-ups):
  - per finding: severity, class ID and class statement, criterion, blocking
    status, round, reviewer provider and model, and follow-up status and
    disposition;
  - per reviewer result: the UNAVAILABLE reason;
  - per scope: round numbers.
- The four D6 success measures are reportable from the store alone.

### Slice 5 - CI after review convergence (D25–D27)

- During review rounds, paired reviews consume local `alternative`
  Verification built from runner receipts on locally committed candidates.
  Nothing is pushed between rounds.
- After the reviews converge, the branch is pushed once and the hosted CI run
  on that exact head is recorded as a `ci` Verification.
- A runner-role check, with no model call, qualifies that CI Verification
  against the converged reviews: the same tree, the required checks passing,
  and coverage of the local receipts the reviews consumed. Adding it does not
  invalidate the converged reviews (no `consumed-proof-changed` re-review).
  Acceptance still requires CI evidence on the exact candidate head in a
  repository with hosted CI; a repository without hosted CI keeps the assessed
  local alternative (D35).
- If hosted CI fails, the fix is made locally, a paired delta review covers
  only the fix (it counts as a round), and hosted CI runs once more (D26).
- The PreToolUse guard warns, but does not deny, on `git push` to a PR branch
  while the review scope has not converged (D27).
- Open for the spec: which local evidence is enough during rounds, and
  whether `candidate.prepare` and review need any change to work on a head
  that has never been pushed.

### Slice 6 - Worktree sweep (D15, D17, D18)

`gatereeve worktree sweep` is a standalone CLI command with no workflow
coupling. It previews by default.

- **Discovery:** `git worktree list` over the given repositories, or every
  repository under a configured root (default `~/Code`).
- **Candidates:** a worktree is a candidate when its branch is merged into
  the remote default branch, its PR is merged or closed, or its GateReeve run
  is COMPLETE. Worktrees with no activity for 30 days are shown separately as
  stale.
- **Always skipped, with reasons:**
  - the main checkout;
  - the worktree containing the sweep's own working directory;
  - open PRs;
  - `development` and `development-*` branches with unpushed commits.
- **Listed for confirmation:**
  - untracked files git doesn't ignore;
  - modified tracked files;
  - ignored files outside the known regenerable set (for example `.env`);
  - commits not on a remote;
  - a branch with no remote.

  Regenerable folders aren't listed. `.gatereeve-current/` is listed unless a
  harvest marker shows the telemetry harvester copied it after its last change
  (D31).
- **Removal:** one confirmation per worktree, then delete everything. There
  is no Trash and no archive. Afterwards: `git worktree prune`, and the local
  branch is deleted only if fully merged. Remote branches are never touched.
- **Non-interactive mode** removes only worktrees with an empty list.

### Delivery (D24)

- The integration branch is `tb-convergence-and-retirement`, from
  `featureBaseSha` `b844f0c` (`main` after PR #127).
- Slice PRs come from `-01-reviewer-idle-lock`, `-02-metrics-repair`,
  `-03-reviewer-contract`, `-04-round-policy`, `-05-ci-after-review` and
  `-06-worktree-sweep`.
- Each slice iterates its reviews locally and pushes once, so hosted CI runs
  once per slice and once for the final PR.
- The final PR goes to `main` under a per-PR human merge authorization.
- Publishing rc.32 is a separate step afterwards.

## Alternatives considered

- **No round cap; only better reviewer guidance.** Rejected. Every reviewer
  already had "do not stop at the first defect" guidance, and the loops still
  ran 10+ rounds.
- **The reviewer decides blocking freely, without severity.** This is today's
  behaviour, which produced 117 of 117 blocking findings.
- **Detecting large rewrites to reset the round counter.** Rejected as too
  complex for now (D7). Only an amendment resets it.
- **Dropping the unbounded-wording lint and keeping only the required
  section.** Considered (D11). The lint was kept, with false positives
  accepted.
- **An in-run retirement step (`workspace.retire`).** Dropped. A session
  can't remove the worktree it runs in, and an outside tool also covers the
  backlog and abandoned worktrees (D15).
- **A packed evidence archive before deletion** (D16). Dropped as complexity
  and storage without enough value, once the metrics store carries the
  analytic content (D17).
- **Moving removed files to the macOS Trash.** Dropped. It frees nothing
  until the Trash is emptied, and confirmation already protects valuable
  files (D17).
- **pnpm's global virtual store against inode exhaustion.** Rejected earlier
  as too experimental.
- **An evidence-only paired delta review to qualify final CI** (D25). Cheaper
  than a full round but still two model calls per scope; the mechanical
  runner-role check was chosen.
- **Guidance only for CI ordering** (D25). The final CI Verification would
  still force a full paired re-review.
- **Denying premature pushes** (D27). A warning was chosen so the agent can
  still push when it has a reason to.

## Constraints

- Development branches are one-way integration sinks: the sweep never merges
  or rebases them, and it skips them while they have unpushed commits.
- Merges into `main` need a per-PR human `authorize-merge`, and merges go
  through the protected merge path only.
- Integrity, truth and authority cannot be waived. `policy-default` decisions
  are never reported as human-confirmed.
- Existing runs and specs from earlier contracts keep working. New rules
  apply to new validations, and old specs only warn.
- Metrics capture failure never blocks the underlying work.
- The sweep never deletes the main checkout, an open-PR worktree, its own
  working directory, or remote branches.

## Open risks

- **Severity inflation or deflation.** Reviewers may mislabel severity. The
  definitions are scenario-based, and the higher rating wins between peers,
  but that is not proof of correct labelling.
- **Real defects demoted in rounds 4–5.** The escaped-defect guard (D6 item
  3) depends on the human naming origins, so it may undercount.
- **The evidence base is small.** It is three runs analysed in depth, two in
  the same domain. The round numbers are an informed guess to revisit after
  real runs.
- **The unbounded-wording lint** will produce false positives and can be
  satisfied superficially.
- **Sweep deletion is irreversible.** Files are protected only by the list
  and the confirmation. The regenerable-folder set must be right, and needs
  per-repository extension.
- **Loss of full review audit trails** after a sweep is an accepted trade-off
  (D17).
- **Mechanical CI qualification trusts tree identity.** The runner-role check
  proves the CI ran on the reviewed tree with the required checks passing; a
  CI-only failure mode the local receipts never exercised is caught only by
  CI itself (D26 then applies).
- **The idle lock is unverified inside T3's own cgroup and on upcloud-1**;
  the Fleet thread is checking both. Where `systemd-inhibit` is missing or
  refuses, the reviewer must still launch unwrapped.
- **Opus 5.5 may change the reviewer failure profile.** The D13 fixes should
  help regardless, but the UNAVAILABLE target may be met or missed for
  reasons other than this work.

## Amendment D36 (2026-11-24)

Sweep records (AC4), follow-ups and the Completion decision (AC7), the failure
model in specs (AC8), the remaining reviewer-contract items (part of AC5), the
finding-level metrics and surfaces (part of AC11) and reviewer input retention
(part of AC12) move to a follow-up feature (`follow-up-feature.md`). This
feature ships the reviewer idle lock, metrics repair and scratch fixes,
workflow robustness, the worktree sweep, the severity contract with
substance/bookkeeping separation, the round policy and CI after convergence.
