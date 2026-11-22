# Plan - tb-convergence-and-retirement

**Feature:** `tb-convergence-and-retirement`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-22

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge
  cases (D1–D27).
- `handoff.md` supplies code pointers and the evidence base from the Mac
  interview.

## Strategy

Six slices (D24), each a branch from the integration branch
`tb-convergence-and-retirement` and a SLICE PR back into it. Each slice:

1. implements on a local slice branch, committing locally;
2. iterates paired boundary review rounds on local commits with local
   `alternative` Verification from focused and affected-suite receipts;
3. after the reviews converge, pushes once, opens the PR, records the hosted
   CI run as the final Verification, and qualifies acceptance;
4. merges into the integration branch through the protected path.

The final FEATURE PR from the integration branch to `main` is reviewed and
left ready and unmerged.

Every shared resource change is restaged into the desktop copies
(`node apps/desktop/scripts/stage-protocol.mjs`) and checked with
`npm start --prefix cli -- plugin validate | lint | validate-native | build`.

## Steps

### P1 - Reviewer idle-inhibitor lock (slice 1, AC1)

- In `plugin-src/shared/resources/protocol/local-agent-adapters.js`, add one
  wrapper used by `runAgentProcess` callers (Codex and Claude adapters): on
  Linux, when `systemd-inhibit` resolves on PATH, launch
  `systemd-inhibit --what=idle --mode=block --who=GateReeve --why=<why> <executable> <args…>`.
  The `why` text is built from provider, role and feature id, stripped of
  control characters and truncated to 120 characters.
- On this host (systemd 259) `systemd-inhibit` forwards SIGTERM to its child
  (checked 2026-11-22: wrapper and child both gone after SIGTERM to the
  wrapper). Keep a test that the reviewer process is gone after a timeout; if
  forwarding fails elsewhere, run the child in its own process group and
  signal the group.
- Before wrapping, probe the lock once per launch
  (`systemd-inhibit --what=idle --mode=block --who=GateReeve --why=<why> true`);
  a non-zero probe exit means launch unwrapped with `idleInhibitor: false`.
- Apply `assertArgumentSizes` to the final argv including wrapper arguments.
- Record `idleInhibitor: true|false` in the receipt (`receiptFor`).
- Tests: injected `platform`/`which` seams for presence and absence, a fake
  executable proving stdin, exit code and timeout, and a live check on this
  Linux host that `systemd-inhibit --list` shows the lock during a run.

### P2 - Metrics repair (slice 2, AC2)

- Route the CLI test suite's metrics writes to a temporary store
  (`GATEREEVE_PERFORMANCE_HOME` or the equivalent override in
  `performance/service.js`), set once in the test harness so no test can
  reach the shared store.
- Add a purge of test-suite rows (`gatereeve metrics purge --test-data`,
  preview by default) keyed on the `gatereeve-current-surface-*` and other
  test temporary workspace origins.
- Reproduce and fix the capture conflict ("Conflicting values for the same
  observation time") with a deterministic resolution, and the `status` zero
  count.
- Scratch area (D28): set a private `TMPDIR` scratch root for every test
  process in the test harness (`cli/test/helpers` and the `npm test` script),
  and assert the host scratch root is untouched after a run.
- In `plugin-src/shared/resources/storage/scratch.js`: report retention (30
  days, newest 5,000, never a report whose run folder exists) applied by
  `cleanup --apply` and counted in the preview; file counts per run and in
  total in previews and `doctor`; a `stranded` label for runs older than 7
  days with dead owners and children, with the exact per-run command.
- Record `DECISION_PENDING` at question time: find where the question is
  presented (pending decisions in status / hook paths) and emit the
  observation then.

### P3 - Reviewer contract: severity, failure scenario, class (slice 3, AC3, AC4)

- Extend the verdict schema in `protocol/current/execution.js` and the
  planning review schema in `delegation.js` with `severity`,
  `failureScenario`, `classStatement` (with the existing `classId`).
- Update reviewer instructions with the D8 definitions; make low findings
  non-blocking in finding obligations.
- Paired disagreement on a class resolves to the higher severity in pair
  qualification (`boundary-review.js`).
- Extend the disposition schema: `fixed` requires a sweep record
  (`class`, `sites[]` with path/line, `search`, `fix`, `test`, `dependents`);
  pass prior sweep records into the next round's review input.

### P4 - Reviewer contract robustness and finding metrics (slice 3, AC5, AC11 part, AC12)

- Retention (AC12): in `local-agent-adapters.js` return the prompt parts and
  the raw stdout with each stage result; in `execution.js` and
  `delegation.js` store instructions, input, output schema and the event
  stream with `core.store.putJson`/`put` and reference them from the stored
  receipt (`retained: {instructions, input, outputSchema, events}`). Switch
  Claude to `--output-format stream-json --verbose` and parse the final
  `result` event (`structured_output`, `session_id`, usage). On contract or
  malformed-output UNAVAILABLE, store the raw output and validation errors.
  Test: reconstruct `promptText` from the stored objects and compare digests.

- On a contract error from a reviewer, run one automatic repair turn through
  the existing `repair` path (`execution.js`, `validateFormatRepair`) with the
  exact validation errors; never a second.
- Add mechanical normalization for known misplaced fields with exactly one
  valid location, recorded as `normalized`.
- Missing peer disposition → `not-assessed`, finding stays open.
- Add `unavailableReason` to every UNAVAILABLE result.
- Record repair-turn tokens and duration outside the round count.
- Write per-finding and per-reviewer-result fields to the shared metrics
  store.

### P5 - Round policy and goal wiring (slice 4, AC6)

- Add a round counter per review scope in the protocol state (scope key:
  slice PR candidate scope, feature-final, or planning artifact), reset only
  by an `amend` decision. Project it in `status`.
- Apply the schedule in finding obligations: rounds 1–3 block non-low
  in-scope findings; rounds 4–5 block high findings and medium
  regressions of the previous fix (low never blocks); round 6 makes
  review non-qualifying until a human decision (continue, amend, waive,
  split), or `goal.park` in a goal run; refuse adjudication at round 6.
- Light-run advice at round 4. Replace the PROTOCOL.md "no fixed ratios or
  round cap" statement.

### P6 - Follow-ups, defaults and Completion (slice 4, AC7)

- Record follow-ups (low, demoted, out-of-model) in the workflow database
  with origin data; generate `follow-ups.md`.
- Add a `follow-up` decision with bulk support and the `policy-default`
  authority kind; Completion refuses undecided follow-ups.
- Supervised "accept the defaults" answer; goal runs apply defaults, file
  medium follow-ups as GitHub issues when issues are enabled (otherwise seed
  them in `follow-ups.md`), and park on open high.

### P7 - Failure model in specs (slice 4, AC8)

- Add the `Failure model` section to the spec template and the
  spec-draft/spec-validate procedures.
- Extend the trusted spec lint with the section check and the unbounded-word
  check (same-line bound or failure-model reference), versioned so earlier
  validated specs warn on resume.
- Pass the failure model to code and planning reviewer inputs; reviewer
  instructions classify out-of-model findings as low.

### P8 - CI after review convergence (slice 5, AC9)

- Verify `candidate.prepare`, `review.execute` and alternative Verification on
  an unpushed head; fix any remote-head assumption found.
- Add a runner-role CI qualification: when a `ci` Verification's head tree
  equals the converged candidate's tree, every required check passed, and every
  local receipt the converged reviews consumed is covered (its check is among
  CI's passing required checks, or it is a passing same-tree local receipt
  included in the final Verification), the converged reviews remain
  qualifying. An uncovered consumed receipt fails the check by name. Implement it in the reuse/qualification
  path so evidence identity for consumed local Verification is satisfied by
  the same-tree CI proof instead of `consumed-proof-changed`, and record the
  check as a runner result (no model call).
- Reject a different-tree CI Verification naming both trees; keep acceptance
  requiring a passing CI Verification on the exact head.
- PreToolUse: warn on `git push` to a PR branch while the review scope has not
  converged.
- Reviewer instructions assess the AC9 local-evidence rule; a Verification
  without a receipt on the candidate tree makes the review not qualifying.
- Update `commands/pr-boundary.md`, WORKFLOW.md and PROTOCOL.md.

### P9 - Worktree sweep (slice 6, AC10)

- New `cli/src/commands/worktree.js` with `sweep`: discovery, candidate and
  stale rules, skips with reasons, the D17 list (regenerable set:
  the exact git-ignored directory names in AC10 plus `.gatereeve-current`,
  extended only by `git config gatereeve.sweepRegenerable`), preview by default, per-worktree confirmation, removal,
  `git worktree prune`, merged-only local branch deletion, non-interactive
  mode limited to empty lists.
- PR state through `gh`. When open-PR status for a branch cannot be
  established, that worktree is skipped as `pr-state-unknown`, whatever other
  candidate rule it meets.
- List `.gatereeve-current/` unless `.gatereeve-current/harvested.json`
  (`harvestedAt`) is newer than every other file in it (D31).
- Fixture-repository tests.

### P10 - Measurement, surfaces and docs (all slices, AC11)

- Version the reviewer contract: new fields, sweep records and round policy
  apply to reviews executed under this version; retained earlier results keep
  their outcome, with findings read as `unrated`. Tests replay a retained
  earlier-version run.

- Metrics report for the four D6 measures from the shared store.
- CLI status and desktop views for round, follow-ups, unavailable reasons,
  idle inhibitor; PROTOCOL.md, WORKFLOW.md, USER-GUIDE.md, cli/README.md.
- Restage resources; plugin checks.

## Rubric mapping

| Step | Rubric |
|---|---|
| P1 | R1 |
| P2 | R2 |
| P3 | R3, R4 |
| P4 | R5, R11, R12 |
| P5 | R6 |
| P6 | R7 |
| P7 | R8 |
| P8 | R9 |
| P9 | R10 |
| P10 | R11 |
