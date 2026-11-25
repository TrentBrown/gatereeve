# Decision Scratchpad - tb-review-honest-unavailability

**Feature start:** 2026-11-25

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1. Rigor "standard" maps to full

- **Promoted:** DEC-1 in `decisions.md` (2026-11-25)

- **Answered by:** agent
- **Decision:** Issue #150 calls this PR "standard" rigor (vs "light" for
  #146). GateReeve offers only full or light, so the run is full, with a
  short design step because the human had already agreed scope.
- **Alternatives:** light (rejected: #150 distinguishes this PR from the light one).
- **Reversibility:** rigor cannot be lowered within a run.

## S2. Mandated autonomy

- **Promoted:** DEC-2 in `decisions.md` (2026-11-25)

- **Answered by:** human
- **Decision:** At the design gate the human granted mandated autonomy for
  this work. After the pause the agent proposed the fixed mandate (deliver
  #140 as designed in one PR with `Closes #140`, and no merge without the
  human), and the human replied "Proceed".

## S3. Spec review took six rounds

- **Promoted:** DEC-3 in `decisions.md` (2026-11-25)

- **Answered by:** human (round-6 choice); agent (fixes)
- **Decision:** Codex reviewed the spec in five rounds. Each FAILed with
  narrower, valid findings: rubric gaps, a sixth status, refused/provider-failed
  precedence, retry identity, attempt-level classification, and the
  `providerFailure` field. At the round-6 hand-back the human chose a sixth
  review, which PASSed. Implementation authority was then recorded as
  `autonomous-evaluator`, citing that PASS.
- **Friction:** the round-6 hand-back can only be recorded after round 6
  runs, so "continue" comes after the sixth review, not before it.

## S4. Classification follows the attempt that launched

- **Promoted:** DEC-4 in `decisions.md` (2026-11-25)

- **Answered by:** agent
- **Decision:** Each reviewer runs as up to three attempts in one round:
  first, transient retry, repair. Each attempt records whether a reviewer
  launched (`reviewerLaunched` on results, `beforeAdmission` /
  `reviewerLaunched` on thrown errors). The row is `refused` only when no
  attempt launched.
- **Alternatives:** classify from the last attempt only. Rejected because a
  refused retry would hide a launched first attempt (spec review round 4).
- **Reversibility:** internal; the fields are additive.

## S5. Round count moved to the provider launch

- **Promoted:** DEC-5 in `decisions.md` (2026-11-25)

- **Answered by:** agent
- **Decision:** `countReviewRound` now runs immediately before
  `independent()`, not before job admission. A packet-assembly refusal (for
  example planning lint) therefore charges no round.
- **Reversibility:** one-line move.

## S6. Repair turn already covered both providers (issue #140 scope 6)

- **Promoted:** DEC-6 in `decisions.md` (2026-11-25)

- **Answered by:** agent
- **Decision:** No code change was needed. The stale PROTOCOL.md sentence
  ("Claude-only retry") was the source of the "anthropic only" report, and it
  is now corrected.

## S7. Boundary review round 1 fixes

- **Answered by:** agent
- **Decision:** Fixed every round-1 finding:
  - Codex R1: explicit earlier passing proof can no longer reach behind a
    later failing verification.
  - Codex R3: the round count and the launch flag now run immediately before
    `adapter.runStage`, after source-view and adapter checks.
  - Codex R4: every provider-failed result records `providerFailure.category`,
    with `timeout` and `unclassified` when the adapter gives none.
  - Codex R2 and R4 test gaps: rows are compared to the job's journaled
    results, legacy rows keep their result references, and a repair refused
    before launch is tested.
  - Claude L3: `Finding <key> must be nonempty text` keeps its prefix.
  - The measurement is copied into `decisions.md` (DEC-8), because the review
    packet omits `interview.md`.
- **Friction:** the local full CLI suite stalls on this machine in
  `local-agent-idle-inhibitor.test.js` (also on unmodified `main`), and the
  user's global git `pre-commit` hook breaks fixture commits to `main` unless
  `GIT_CONFIG_GLOBAL` is isolated, as CI does.

## S8. Boundary review round 2 fixes

- **Answered by:** agent
- **Decision:** Fixed the four Codex findings and Claude's low notes:
  - Launch is now the actual process spawn: `runAgentProcess` takes
    `onSpawn`, and the local adapters advertise `reportsSpawn`. Other
    adapters keep "stage invoked" as the launch.
  - Verification from another candidate, supplied explicitly, refuses with
    `VERIFICATION_REQUIRED`.
  - A reused retained result is a `refused` row (`reused: true`, with its
    results), because no reviewer launched, per AC2 precedence.
  - A claimed blocking finding marked present on PASS carries the claim
    wording.
  - Verification now also runs the consumer suites (CI after convergence,
    workflow robustness, autonomous, goal, delivery, light) and prints the
    committed `interview.md` measurement for R8. The CI plan adds the
    desktop runtime jobs.
- **Note:** `local-agent-adapters.js` gained only the optional spawn hook.
  #142 may also edit this file.

## S9. Boundary review round 3 fixes

- **Answered by:** agent
- **Decision:**
  - Behind an idle-inhibitor wrapper, spawn is reported once the reviewer
    child exists (`/proc` on Linux, `pgrep -P` elsewhere), never for the
    wrapper alone.
  - The spawn report is awaited when the run settles, with a handler attached
    at once, so a failed round count is the run's error, never an unhandled
    rejection.
  - The launch flag is set before the round count.
  - Adapter forwarding of `onSpawn` is tested.
  - Verification adds the idle-inhibitor suite and the remaining consumer
    suites, and the CI plan adds the packaged runtime jobs.
- **Evidence:** on this macOS host, "a timeout kills a reviewer that ignores
  SIGTERM behind a separate wrapper process" and "a timeout still kills a
  wrapped reviewer that closes its streams on SIGTERM and then hangs" fail
  identically on unmodified `main` (e59b02c), run with the same command and a
  45 s per-test timeout. Local verification skips only those two; Linux CI runs
  the whole suite.
