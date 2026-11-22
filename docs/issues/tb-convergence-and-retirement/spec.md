# Spec - tb-convergence-and-retirement

**Feature:** `tb-convergence-and-retirement`
**Created:** 2026-11-22

## Summary

GateReeve review loops converge in a bounded number of rounds without
silently dropping real defects, hosted CI runs once per review scope after the
paired reviews converge, reviewers survive idle-stop automation, the shared
metrics store becomes trustworthy and finding-level, and finished worktrees
can be swept safely from outside any run. Controlling input: `design.md`
(approved 2026-11-22) with `interview.md` D1–D27. Delivered as six slices
(D24); each criterion names its slice.

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
- **AC4. Class-level fix records (slice 3).**
  - A `fixed` disposition must carry a sweep record with `class`, `sites`
    (path and line for each site, plus the search used), `fix`, `test` and
    `dependents`; a `fixed` disposition without one is rejected naming the
    missing field.
  - `sites` with one entry plus its search is accepted.
  - The next round's reviewers receive the sweep records, and their
    instructions treat a missed site of a swept class as a regression of the
    previous fix.
- **AC5. Reviewer contract robustness (slice 3).**
  - A reviewer contract error triggers exactly one automatic format-repair
    turn with the same reviewer, given the exact validation errors; the
    existing format-repair validation rejects a repair that changes outcome,
    findings, evidence or mandate assessment. A repair that still fails, or
    changes substance, yields UNAVAILABLE.
  - A known field in a wrong location with exactly one valid location (for
    example `mandateAssessment` inside a per-gate verdict) is moved without a
    model call and recorded as `normalized`.
  - A verdict missing a disposition for a peer's finding is accepted, with that
    disposition recorded as `not-assessed` and the finding left open.
  - Every UNAVAILABLE result carries one reason code: `contract`,
    `malformed-json`, `provider-error`, `timeout`, `missing-evidence` or
    `other`.
  - Repair turns are not rounds; their tokens and duration are recorded.
- **AC6. Round policy (slice 4).**
  - Each review scope (slice PR, feature-final review, or one planning
    document) has a round counter: one paired review of one candidate revision
    is one round, including rounds where one reviewer was UNAVAILABLE. Only a
    human-approved amendment resets it. `status` shows the scope and round.
  - Rounds 1–3: every in-scope finding with a failure scenario that is not low
    blocks. Rounds 4–5: only high findings and medium regressions of the
    previous fix block; other findings become follow-ups. Low never blocks in
    any round, including a low regression of the previous fix. At round 6 the review is not
    qualifying until the human records continue, amend, waive or split; in a
    goal run round 6 requires `goal.park` instead, and adjudication past round
    6 is refused.
  - Planning reviews follow the same schedule.
  - Light runs follow the same schedule, and `status` advises raising rigor
    when a light run's counter reaches 4.
  - PROTOCOL.md's "no fixed ratios or round cap" statement is replaced by this
    policy.
- **AC7. Follow-ups and the Completion decision (slice 4).**
  - Low findings, findings demoted in rounds 4–5 and out-of-model findings are
    recorded as follow-ups in the workflow database with the original finding,
    round, reviewer and reason; `follow-ups.md` is generated from that record.
  - Completion is refused while any follow-up lacks a decision (accept risk,
    new work, or reject), and decisions may be recorded in bulk.
  - Default decisions are recorded under a `policy-default` authority kind,
    never reported as human-confirmed, and listed by `status`: low → accept
    risk, medium → new work. High has no default.
  - A supervised run accepts "accept the defaults" as one human answer.
  - A goal run applies the defaults itself at Completion; an open high
    follow-up blocks the ready-PR terminal state and requires `goal.park`.
  - In a goal run, medium follow-ups' new work is filed as GitHub issues when
    the repository has issues enabled, otherwise recorded as seeds in
    `follow-ups.md`.
- **AC8. Failure model in specs (slice 4).**
  - The spec template has a required `Failure model` section.
  - `spec.validate` for full-rigor specs fails, naming the line, when the
    section is missing or empty, or when an acceptance criterion or rubric
    row uses `always`, `any`, `all cases`, `never fails`, `converges` or
    `robust` without a numeric bound or a reference to the failure model on
    the same line.
  - Specs validated before this version produce a warning instead of a
    failure on resume.
  - The failure model is passed to code reviewers and planning reviewers, and
    reviewer instructions classify out-of-model findings as low.
  - Light briefs may omit a failure model; no lint applies then.
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
  - Acceptance of a candidate still requires a passing `ci` Verification on
    the exact candidate head; local-only evidence never satisfies acceptance by
    itself.
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
    per-worktree list of things that might matter follow D17 and D18 exactly.
  - The regenerable set that is never listed is exact: git-ignored
    directories named `node_modules`, `dist`, `build`, `out`, `.next`,
    `.turbo`, `.cache`, `coverage`, `__pycache__`, `.pytest_cache`, `.venv` or
    `target` at any depth, and `.gatereeve-current` directories. A repository
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
- **AC11. Measurement, surfaces and packaging (all slices).**
  - The shared metrics store records per finding: severity, class ID, class
    statement, criterion, blocking status, round, reviewer provider and model,
    and follow-up status and disposition; per reviewer result, the UNAVAILABLE
    reason; per scope, round numbers.
  - A metrics report computes the four D6 measures from the store alone.
  - CLI status, desktop views, PROTOCOL.md, WORKFLOW.md, the boundary
    procedure and the user guide reflect the new behaviour; resource sync,
    contract and plugin checks pass.
  - Runs and specs from earlier contracts keep working. The new finding fields
    (AC3), sweep records (AC4) and round policy (AC6) apply only to reviews
    executed under this version. Results, findings and dispositions retained
    from an earlier version keep their recorded outcome and qualification on
    resume; their findings read as severity `unrated` and block exactly as
    under their original contract; a later review on a resumed run applies the
    new contract, with its round count starting at 1.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1 idle lock | Tests show the wrapped command with the exact flags and a bounded secret-free `--why` when `systemd-inhibit` is present, a byte-identical command when absent or when the lock probe is refused (with `idleInhibitor: false`), stdin delivered, exit code preserved, timeout terminating the reviewer process, the size guard counting the added arguments, and `idleInhibitor` in the receipt; a live Linux run shows the lock in `systemd-inhibit --list` during a review | Any listed behaviour missing, a review failing because the lock was refused, or the command changed when absent | Adapter unit tests + live host check |
| R2 | AC2 metrics repair | A full CLI test run leaves the shared store's row count unchanged; purge previews then removes only test-suite rows; capture succeeds on duplicate observation times; status reports the real count; a decision's pending time precedes its answer | Any shared-store write from tests, a non-test row purged, or a listed bug reproducible | Metrics tests + before/after store counts |
| R3 | AC3 severity and class | Contract tests reject findings missing severity, failure scenario, class ID or class statement in every gate and rigor; low never blocks; paired disagreement resolves to the higher rating; a disposition cannot change severity | Any missing field accepted, a low finding blocking, or severity changed by a disposition | Protocol contract tests |
| R4 | AC4 sweep records | Tests reject a `fixed` disposition missing any sweep field (naming it), accept a one-site record with its search, and show the next round's input carrying the records | Any missing field accepted, a valid one-site record refused, or records absent from the next round | Protocol tests + reviewer input inspection |
| R5 | AC5 robustness | Tests show one automatic repair turn on a contract error, UNAVAILABLE when repair fails or changes substance, mechanical normalization recorded as `normalized`, `not-assessed` for a missing peer disposition with the finding open, a reason code on every UNAVAILABLE, and repair turns excluded from the round count with tokens and time recorded | A second repair attempt, a substantive repair accepted, a missing reason code, or a repair counted as a round | Protocol tests with fake reviewer adapters |
| R6 | AC6 round policy | Tests cover the counter per scope, UNAVAILABLE rounds counting, reset only by amendment, the three schedule bands (including a low regression of the previous fix not blocking and a medium one blocking in rounds 4–5), round 6 requiring a human decision (or `goal.park` in goal runs, with adjudication refused), planning and light runs following it, and the light-run advice at 4; PROTOCOL.md replaced | Any band mis-applied, a reset without amendment, round 6 passing without the required decision, or the old statement retained | Protocol tests + doc diff |
| R7 | AC7 follow-ups | Tests show follow-up records and generated `follow-ups.md`, Completion refused with an undecided follow-up, bulk decisions, `policy-default` authority never reported as human-confirmed, the low/medium defaults and no high default, the supervised single answer, and goal runs applying defaults, filing or seeding medium work, and parking on open high | Any follow-up lost, Completion allowed undecided, a default reported as human, a high default applied, or a goal run reaching ready-PR with open high | Protocol tests + generated file inspection |
| R8 | AC8 failure model | `spec.validate` fails naming the line for a missing or empty section and for each listed word without a bound or reference, passes with one; old validated specs warn; reviewer inputs carry the model; light briefs without one lint clean | A listed case passing or failing wrongly, or reviewers lacking the model | Spec-lint tests + reviewer input inspection |
| R9 | AC9 CI after convergence | Tests show preparation and review on an unpushed local head, a Verification without a receipt on the candidate tree making the review not qualifying, reviewer instructions assessing changed-area and affected-suite receipts, a same-tree CI Verification with covered receipts qualified mechanically without invalidating converged reviews or launching reviewers, an uncovered consumed receipt failing the check by name, a different-tree CI Verification rejected naming both trees, acceptance refused on local evidence alone, the CI-failure delta path, and the push warning without denial; docs updated | A paired re-review required after same-tree covered CI, an uncovered receipt or a different tree accepted, acceptance on local evidence alone, or a push denied solely because reviews have not converged | Protocol tests + hook tests + doc review |
| R10 | AC10 sweep | Tests over fixture repositories cover discovery, every candidate rule, every skip with its reason, every listed item, exactly the listed regenerable directory names (and a git-config extension) not listed while any other ignored file such as `.env` is listed, `pr-state-unknown` skips, preview by default, confirmed removal with prune and merged-only branch deletion, untouched remote branches, and non-interactive removal limited to empty lists | Any protected worktree removed, a worktree with unknown PR state removed, a listed item omitted, a remote branch touched, or an interactive removal without confirmation, or a non-interactive removal of a worktree with a non-empty list | CLI tests with fixture repositories |
| R11 | AC11 measurement and surfaces | Tests show each listed metrics field stored, a retained earlier-version result keeping its outcome and qualification on resume with `unrated` findings, a later review on that run applying the new contract from round 1, and the four D6 measures reported from the store alone; surfaces and docs updated; the existing suites pass with only the test edits these criteria require; sync, contract and plugin checks pass | A field missing, a measure needing a worktree, a surface or doc missing, or an existing test failing | Metrics tests + full suites + plugin checks |
