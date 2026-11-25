# Spec - tb-convergence-and-retirement

**Feature:** `tb-convergence-and-retirement`
**Created:** 2026-11-22

## Summary

GateReeve review loops converge in a bounded number of rounds without
silently dropping real defects, hosted CI runs once per review scope after the
paired reviews converge, reviewers survive idle-stop automation, the shared
metrics store becomes trustworthy and finding-level, and finished worktrees
can be swept safely from outside any run. Controlling input: `design.md`
(approved 2026-11-22) with `interview.md` D1–D36. Six slices (D24); each
criterion names its slice. After slice 1, the remaining slices ship as three
PRs (D33): slices 2 and 6, slice 3, and slices 4 and 5. D34 reordered them
(B1, C1). D36 (2026-11-24) moves sweep records (AC4), follow-ups (AC7), the
failure model (AC8), the remaining parts of AC5 and of AC11 and the retention
part of AC12 into a follow-up feature (`follow-up-feature.md`); this feature
ships slice 1, PR A, PR B1 and PR C1.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Failure model

Handled conditions:
- Reviewer providers that return malformed JSON, misplaced known fields,
  missing peer dispositions, provider errors or timeouts.
- Hosts with or without `systemd-inhibit`, and with or without a logind
  session.
- Runs whose candidates are local commits not yet on any remote.
- A shared metrics store that already holds test-suite rows and duplicate
  observation times.
- Worktrees in any of the states D17 and D18 name, across several
  repositories under one root.

Outside the model, GateReeve detects and refuses with a clear error, never a
silent best effort:
- a reviewer output that remains invalid after one repair turn is
  UNAVAILABLE with a reason code;
- a CI Verification whose head tree differs from the reviewed candidate's tree
  is rejected by name;
- a worktree whose state cannot be read (git error, missing gitdir) is
  skipped with its reason, never removed;
- a metrics store that cannot be opened leaves the underlying operation
  unaffected and reports the capture failure.

## Acceptance Criteria

- **AC1. Reviewer idle-inhibitor lock (slice 1).**
  - On Linux with `systemd-inhibit` on PATH, every reviewer process launched
    through the shared reviewer launch path runs under
    `systemd-inhibit --what=idle --mode=block --who=GateReeve --why=<why>`,
    where `<why>` is `<provider> <role> review: <feature id>`, at most 120
    characters, and contains no prompt text, path outside the feature id, or
    environment value.
  - Without `systemd-inhibit` (including every non-Linux host) the launch
    command is byte-identical to today's.
  - When `systemd-inhibit` is present but refuses the lock (a non-zero exit
    from a lock probe taken before launch, for example with no logind
    available), the reviewer launches unwrapped exactly as when it is absent,
    and the review proceeds.
  - Under the wrapper, stdin is delivered to the reviewer, stdout and stderr
    are captured as before, the reviewer's exit code is reported, a timeout
    terminates the reviewer process itself (not only the wrapper) within the
    existing timeout handling, and the argument-size guard accounts for the
    added arguments.
  - The reviewer receipt records whether an idle inhibitor was held
    (`idleInhibitor: true|false`); it is `false` whenever the launch was
    unwrapped, including after a refused probe.
- **AC2. Metrics repair (slice 2).**
  - Test suites write only to a per-test or temporary metrics store; a full
    CLI test run adds no rows to the shared store at
    `~/.local/share/gatereeve/performance/metrics.sqlite`.
  - A purge command removes rows whose workflows originate from test-suite
    temporary workspaces, previews by default, and leaves every other row
    unchanged.
  - `metrics capture` succeeds on a store containing two observations with the
    same observation time and differing values, keeping both or reporting a
    deterministic resolution instead of failing.
  - `metrics status` reports the actual record count.
  - `DECISION_PENDING` is recorded when a decision question is presented, so a
    human wait between question and answer is measured as non-zero.
  - Scratch area (D28): every CLI test process uses a private temporary
    scratch root, so a full CLI test run creates no run folders or reports
    under the host scratch root (`/tmp/gatereeve`).
  - `gatereeve cleanup --apply` also removes diagnostic reports older than 30
    days and, beyond those, all but the newest 5,000; a report whose run folder
    still exists is never removed, and the preview shows how many reports each
    rule would remove.
  - `gatereeve cleanup` previews and `gatereeve doctor` report file counts
    (per run, total, and the report count) alongside bytes.
  - A run folder older than 7 days whose owner process and children are gone
    is shown as `stranded`, with its file count and the exact
    `gatereeve cleanup --run <id> --apply` command; removal still requires the
    existing eligibility checks.
  - Scratch lock (D33): every isolated test shard and every suite run
    directly with `node --test` uses a private scratch root, so parallel
    shards never share a maintenance lock. Creating a run takes no global
    lock. Cleanup holds the maintenance lock only while renaming an eligible
    run to a tombstone and deletes the tombstone outside the lock. A process
    waiting on a lock whose holder is verified alive keeps waiting and never
    fails on elapsed time alone; a lock whose holder is gone is still
    reported as interrupted and never removed by age.
- **AC3. Finding severity, failure scenario and class (slice 3).**
  - The reviewer contract (code, spec, review and planning gates, both rigors)
    requires each finding to carry `severity` (`high|medium|low`), a
    `failureScenario` (`trigger → observable wrong outcome`), a `classId` and a
    one-line `classStatement`; a finding missing any of them is a contract
    error.
  - Reviewer instructions define the three levels as in D8; low findings never
    block.
  - When paired reviewers rate the same class differently, the qualifying
    result uses the higher rating.
  - An implementer disposition may dispute a severity but cannot change the
    recorded one.
- **AC4. Class-level fix records.** Moved to the follow-up feature (D36).
- **AC5. Reviewer contract robustness (slice 3).**
  - A reviewer contract error triggers exactly one automatic format-repair
    turn with the same reviewer, given the exact validation errors; the
    existing format-repair validation rejects a repair that changes outcome,
    findings, evidence or mandate assessment. A repair that still fails, or
    changes substance, yields UNAVAILABLE.
  - Every UNAVAILABLE result carries one reason code: `contract`,
    `malformed-json`, `provider-error`, `timeout`, `missing-evidence` or
    `other`.
  - Repair turns are not rounds.
  - Substance and bookkeeping (D32, D33): each reviewer's input names the
    findings that need a disposition, computed by GateReeve from the supplied
    history, and the structured-output schema is built per request with the
    allowed finding IDs as enums in every list that names findings. An ID
    disclosed anywhere in the supplied history (including inside an earlier
    UNAVAILABLE result) that appears in a bookkeeping list where it is not
    required is dropped and recorded as `normalized`, never a contract
    error. A historical blocking finding that is still present but now rated
    low takes a disposition that no longer blocks. Contract errors remain
    for substantive contradictions only: PASS with a present blocking
    finding, a missing disposition for an open blocking finding, or an ID
    not disclosed anywhere.
  - Format repair compares substance (outcome, findings with severity and
    evidence, criteria outcomes, coverage decisions, dispositions); free
    text that depends on a repaired field may change.
  - Moved to the follow-up feature (D36): mechanical normalization of a
    misplaced known field, `not-assessed` for a missing peer disposition,
    repair-turn tokens and duration, the read-only `validate-verdict`
    command, and per-rule rejection and normalization counts.
- **AC6. Round policy (slice 4).**
  - Each review scope (slice PR, feature-final review, or one planning
    document) has a round counter: one paired review of one candidate revision
    is one round, including rounds where one reviewer was UNAVAILABLE. Only a
    human-approved amendment resets it. `status` shows the scope and round.
  - Rounds 1–3: every in-scope finding with a failure scenario that is not low
    blocks. Rounds 4–5: only high findings and medium regressions of the
    previous fix block; other findings stop blocking and stay visible on the
    pair (recording them as follow-ups is AC7, moved by D36). Low never blocks in
    any round, including a low regression of the previous fix. At round 6 the review is not
    qualifying until the human records continue, amend, waive or split; in a
    goal run round 6 requires `goal.park` instead, and adjudication past round
    6 is refused.
  - Planning reviews follow the same schedule.
  - Light runs follow the same schedule, and `status` advises raising rigor
    when a light run's counter reaches 4.
  - PROTOCOL.md's "no fixed ratios or round cap" statement is replaced by this
    policy.
- **AC7. Follow-ups and the Completion decision.** Moved to the follow-up
  feature (D36).
- **AC8. Failure model in specs.** Moved to the follow-up feature (D36).
- **AC9. CI after review convergence (slice 5).**
  - `candidate.prepare`, `review.execute` and alternative Verification work on
    a candidate head that exists only as a local commit.
  - Local evidence during rounds: the Verification each review round consumes
    contains at least one runner receipt executed on that round's candidate
    tree, and receipts for the focused tests of every changed source area and
    for every test suite whose code the candidate changes. Reviewers assess
    that coverage in the evidence dimension; a missing receipt for a changed
    area or affected suite is an evidence finding rated under the severity
    rules above, and a Verification with no receipt on the candidate tree makes the
    review not qualifying.
  - After a review scope converges, a `ci` Verification for the pushed head
    whose tree equals the reviewed candidate's tree is qualified by a
    runner-role check with no model call: it confirms tree identity, that
    every required check passed, and that every local receipt the converged
    reviews consumed is covered. A consumed receipt is covered when its check
    is among the CI run's passing required checks, or when it is a passing
    local receipt for the identical tree included in the final Verification.
    A consumed receipt that is neither makes the check fail, naming the
    receipt. Recording it does not make the converged
    reviews non-reusable, and no paired re-review is required for acceptance.
  - A `ci` Verification for a different tree is rejected naming both trees.
  - Acceptance of a candidate in a repository with hosted CI (workflows under
    `.github/workflows/` in the candidate tree) still requires a passing `ci`
    Verification on the exact candidate head; local-only evidence never
    satisfies acceptance there by itself. A repository without hosted CI keeps
    the independently assessed local alternative (amended by D35).
  - After a hosted CI failure, a paired delta review of the fix (one round)
    followed by a passing CI run qualifies acceptance.
  - The PreToolUse guard warns, without denying, on `git push` to a PR branch
    while the current review scope has not converged; existing denials are
    unchanged.
  - The boundary procedure and workflow docs describe local rounds, one push
    after convergence and the CI-failure path.
- **AC10. Worktree sweep (slice 6).**
  - `gatereeve worktree sweep` discovers worktrees with `git worktree list`
    for the named repositories, or for every repository under a configured
    root (default `~/Code`), and previews by default.
  - Candidates and stale worktrees, always-skipped cases with reasons, and the
    per-worktree list of things that might matter follow D17 and D18, as
    amended by D31 (unharvested `.gatereeve-current/` is listed).
  - The regenerable set that is never listed is exact: git-ignored
    directories named `node_modules`, `dist`, `build`, `out`, `.next`,
    `.turbo`, `.cache`, `coverage`, `__pycache__`, `.pytest_cache`, `.venv` or
    `target` at any depth, and `.gatereeve-current` directories whose harvest
    marker is current. A repository
    extends the set only with directory names in its local git configuration
    (`git config --add gatereeve.sweepRegenerable <name>`). Every other
    git-ignored file or directory, including dotfiles such as `.env`, is
    listed.
  - When open-PR status for a worktree's branch cannot be established (no
    `gh`, no authentication, or a host error), that worktree is skipped with
    the reason `pr-state-unknown`, whatever other candidate rule it meets.
  - With confirmation, each confirmed worktree is removed completely, then
    `git worktree prune` runs and the local branch is deleted only when fully
    merged. Remote branches are never touched.
  - Non-interactive mode removes only worktrees whose list is empty.
  - The sweep never removes the main checkout, an open-PR worktree, the
    worktree containing its working directory, or a development branch with
    commits not on the remote.
- **AC11. Compatibility, surfaces and packaging (all slices).**
  - CLI status shows the review scopes and rounds; PROTOCOL.md, WORKFLOW.md
    and the boundary procedure reflect the new behaviour; resource sync,
    contract and plugin checks pass.
  - Runs and specs from earlier contracts keep working. The new finding fields
    (AC3) and round policy (AC6) apply only to reviews executed under this
    version. Results, findings and dispositions retained from an earlier
    version keep their recorded outcome and qualification on resume; their
    findings read as severity `unrated` and block exactly as under their
    original contract; a later review on a resumed run applies the new
    contract, with its round count starting at 1.
  - Moved to the follow-up feature (D36): per-finding and per-reviewer metrics
    fields, the four D6 measures from the store, desktop views and the user
    guide.
- **AC12. Unharvested workflow state in the sweep (slice 6, D31).**
  - The worktree sweep lists a worktree's `.gatereeve-current/` unless a harvest
    marker (`.gatereeve-current/harvested.json` with an ISO `harvestedAt`) is
    newer than every other file in it (D31).
  - Moved to the follow-up feature (D36): reviewer input and activity
    retention (stored instructions, input, schema and event streams,
    reconstructible prompts, Claude stream-json, retained raw output on
    contract failures).

- **AC13. Workflow robustness (slice 2, D33).**
  - The feature's `decisions.md` is created with the other lifecycle
    documents, and `candidate.prepare` fails naming the file when it is
    missing.
  - A verification may declare, per check, the earlier check identities it
    replaces and why. Acceptance treats a replaced identity as covered when
    the paired review that consumed that verification passes the matching
    coverage decision; no separate review round is needed.
  - `job.abandon` records, with a reason, that a runner or
    independent-assessment job whose process is verifiably gone will never
    finish. An abandoned job no longer invalidates proof recorded before it.
    Delivery jobs cannot be abandoned and still require reconciliation.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1 idle lock | Tests show the wrapped command with the exact flags and a bounded secret-free `--why` when `systemd-inhibit` is present, a byte-identical command when absent or when the lock probe is refused (with `idleInhibitor: false`), stdin delivered, exit code preserved, timeout terminating the reviewer process, the size guard counting the added arguments, and `idleInhibitor` in the receipt; a live Linux run shows the lock in `systemd-inhibit --list` during a review | Any listed behaviour missing, a review failing because the lock was refused, or the command changed when absent | Adapter unit tests + live host check |
| R2 | AC2 metrics repair | A full CLI test run, including suites run directly with `node --test` in parallel shards, leaves the shared store's row count and the host scratch root's run and report counts unchanged and never fails on lock contention; tests show run creation without the global lock, cleanup holding the lock only for the tombstone rename, a waiter on a live holder not timing out, and an interrupted lock still reported; purge previews then removes only test-suite rows; capture succeeds on duplicate observation times; status reports the real count; a decision's pending time precedes its answer; report retention removes only reports past the age or count limit whose runs are gone; previews and doctor show file counts; stranded runs are labeled with their count and command | Any shared-store or host-scratch write from tests, a non-test row purged, a report for an existing run removed, a missing file count or stranded label, or a listed bug reproducible | Metrics tests + before/after store counts |
| R3 | AC3 severity and class | Contract tests reject findings missing severity, failure scenario, class ID or class statement in every gate and rigor; low never blocks; paired disagreement resolves to the higher rating; a disposition cannot change severity | Any missing field accepted, a low finding blocking, or severity changed by a disposition | Protocol contract tests |
| R5 | AC5 robustness | Tests show one automatic repair turn on a contract error for either provider, UNAVAILABLE when repair fails or changes substance, a reason code on every UNAVAILABLE, and repair turns not counted as rounds; reviewer input naming the required dispositions; a per-request schema with finding-ID enums; a disclosed-but-not-required ID normalized rather than rejected (including IDs only inside earlier UNAVAILABLE results); a present-but-low historical finding not blocking; a repair with consistent rewording of dependent text accepted | A second repair attempt, a substantive repair accepted, a missing reason code, a repair counted as a round, a substantively valid verdict rejected for bookkeeping, or a present-but-low finding blocking | Protocol tests with fake reviewer adapters |
| R6 | AC6 round policy | Tests cover the counter per scope, UNAVAILABLE rounds counting, reset only by amendment, the three schedule bands (including a low regression of the previous fix not blocking and a medium one blocking in rounds 4–5), round 6 requiring a human decision (or `goal.park` in goal runs, with adjudication refused), planning and light runs following it, and the light-run advice at 4; PROTOCOL.md replaced | Any band mis-applied, a reset without amendment, round 6 passing without the required decision, or the old statement retained | Protocol tests + doc diff |
| R9 | AC9 CI after convergence | Tests show preparation and review on an unpushed local head, a Verification without a receipt on the candidate tree making the review not qualifying, reviewer instructions assessing changed-area and affected-suite receipts, a same-tree CI Verification with covered receipts qualified mechanically without invalidating converged reviews or launching reviewers, an uncovered consumed receipt failing the check by name, a different-tree CI Verification rejected naming both trees, acceptance refused on local evidence alone in a repository with hosted CI (D35), the CI-failure delta path, and the push warning without denial; docs updated | A paired re-review required after same-tree covered CI, an uncovered receipt or a different tree accepted, acceptance on local evidence alone in a repository with hosted CI, or a push denied solely because reviews have not converged | Protocol tests + hook tests + doc review |
| R10 | AC10 sweep | Tests over fixture repositories cover discovery, every candidate rule, every skip with its reason, every listed item, exactly the listed regenerable directory names (and a git-config extension) not listed while any other ignored file such as `.env` is listed, `pr-state-unknown` skips, preview by default, confirmed removal with prune and merged-only branch deletion, untouched remote branches, and non-interactive removal limited to empty lists | Any protected worktree removed, a worktree with unknown PR state removed, a listed item omitted, a remote branch touched, or an interactive removal without confirmation, or a non-interactive removal of a worktree with a non-empty list | CLI tests with fixture repositories |
| R12 | AC12 unharvested state in the sweep | Sweep fixture tests list unharvested workflow state and do not list state with a newer harvest marker | Unharvested state deleted without being listed | Sweep fixture tests |
| R11 | AC11 compatibility and surfaces | Tests show a retained earlier-version result keeping its outcome and qualification on resume with `unrated` findings, a later review on that run applying the new contract from round 1, and status showing review scopes and rounds; PROTOCOL.md, WORKFLOW.md and the boundary procedure updated; the existing suites pass with only the test edits these criteria require; sync, contract and plugin checks pass | A retained result losing its qualification, a resumed run not applying the new contract, a listed doc missing, or an existing test failing | Protocol tests + full suites + plugin checks |
| R13 | AC13 workflow robustness | Tests show `decisions.md` created with the lifecycle documents and `candidate.prepare` failing by name without it; a declared check replacement accepted at acceptance after the consuming paired review passes its coverage decision and refused when it fails; `job.abandon` accepted for a gone runner or assessment job, refused for a live one or a delivery job, and older proof qualifying again after abandonment | A missing decisions log found only at review, a replacement needing a separate round or accepted without the review decision, or an abandoned delivery job | Protocol tests |

## Moved to the follow-up feature (D36)

Sweep records (AC4), follow-ups and the Completion decision (AC7), the
failure model in specs (AC8), the listed parts of AC5 and AC11, and the
retention part of AC12, with their former rubric rows 4, 7 and 8, are moved
to the follow-up feature in `follow-up-feature.md`. Rubric row numbers are
kept.
