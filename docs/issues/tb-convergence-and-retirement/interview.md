# Interview - tb-convergence-and-retirement

**Feature start:** 2026-11-21
**Status:** reopened 2026-11-22 on Linux for additive scope (D20 onward); D1–D19 carried from the Mac interview

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

## Evidence base (2026-11-21 session)

Measured before the run started, from the shared metrics store
(`~/.local/share/gatereeve/performance/metrics.sqlite`) and the retained
`.gatereeve-current/` review results of three runs.

- **Metrics store quality.**
  - 2,817 of 2,834 workflows (43,110 of 45,485 observations) came from
    test-suite temp directories (`gatereeve-current-surface-*`).
  - That pollution filled the 100 MiB cap and evicted real data: the store was
    created Nov 5, but its oldest row is Nov 9.
  - `metrics capture` fails with "Conflicting values for the same observation
    time".
  - `metrics status` reports 0 records.
  - `DECISION_PENDING` is recorded at decision time, so human wait reads as about 0.
- **Review loop cost.**
  - 15.7 h of measured review and verification job time across about 11 runs;
    5.3 h of it was review jobs that returned FAIL.
  - Two runs (idle-shutdown, dashboard) ended by waiving after long FAIL streaks.
- **Causes, from finding-level analysis of unified-host-access, codex-sandbox
  and bubblewrap.**
  - All 117 findings were `blocking: true` with no severity. The reviewer
    instructions exempt only advice, speculation and unrelated pre-existing
    issues.
  - Open-ended criteria: codex-sandbox R3 ("conflicts are preserved, and replay
    converges") drew 34 of 67 findings, each a new, rarer case.
  - Instance-level fixes: unified-host-access work-list caps went 50 → 200 →
    1,000, each creating the next mismatch. Some genuine fix-induced
    regressions also occurred (lapsed-writer).
  - Paired-review failure: Claude (`sonnet`) produced 0 findings, 7 PASS
    results and 23 UNAVAILABLE results. The causes were contract rejections
    (`review.mandateAssessment is not allowed`, missing dispositions for the
    peer's findings), malformed JSON and provider failures. Codex failed all 23
    candidates.
  - Not a cause: reviewer memory. History was carried, and repeats were
    legitimate re-checks of changed code.
- **Disk and inode accumulation.**
  - Removing 116 finished worktrees freed 31.1 GiB and about 2.65M inodes on
    this Mac.
  - Removing a worktree deletes its untracked `.gatereeve-current/` workflow
    database. The idle-shutdown and dashboard review history was lost this way.

## Decisions

### D1 (meta) - Run rigor
- **Question:** Full or light rigor for this run?
- **Answer:** "Full (Recommended)".
- **Decision:** Full rigor, supervised autonomy (defaults).

### D2 (meta) - Feature shape
- **Question:** What should replace the stale `tb-workflow-modules` workspace
  configuration?
- **Answer:** "One feature, two slices (Recommended)".
- **Decision:** A single feature `tb-convergence-and-retirement`, delivered as
  two slices (review convergence, then worktree retirement), shipping in one
  GateReeve version.

### D3 - Metrics fixes in scope
- **Question:** Include today's metrics fixes in this version?
- **Answer:** "Include them (Recommended)".
- **Decision:** In scope:
  - test-suite isolation from the shared store, and a purge of the existing
    test-suite data;
  - the `capture` conflict bug;
  - `status` counting 0 records;
  - recording `DECISION_PENDING` when the question is asked.

### D4 - Direction endorsed before the run
- **Question:** (Pre-run discussion) The four convergence causes and four
  proposed changes.
- **Answer:** "I really like your analysis above and your suggestions. Let's
  really try to put all of this into place in a newer version of GateReeve."
  Earlier the human also said:
  - keep findings in scope;
  - include "realistically triggerable" as guidance even if it can't be
    enforced;
  - "I like your cap on rounds";
  - asked how the model would express better criteria;
  - "I really like this guidance a lot", about class-level fixes;
  - the Claude contract failure "may have to fix within GateReeve", with the
    switch to Opus 5.5 expected to help.
- **Decision:** In scope, with specifics to be settled in this interview:
  - finding severity and a required failure scenario;
  - a round policy, where the numbers are not yet ratified (agent proposed 3
    normal rounds, tightening at rounds 4–5, escalation at 6);
  - a failure-model / detect-and-refuse spec rule;
  - class-level fixes with a recorded sweep;
  - a GateReeve-side fix for the Claude reviewer contract, plus tracking of
    UNAVAILABLE reasons.

### D5 - Worktree retirement intent
- **Question:** (Human request) Clean up worktrees after a complete workflow.
- **Answer:**
  - Recurring disk and inode exhaustion makes this important.
  - Do not lose metrics data.
  - Files outside source control may have value; detect them and bring them to
    the user's attention.
  - Consider moving the worktree to the macOS Trash.
- **Decision:** In scope as slice 2, with the mechanism to be settled in this
  interview.

### D6 - Success measure
- **Question:** How will we know this version worked, rather than just making
  the numbers look better? Fewer rounds proves nothing on its own, because a cap
  and severity-gated blocking reduce rounds by definition.
- **Answer:** "I think your suggestions make sense. Let's use them."
- **Decision:** Success is judged over the next several real runs against
  four tests:
  1. **Convergence:** median review rounds to PASS is 3 or fewer, and no run
     ends with a waive after a FAIL streak.
  2. **Nothing silently dropped:** every finding demoted to a follow-up is
     recorded with its severity and failure scenario, and the human reviews
     the follow-ups when the run completes.
  3. **Quality guard:** escaped defects later traced to a demoted follow-up
     are counted. This depends on the human naming origins, under the existing
     escaped-defect rule.
  4. **Second opinion restored:** the second reviewer's UNAVAILABLE rate falls
     below 10%, and that reviewer produces findings of its own.
- **Implication:** The metrics must be able to report these four numbers.
  That means recording each review round's number, each finding's severity
  and blocking status, follow-up records, and UNAVAILABLE reasons.

### D7 - Round definition, reset and schedule
- **Question:** What counts as a round, when does the counter reset, and what
  happens at each round?
- **Answer:** On the reset rule: "let's do something simple for now." The
  human did not object to the rest of the proposal.
- **Decision:**
  1. A round is one paired review of one candidate revision. A revision where
     one reviewer was UNAVAILABLE still counts.
  2. The counter belongs to the review scope: one slice PR, one feature-final
     review, or one planning document (design, spec or plan). New commits on
     the same scope don't reset it.
  3. Only a human-approved amendment resets the counter. There is no detection
     of large rewrites (simple for now).
  4. Planning reviews follow the same policy.
  5. The schedule:
     - Rounds 1–3: any in-scope finding with a failure scenario blocks.
     - Rounds 4–5: only high-severity findings, or regressions introduced by
       the previous fix, block. Everything else becomes a recorded follow-up.
     - Round 6: hand back to the human with the evidence. The human chooses to
       continue, amend, waive or split.
- **Assumption (agent default, keeping it simple):** The round 6 hand-back
  applies in every autonomy mode. In autonomous mode it reaches the existing
  mandate adjudication, not an automatic continuation. Revisit if this is
  wrong.

### D8 - Severity scale and assignment
- **Question:** What is the severity scale, and who assigns severity?
- **Answer:** "Approved".
- **Decision:**
  1. Three levels, defined by the finding's failure scenario:
     - **High:** a realistic scenario causes data loss, a security problem,
       wrong results reported as success, or breaks a stated acceptance
       criterion.
     - **Medium:** a realistic scenario causes a visible failure that is
       recoverable or reported, or an edge case within the stated failure
       model.
     - **Low:** needs an unusual combination of conditions, or lies outside
       the stated failure model. Low findings never block; they become
       follow-ups.
  2. The reviewer assigns severity. The contract rejects any finding without
     a failure scenario (`trigger → observable wrong outcome`).
  3. The implementer may dispute a severity in their disposition but cannot
     change it. The next round's reviewers settle the dispute, or the human
     does at round 6.
  4. When paired reviewers rate the same class differently, the higher rating
     counts.

### D9 - Follow-up records and the Completion decision
- **Question:** Where do follow-ups live, and what happens to them?
- **Answer:** Agreed, including the Completion decision on every follow-up.
  The human added: "we will have a new 'goal' mode that forbids asking the
  user for input. Some sort of default decision will have to be made."
- **Decision:**
  1. Follow-ups are recorded in the workflow database. Each one keeps:
     - the original finding (ID, class, criterion, path, severity, failure
       scenario);
     - the round and the reviewer that raised it;
     - why it didn't block: low severity, demoted in rounds 4–5, or outside
       the failure model.
  2. A readable `follow-ups.md` is generated, never hand-edited, in the
     feature's docs folder.
  3. Completion requires a decision on every follow-up: accept the risk, turn
     it into new work, or reject it as not a real problem. Decisions can be
     made in bulk.
  4. Severity and follow-up status go to the shared metrics store, so the
     escaped-defect check can match a later fix against a demoted follow-up.
- **Scope note:** Goal mode does not exist in the repo yet; the only match is
  unrelated test wording in `cli/test/current-light.test.js:202`. It is
  separate, upcoming work. This feature only supplies the default decisions
  (D10).

### D10 - Default follow-up decisions
- **Question:** What is the default decision for each follow-up when the user
  can't be asked?
- **Answer:** "Approved".
- **Decision:**
  1. **Low:** accept the risk.
  2. **Medium:** turn it into new work. It becomes a GitHub issue, or a seed
     for the next feature when there is no issue tracker.
  3. **High:** never decided by default. It can only exist if round 6 ended
     without a fix. In goal mode the run is marked incomplete with open high
     risk, and it cannot merge to the release branch.
  4. Defaults are recorded under a new `policy-default` authority kind, never
     as human-confirmed. `status` lists them so the human can overturn any.
  5. In supervised runs, "accept the defaults" is a single answer available
     at Completion.
- **Accepted risk:** In goal mode, automatically filing GitHub issues for
  medium follow-ups is an outward-facing action. The human approved it.

### D11 - Failure-model rule for specs
- **Question:** How is the failure-model rule enforced on specs?
- **Answer:** "Approved".
- **Decision:**
  1. The spec template gains a required `Failure model` section. It names the
     conditions the feature must handle, and the detect-and-refuse behaviour
     outside them: a clear error, never a silent best effort.
  2. `spec.validate` lints two things and names the offending line on
     failure:
     - the section exists and isn't empty;
     - criteria don't use unbounded wording ("always", "any", "all cases",
       "never fails", "converges", "robust") unless a bound or a
       failure-model reference is attached.
  3. Planning review judges testability within the failure model, and
     whether the model has an obvious gap. Its findings follow D7 and D8.
  4. Code reviewers receive the failure model. A finding outside it is low
     (D8), so it becomes a follow-up or a proposed amendment, never a
     blocker.
  5. The rule applies to specs validated under the new version. A resumed run
     on an old spec gets a warning, not a failure.
- **Accepted risk:** The word-list lint will produce false positives, and it
  can be satisfied superficially.

### D12 - Class-level fixes with a recorded sweep
- **Question:** How do we make class-level fixes actually happen?
- **Answer:** "Approved".
- **Decision:**
  1. Reviewers add a one-line class statement alongside each finding's
     `classId`.
  2. The contract rejects a "fixed" disposition without a sweep record.
     The record has these fields:
     - `class`: the class the fix addresses;
     - `sites`: every site found (path and line), plus the search used to
       find them;
     - `fix`: where the single source of truth now lives, or why there isn't
       one;
     - `test`: the class-level test that would fail at any of the sites;
     - `dependents`: what depends on the changed code, and how it was
       checked.
  3. The schema enforces presence, and the next round's reviewers verify
     truth. A missed site of a class claimed as swept is a regression of the
     previous fix, so it blocks in rounds 4–5.
  4. `sites: 1`, together with the search that proved it, is a legitimate
     answer.

### D13 - Reviewer contract failures
- **Question:** How should GateReeve handle a reviewer response that breaks
  the contract?
- **Context (from code):** Any contract error becomes UNAVAILABLE at
  `execution.js:727`, keeping the returned verdict as `unvalidatedVerdict`.
  A format-repair validator, `validateFormatRepair` (`execution.js:66`),
  already exists, but nothing triggers it automatically.
- **Answer:** "Approved".
- **Decision:**
  1. One automatic repair turn with the same reviewer model and session. It
     receives the exact validation errors and their schema location.
     `validateFormatRepair` checks that nothing substantive changed. If the
     repair also fails, the result is UNAVAILABLE.
  2. A known field in the wrong place, with exactly one correct place, is
     moved without a model call and recorded as `normalized`.
  3. A missing disposition for a peer's finding is recorded as
     `not-assessed`. The verdict is not rejected, and the finding stays open.
  4. Each UNAVAILABLE result gets a reason code, recorded in metrics:
     `contract`, `malformed-json`, `provider-error`, `timeout`,
     `missing-evidence` or `other`.
  5. Repair turns don't count as rounds (D7), but their tokens and time are
     recorded.

### D14 - Light runs
- **Question:** Does the convergence policy apply to light runs?
- **Answer:** "Approved".
- **Decision:**
  1. All review-related policy applies in both rigors: D7, D8, D9, D12 and
     D13. There is one shared reviewer contract.
  2. The failure model is optional in a light brief. When it's absent there
     is no lint, and no finding is classified low merely for being outside a
     model.
  3. The follow-up decision at Completion applies in light runs too, with the
     D10 defaults.
  4. When a light run's round counter reaches 4, `status` suggests raising
     rigor. This is advice only; nothing raises it automatically.

### D15 - No in-run retirement; archive at Completion plus an outside sweep tool
- **Question:** When does retirement run, and from where?
- **Context (from code):**
  - `gatereeve cleanup` handles scratch, installers and metrics, never
    worktrees (`cli/src/commands/cleanup.js`).
  - Completion requires verified local evidence retention (`PROTOCOL.md:257`).
  - The workflow database is in the untracked `.gatereeve-current/` inside
    the worktree.
- **Answer:** The human: "I hadn't considered the catch-22 here, that we can't
  clean up the work tree we're working in. This makes me question the value
  of attempting anything in this retirement step at all. People are better
  off having another tool that runs outside of the scope…" Then chose
  "Archive + sweep tool (Recommended)".
- **Decision:**
  1. There is no in-run retirement step and no `workspace.retire` operation.
     This supersedes the in-run shape implied by D5.
  2. **Archive at Completion (slice 1):** copy the feature's
     `.gatereeve-current/` to `~/.local/share/gatereeve/retained/<feature>/`
     and verify the copy, as part of Completion's evidence retention. This
     works from inside the worktree.
  3. **Outside sweep tool (slice 2):** `gatereeve worktree sweep`, a
     standalone CLI command with no workflow coupling. It previews by default
     and refuses to act on the worktree containing its own working
     directory. Its mechanism is settled below (D16 onward).

### D16 - Archive contents, packing and verification
- **Question:** What does the archive keep, and how is it verified?
- **Answer:** "Not fully understanding this, but I want to be sure that when
  the sweep is done, we're not leaving around large numbers of files
  somewhere."
- **Evidence (measured 2026-11-22):** existing `.gatereeve-current/` folders
  hold 6–493 files and 96 KB–12 MB each (codex-sandbox is the largest).
  Removed worktrees averaged about 23,000 files each.
- **Decision:**
  1. The archive keeps:
     - `.gatereeve-current/`: the workflow database plus `objects/`;
     - the feature docs folder (`docs/issues/<feature>/`), which may be
       untracked.

     Source code is never archived.
  2. **Packed:** each run's archive is one compressed file plus one manifest
     file, so it leaves 2 files per run however many objects the run had.
  3. The database is copied with SQLite's backup API and integrity-checked.
  4. Verification before anything is removed:
     - every object's content hash matches its address;
     - the copied database opens and reaches the same latest event;
     - the manifest records the hashes.

     Completion's retention proof points to the archive.
  5. The sweep archives any worktree that has `.gatereeve-current/` and no
     verified archive, before removing it. This includes worktrees from runs
     before this version.
  6. Layout: `~/.local/share/gatereeve/retained/<repo-name>/<feature>/<run-id>.*`.
  7. No size cap or eviction. `gatereeve cleanup` reports the archive's size
     but never deletes it.

### D17 - Drop archiving; sweep lists, confirms, deletes (supersedes D15 item 2 and D16)
- **Question:** (Raised by the human) "Let me ask whether this notion of
  archiving is truly useful or not. It adds complexity and storage. I'm
  inclined to have the sweep delete everything in the worktree, perhaps after
  warning about files outside of the Git repo."
- **Answer:** "Yes, as proposed (Recommended)".
- **Rationale:**
  - The shared metrics store lives outside every worktree, so a sweep never
    touches it.
  - The worktree database's unique value was finding-level detail, and D6,
    D9 and D13 already move the analytic part of that into the shared store.
- **Decision:**
  1. No archive, at Completion or in the sweep. D15 item 2 and all of D16
     are superseded.
  2. Condition: the shared metrics store records, per finding:
     - severity, class ID and class statement, criterion, blocking status,
       round, and reviewer provider and model;
     - follow-up status and disposition;
     - and, per reviewer result, the UNAVAILABLE reason.

     This must be enough to repeat the 2026-11-21 convergence analysis
     without any worktree.
  3. The sweep lists only what might matter, by name:
     - untracked files git doesn't ignore;
     - modified tracked files;
     - ignored files outside the known regenerable set (for example `.env`);
     - commits not on any remote branch;
     - a branch with no remote.

     `node_modules`, build and dependency folders, caches and
     `.gatereeve-current/` are not listed.
  4. One confirmation per worktree, then delete everything. There is no
     Trash.
- **Accepted loss:** after a sweep, the full evidence text and review audit
  trail of a finished run are gone. Committed docs survive in git.

### D18 - Sweep candidates and scope
- **Question:** Which worktrees does the sweep consider, and where does it
  look?
- **Answer:** "Approved".
- **Decision:**
  1. Discovery uses `git worktree list` for the given repositories, or for
     every repository under a configured root (default `~/Code`). It is not a
     folder scan.
  2. A worktree is a candidate when any of these holds:
     - its branch is merged into the remote default branch;
     - its PR is merged or closed;
     - its GateReeve run is COMPLETE;
     - it has had no commits or file changes for 30 days. These are shown
       separately as "stale".
  3. Always skipped, with reasons shown in the preview:
     - the main checkout;
     - the worktree containing the sweep's own working directory;
     - open PRs;
     - development branches (`development`, `development-*`) with commits
       not on the remote.
  4. Afterwards: `git worktree prune`, and the local branch is deleted only
     when fully merged. Remote branches are never touched.
  5. Non-interactive use removes only worktrees whose D17 list is empty.

### D19 - Slicing, branches and release
- **Question:** How should the work be sliced and branched?
- **Answer:** "Approved".
- **Decision:**
  1. Slice 1, review convergence and metrics: D3, D6–D14, and the D17 metrics
     fields. Slice 2, worktree sweep: D17 and D18.
  2. Integration branch: `tb-convergence-and-retirement`, with
     `featureBaseSha` set to `400e4a29e0e19afd1f1d0b53709d4a6d74d03127`
     (`origin/main`, rc.31).
     - Slice branches: `tb-convergence-and-retirement-01-review-convergence`
       and `tb-convergence-and-retirement-02-worktree-sweep`.
     - The final PR to `main` needs a per-PR human `authorize-merge`.
  3. The feature ID is unchanged.
  4. Publishing rc.32 is a separate step after the final merge, under its own
     authorization. It is not part of this run.

## Closing summary

The interview is complete. Decisions D1 through D19 are ratified.

- **Superseded:** D15 item 2 and all of D16, by D17.
- **Agent assumption the human can revisit:** D7, where round 6 hands back in
  every autonomy mode.
- **Out of scope:**
  - goal mode itself (D9);
  - publishing rc.32 (D19);
  - an in-run retirement step (D15);
  - archiving (D17).

## Continuation on Linux (2026-11-22)

The Mac interview's records (D1–D19) arrived by handoff from the Mac thread
after PR #127 (goal autonomy) merged to `main` at `b844f0c`. The run was
restarted on Linux as `tb-convergence-and-retirement-start-linux-1` from that
commit; the Mac run's database did not travel. The human said the handoff
documents "are additive to what we already know we need to do", which adds
CI after review convergence (`.handoffs/HANDOFF-gatereeve-ci-last-2026-11-22T0039.md`)
and the Fleet thread's reviewer idle-inhibitor request.

### D20 (meta) - Run rigor on Linux
- **Question:** Full or light rigor for the new run?
- **Answered by:** human
- **Answer:** "Full (Recommended)".
- **Decision:** Full rigor, supervised autonomy.

### D21 - Reviewer idle-inhibitor lock in scope
- **Question:** The Fleet thread asked GateReeve to launch each reviewer under
  a systemd idle-inhibitor lock, so Fleet's new 30-minute idle stop doesn't
  kill reviews mid-run. Include it in this run?
- **Answered by:** human
- **Answer:** "Include it (Recommended)".
- **Decision:** In scope. On Linux, when `systemd-inhibit` is on PATH, every
  reviewer launch is wrapped as
  `systemd-inhibit --what=idle --mode=block --who=GateReeve --why="<provider> <role> review: <feature id>"`;
  elsewhere launches are unchanged. Preserve stdin/stdout piping, timeout and
  kill reaching the real reviewer, exit codes and the argument-size guard.
  `--why` stays short and secret-free. Whether the receipt records the lock is
  a spec question.

### D22 - Goal mode applies the D10 defaults
- **Question:** Goal mode now exists on `main` (PR #127). Wire the D10 default
  follow-up decisions into it in this run?
- **Answered by:** human
- **Answer:** "Wire them in (Recommended)".
- **Decision:** Supersedes the D9 scope note and the "goal mode is assumed but
  not built" risk. Goal runs apply the D10 defaults at Completion. An open
  high-severity follow-up parks the goal run (`goal.park`) instead of reaching
  a ready PR.

### D23 - Round 6 in goal mode
- **Question:** At round 6 the loop hands back to the human in every autonomy
  mode (D7 assumption). A goal run can't ask: should round 6 park it?
- **Answered by:** human
- **Answer:** "Park in goal mode (Recommended)".
- **Decision:** Ratifies the D7 assumption. Round 6 is a hand-back in every
  autonomy mode; in goal mode the hand-back is `goal.park` with the PR and the
  round evidence, never adjudication past round 6.

### D24 - Slicing and delivery (amends D19)
- **Question:** Six slice PRs into a `tb-convergence-and-retirement`
  integration branch, then one final PR to `main`, or consolidate?
- **Answered by:** human
- **Answer:** "6 slices (Recommended)".
- **Decision:** Supersedes D19 items 1–2. Slices, in order:
  `-01-reviewer-idle-lock` (D21), `-02-metrics-repair` (D3),
  `-03-reviewer-contract` (D8, D12, D13, D17 per-finding fields),
  `-04-round-policy` (D7, D9–D11, D14, D22, D23), `-05-ci-after-review`
  (D25–D27), `-06-worktree-sweep` (D17, D18). Integration branch
  `tb-convergence-and-retirement` with `featureBaseSha`
  `b844f0c1e31e5fc31b6ec6d42d79ec26c0846b6f`; the final PR to `main` needs a
  per-PR human `authorize-merge`. Until slice 5 ships, every slice follows the
  standing practice: review rounds on local commits with local verification,
  one push and one hosted CI run at the end.

### D25 - CI qualifies converged reviews through a runner-role check
- **Question:** How should the final hosted CI qualify reviews that
  converged on local evidence?
- **Answered by:** human
- **Answer:** "Runner-role CI check (Recommended)".
- **Decision:** Paired reviews consume local Verification during rounds.
  Acceptance additionally requires a CI-kind Verification for the identical
  reviewed tree, checked mechanically by a runner-role check (no model call)
  against the reviewed tree and the local receipts it supersedes. Adding that
  CI Verification does not invalidate the converged reviews or require a
  paired re-review. No proof obligation is weakened: CI evidence on the exact
  candidate head is still required for acceptance.

### D26 - CI failure after convergence
- **Question:** If hosted CI fails after the reviews converged, what happens?
- **Answered by:** human
- **Answer:** "Fix + delta review (Recommended)".
- **Decision:** Fix locally, run a paired delta review of only the fix (it
  counts as a round under D7), then rerun hosted CI once.

### D27 - Premature-push guard
- **Question:** Should GateReeve guard against pushing a PR branch before the
  reviews converge?
- **Answered by:** human
- **Answer:** "Warn, don't deny (Recommended)".
- **Decision:** The PreToolUse guard warns, without denying, on `git push` to
  a PR branch while the current review scope has not converged. Integration
  and release branch denials are unchanged.

### D28 - Scratch-area inode growth (amends slice 2)
- **Question:** The host scratch area `/tmp/gatereeve` holds 30,752 never-pruned
  report files and 188 retained run folders, some reviewer source views with
  300k–600k files each, mostly from the test suite writing to the shared
  scratch root. Clean it up once now, amend slice 2 to stop the growth, both,
  or neither?
- **Answered by:** human
- **Answer:** "both".
- **Decision:**
  1. One-off: preview `gatereeve cleanup`, show the human what is eligible
     with file counts, and apply only with the human's OK.
  2. Slice 2 is amended: test suites never use the shared scratch area;
     reports get an age and count limit; `gatereeve cleanup` and `doctor`
     report file counts; stranded runs past an age limit are listed for
     removal.

### D29 - Reviewer input and activity retention (amends slice 3)
- **Question:** The telemetry thread's handoff (`handoff-reviewer-retention.md`)
  asks GateReeve to keep every reviewer's exact inputs and activity so review
  rounds can be analysed and re-run. Where does it go?
- **Answered by:** human
- **Answer:** "Into slice 3 (Recommended)", after asking to "accommodate the
  changes needed into our slices here".
- **Decision:** Slice 3 also retains, per reviewer run, as content-addressed
  objects in the feature's workflow state referenced from the receipt: the
  instructions, input and output schema (so the exact prompt is
  reconstructible byte for byte); the Codex `--json` event stream; a Claude
  event stream from `--output-format stream-json --verbose` (verified
  2026-11-22 with Claude Code 2.1.330 under `--restricted`: tool calls and a
  final `result` with `structured_output` are emitted); and the raw output
  with validation errors when a result fails the contract. Isolation flags
  (`--ephemeral`, `--no-session-persistence`) stay. Redaction is the
  harvester's job. Candidates already pin full per-repository commit IDs.

### D30 - No size caps on retained reviewer objects
- **Question:** Cap retained prompts and event streams per object?
- **Answered by:** human
- **Answer:** "No caps".
- **Decision:** Objects are stored whole. The existing bounds remain: prompts
  at 512 KiB and process output at 16 MiB.

### D31 - The sweep lists unharvested workflow state (amends D17)
- **Question:** The sweep deletes a worktree's workflow state, which would
  destroy retained reviewer inputs before the harvester copies them. How
  should it treat that?
- **Answered by:** human
- **Answer:** "List unharvested state (Recommended)".
- **Decision:** Amends D17 item 3. A worktree's `.gatereeve-current/` is listed
  as something that might matter unless a harvest marker shows it was copied
  after its last change; non-interactive mode therefore skips it.

### D32 - Fleet reviewer-contract bug report (amends slice 3)
- **Question:** The Fleet thread reported reviewer verdicts rejected for
  bookkeeping reasons (a historical blocking finding still present but now
  rated low had no valid disposition; format repair changed more than labels;
  findings shown only inside earlier UNAVAILABLE results were treated as
  undisclosed). Where does the fix go?
- **Answered by:** human
- **Answer:** "Fold into slice 3 (Recommended)".
- **Decision:** Slice 3 adds a disposition for a historical blocking finding
  that is still present but now rated low (it no longer blocks); counts every
  finding in the supplied history as disclosed, including findings inside
  earlier UNAVAILABLE results; and reproduces each case with fixtures (the
  Mac evidence folder is never copied).

### D33 - Make GateReeve runs converge fast (amends slices 2, 3 and the plan)
- **Question:** This run's slice 1 needed seven paired review rounds and
  about a day of wall time. The causes: the parallel core suite fails on
  this host because test shards contend for one scratch maintenance lock
  (a waiter gives up after 90 s even while the holder is alive), so local
  verification ran serially for about an hour; reviewers returned
  substantively valid PASS verdicts that the contract rejected for
  bookkeeping (`historyAssessment.affected` naming a non-blocking prior
  finding) and format repair then rejected a consistent rewording; a missing
  `decisions.md` surfaced only when both reviewers failed; acceptance
  required every check identity ever run to pass again in that exact form;
  and a verification job stopped by a time limit left a pending execution
  that invalidated older proof. What changes?
- **Answered by:** human
- **Answer:** "1) Approved. 2) Approved. 3) Approved. 4) Approved." to the
  four proposals below, plus "I also assume that as part of your slices, you
  will do the other things you mentioned above to fix our problems. For
  example, the issue of review verdicts mixing substance. And also the
  scratch lock fixes you describe above." (2026-11-23).
- **Decision:**
  1. **Scratch lock (slice 2).** Every test process and every isolated test
     shard uses its own scratch root, including suites invoked directly with
     `node --test` (not only through `npm test`). Creating a run takes no
     global lock: the run folder has a unique name and its owner record is
     written atomically. Cleanup holds the maintenance lock only to rename an
     eligible run to a tombstone name; deletion of the tombstone happens
     outside the lock. A process waiting on a lock whose holder is verified
     alive keeps waiting and never fails on elapsed time alone; an
     interrupted lock (holder gone) is still reported, never stolen by age.
  2. **Reviewer verdicts separate substance from bookkeeping (slice 3).**
     GateReeve computes the set of findings that need a disposition from the
     supplied history and gives it to each reviewer explicitly. The
     structured-output schema is built per request, with the allowed finding
     IDs as enums in every list that names findings. Extra IDs that are
     disclosed in the history are dropped from bookkeeping lists and recorded
     as `normalized`, never rejected; rejection is reserved for substantive
     contradictions (a PASS with a present blocking finding, a missing
     disposition for an open blocking finding, an unknown ID). Reviewers can
     run a read-only `validate-verdict` command inside their sandbox before
     answering. Format repair is judged by substance identity (outcome,
     findings, severity, evidence, criteria, coverage decisions,
     dispositions); text that depends on a repaired field may change.
     Contract rejections are counted per rule in the metrics store.
  3. **Workflow robustness (slice 2).** The feature's `decisions.md` is
     created with the other lifecycle documents, and `candidate.prepare`
     fails naming it if it is missing. A verification may declare that a
     check replaces an earlier check identity, with a reason; the replacement
     is accepted when the paired review that consumes that verification
     passes its coverage decision, without a dedicated extra round. A runner
     or independent-assessment job whose process is verifiably gone can be
     abandoned with a reason (`job.abandon`); an abandoned job no longer
     invalidates proof recorded before it. Delivery jobs still require
     reconciliation.
  4. **Plan (approved proposal 2).** The remaining slices ship as three PRs:
     PR A = slices 2 and 6 plus items 1 and 3; PR B = slice 3 plus item 2;
     PR C = slices 4 and 5.
  5. **Review rounds (approved proposal 3).** Until slice 4's round policy
     exists, each PR gets at most two paired review rounds; after that,
     remaining non-blocking findings become follow-ups and residual risk is
     recorded with `review.adjudicate` under the mandate. Blocking findings
     are still fixed.
  6. **Dogfooding (approved proposal 4).** Once PRs A and B are merged into
     the integration branch, this run's GateReeve operations use the adapter
     from the integration branch checkout instead of the installed plugin.

### D34 - Speed-ups first, lean verification, parallel slices

- **Question:** The run is taking days: about 5-6 hours of PR A went into
  repeated full local verification (every fix a new commit, every check
  identity rerun, a pre-existing exit-time SIGABRT under load), and rc.31 could
  neither waive coverage nor adjudicate UNAVAILABLE. How do we go faster?
- **Answered by:** human
- **Answer:** "Let's use your recommendation." (2026-11-24), to: (1) deliver
  the verdict speed-ups first as a small PR and dogfood them via the
  integration adapter; (2) verification = hosted CI plus a small fixed local
  list, no local full suites; (5) investigate the exit-time crash first;
  (4) build PR C's essentials in parallel; (6) cut further scope as needed.
- **Decision:** The plan's "Speed-ups first (D34)" section: PR B1 (B-lite),
  PR C1 in parallel, then B2/C2 or a follow-up feature. Each PR's local list
  is fixed on its first run and limited to focused suites; hosted CI carries
  the full suite. Self-review before paired rounds, one fix commit per round,
  delta rounds after the first. PR A was merged outside GateReeve by human
  decision (run note `prA-outside-merge-note`).

### D35 - AC9 acceptance in repositories without hosted CI

- **Question:** AC9 says acceptance of a candidate requires a passing `ci`
  Verification on the exact candidate head and that local-only evidence never
  satisfies acceptance by itself. Read literally, a repository without hosted
  CI could never be accepted except by waiver. PR C1 reads AC9 as applying to
  repositories with hosted CI (workflows under `.github/workflows/` in the
  candidate tree), keeping the independently assessed local `alternative` for
  repositories without hosted CI. Keep that reading (A), or apply AC9 literally
  with a waiver for CI-less repositories (B)?
- **Answered by:** human
- **Answer:** "I choose your recommended option A above." (2026-11-24)
- **Decision:** A candidate repository with hosted CI is accepted only on a
  passing `ci` Verification for the exact candidate head; local evidence alone
  never suffices there. A repository without hosted CI keeps the independently
  assessed local alternative. These rules apply to reviews run under the round
  policy; earlier-contract pairs keep their qualification (AC11).
- **Amendment:** "Amend AC9/R9 and the design per D35, authorize implementation
  of the amended spec, and restore full autonomy for this run under the same
  mandate" (human, 2026-11-24, after both C1 round-2 reviewers asked for the
  decision in the pinned requirements). spec.md AC9 and R9 and design.md (CI
  after convergence) now carry the D35 reading.

### D36 - Cut the remaining scope to a follow-up feature and ship

- **Question:** After PR C1 merged, AC4, AC7, AC8, part of AC5 and AC11, and
  the retention part of AC12 remained (about two more C1-sized PRs). Build them
  here (B2, C2), or cut them to a follow-up feature and ship what is delivered
  as a release?
- **Answered by:** human
- **Answer:** "Amend the spec to move AC4, the rest of AC5, AC7, AC8, the rest
  of AC11 and AC12 into the follow-up feature and authorize implementation of
  the amended spec; commit the docs directly to the integration branch; run
  one feature-final review round" (2026-11-24), after: "I like the idea of
  cutting and getting what we have deployed as a new version and published,
  and then following up with further feature work."
- **Decision:** spec.md, design.md, plan.md, issues.md and tracker.md move
  that scope to `follow-up-feature.md`, which also records the recommendation
  to do AC4 and AC8 first, for convergence speed. This feature ships slice 1,
  PR A, PR B1 and PR C1. The amendment docs are committed directly to the
  integration branch, and the feature-final paired review runs one round.
  Non-blocking findings go to the follow-up brief; blocking findings return
  to the human. Merging into main and the release remain separate human
  instructions.
