# Spec - tb-follow-up-records

**Feature:** `tb-follow-up-records`
**Created:** 2026-11-27
**Issue:** #148 (tracking #150)
**Design:** [`design.md`](design.md), [`interview.md`](interview.md) D1-D10

## Summary

Every review finding that did not block becomes a follow-up record with its
origin, and every follow-up reaches a recorded decision (accept the risk, new
work, reject) before Completion. Policy defaults make that one supervised
answer or automatic under goal autonomy; medium follow-ups become GitHub
issues. A non-review origin (the future `dependency-scan` gate) records
follow-ups through the same shape, deduplicated by its own key. The metrics
store learns each finding's follow-up status, so convergence measure 2 can be
computed in full.

## Definition of Done

The global Definition of Done in the software development workflow applies.
In addition: the CLI test suite passes, and the desktop protocol and
performance mirrors (`apps/desktop/resources/protocol`,
`apps/desktop/resources/performance`) are byte-identical to
`plugin-src/shared/resources`.

## Failure model

Handled conditions:
- Runs whose retained review results come from the current reviewer contract
  (findings with a severity), from earlier contracts (no severity), or both.
- Runs started before this feature (no follow-up marker) and after it.
- Review scopes at rounds 1 to 6, with sweep records and regression paths,
  paired or individual selection-tagged reviews.
- Repositories with a GitHub remote and without one; a `gh` call that fails,
  or that created an issue whose response was lost.
- A non-review origin reporting the same finding in several executions of one
  run, or in several runs of one repository.
- Supervised, delegated, mandated and goal autonomy; full and light rigor.

Outside the model, GateReeve detects and refuses with a clear error, never a
silent best effort:
- a retained review result that cannot be read makes its follow-ups
  unavailable, and Completion reports that as missing, never as decided;
- a decision input naming an unknown follow-up, a decision the authority may
  not record, or an unknown field is refused before anything is written;
- a failed issue filing records no decision for that follow-up and names the
  failure.

## Acceptance Criteria

- **AC1. Review follow-ups.** `status.followUps.records` lists one record per
  finding ID raised by the run's retained boundary `review` results whose
  finding has a `severity` and did not block when raised (the raise-time rule
  the metrics projection uses: `scheduledBlocking` with the result's recorded
  round, regression paths and sweep records). Each record has `id`
  (`fu-` plus 12 hex characters of the SHA-256 of `dedupKey`), `dedupKey`
  (`review:<raising result hash>:<finding id>`), `repository` (the configured
  alias the finding's `path` starts with, otherwise the first repository of
  the raising result's candidate), `origin` (`kind: review`,
  `result`, `findingId`, `provider`, `model`, `reviewScope`, `round`),
  `finding` (`findingId`, `classId`, `class`, `criterion`, `path`,
  `severity`, `failureScenario`), `reason`, `status` and `decision`. `reason`
  is `low` when the severity is `low`, otherwise `reviewer-non-blocking` when
  the reviewer's `blocking` flag is false, otherwise `demoted` (the round
  band removed the block). The first raising result is the origin. A later
  retained review disposition `resolved` (not overridden by a peer of its
  round that still marks it present or re-reports it) makes the status
  `fixed`; `unsupported` does not change the status. A later `present`
  disposition or re-report after `fixed` reopens it: the status is
  `undecided`, and decisions recorded before the reopening no longer count.
  A finding that
  blocked when raised is never a follow-up, including one later waived or
  adjudicated. Findings without a severity are never follow-ups.
- **AC2. Non-review origins.** `recordFollowUps(core, {origin, findings})`
  (exported from `follow-ups.js`) appends one `FOLLOW_UP_RECORDED` event per
  finding whose dedup key the run has not recorded, and returns every
  finding's record `id` in input order. `origin` is exactly `{kind}`. For
  `origin.kind: "dependency-scan"`, each
  finding has exactly `repository` (a configured alias), `manifest`,
  `vulnId`, `package`, `version`, `severity` (`low|medium|high|critical`)
  and `title`. The record has `id`, `dedupKey`
  (`dependency-scan:<repository>:<manifest>:<vulnId>:<package>@<version>`),
  `repository`, `origin` (`kind: "dependency-scan"` plus the seven finding
  fields and `preExisting: true`), `finding` (`severity`, `class`: the title,
  `path`: the manifest), `reason: "pre-existing"`, `status` and `decision`.
  Recording the same finding twice in one run yields one record. An unknown
  kind, a missing or unknown field, or an unknown repository alias is refused
  naming the field, with nothing recorded. These records appear in
  `status.followUps.records`.
- **AC3. Decisions.** Operation `followup.decide` takes exactly `followUps`
  (a list of 1 to 512 IDs) or `select` (`{status?, severity?, origin?}`),
  `decision` (`accept-risk`, `new-work`, `reject`) or `defaults: true`,
  `reason`, `authority`, and optional `pr` (a PR number for issue backlinks).
  It records one `FOLLOW_UP_DECIDED` event listing each decided ID with its
  decision, authority kind and, for `new-work`, its tracking reference. The
  status becomes `accepted-risk`, `new-work` or `rejected`. A later
  `human-confirmed` decision on the same ID supersedes the earlier one; a
  `policy-default` decision applies only to IDs with no current
  `human-confirmed` decision and skips the others (listed as skipped in the
  result). These eight inputs are refused with nothing recorded: (1) an
  unknown ID; (2) `followUps` empty or longer than 512; (3) `select` with no
  key, or matching no record; (4) both `followUps` and `select`; (5)
  neither; (6) both `decision` and `defaults`; (7) neither; (8) an unknown
  field. Issues are filed before the event is written: when one `gh` call
  fails, the whole call records nothing, and a retry reuses the issues
  already created through the marker search (AC5).
- **AC4. Authority and defaults.** `authority.kind` is `human-confirmed`
  (an instruction and context, as in `human.decide`) or `policy-default`.
  `policy-default` requires `defaults: true` and applies each follow-up's
  default: `low` → `accept-risk`; `medium` → `new-work`; a `preExisting`
  record → `new-work` at every severity; a review `high` has no default and
  stays undecided. The agent may record `policy-default` alone under goal or
  mandated autonomy; under supervised or delegated autonomy it must carry
  `authority.instruction` and `authority.context` (the human's "accept the
  defaults" answer), else it is refused. `human-confirmed` may record
  `decision` or `defaults: true`. `status.followUps.defaults` lists every
  current policy-default decision. A policy-default decision is never
  reported as human-confirmed.
- **AC5. Filing new work.** A `new-work` decision files a GitHub issue in the
  follow-up's repository through `core.runtime.gh` (falling back to the `gh`
  CLI). It first lists open issues whose body contains the marker
  `gatereeve-follow-up:<sha256 of dedupKey>` and reuses the first match;
  otherwise it creates one whose body carries that marker. The tracking
  reference is `{kind: "issue", repository, number, url, reused}`. The issue
  title and body use repository-relative fields only; free text has absolute
  paths, `~/` home paths and the workspace root replaced by `<path>`, and the
  text never contains the feature home, the workspace root or its folder
  name, the run ID, the host name, the alias or path of another configured
  repository, or a term listed in that repository's `followUpRedactions`
  workspace setting (a list of client or project names, matched
  case-insensitively and replaced by `<redacted>`). With `pr`, the body
  links the PR. A repository without a GitHub remote records `{kind: "seed"}`
  without calling `gh`. A failed `gh` call records no decision for that ID and
  the operation fails naming the follow-up.
- **AC6. Enforcement.** `milestone.check completion` reports
  `follow-ups: N undecided (<ids>)` while a record is `undecided`, and
  `follow-ups unavailable: <reason>` when a retained review result cannot be
  read. `milestone.check merge` for a PR whose delivery target is the release
  branch reports `open high follow-up (<ids>)` while a non-`preExisting`
  `high` record is undecided. Under goal autonomy `goal.terminal` is not
  `ready-pr` while a record is undecided; with an undecided non-`preExisting`
  high its reason names the follow-ups and says to park. A
  `FOLLOW_UP_DECIDED` or `FOLLOW_UP_RECORDED` event makes a published goal
  ready record stale. `status.followUps` reports counts by status and by
  severity, the undecided IDs and the next step. Light runs follow the same
  rules.
- **AC7. Generated view.** `followup.decide` and operation `followup.render`
  write `follow-ups.md` in the feature folder: a "generated, do not edit"
  banner, then sections for undecided, decided (with decision, authority kind
  and tracking link), fixed, and seeds for the next feature, each record with
  its severity, origin, class and failure scenario.
- **AC8. PR surface.** The `review.publish` summary lists every follow-up of
  the run (accepted lows included) with its severity, status, authority kind
  and issue link, or states that the run has none.
- **AC9. Metrics measure 2.** A run started by this version records
  `followUps: 1` in `STARTED`. For a marked run, the metrics projection
  (version 3) sets `followUp` on the finding row of each review follow-up
  (matched by raising result hash and finding ID) to the record's current
  status as AC1 and AC3 define it, so a reopened follow-up reads `undecided`,
  and re-emits a row when that status changes. The Completion `MILESTONE`
  record retains the final follow-up list. Runs without the marker leave
  `followUp` absent. Measure 2's `decided` part counts demoted findings by
  `followUp`; a demoted row without `followUp` counts as not recorded, and
  while one exists `decided.met` is null with coverage `incomplete` (never
  true); with every demoted row recorded, `met` is true exactly when none is
  `undecided`. Convergence measure 3 counts a traced demoted finding
  as having a follow-up record when its row has `followUp`. `rejected`
  is an accepted `followUp` value. With these rows, convergence measure 2's
  `decided` part reports counts and `met`, and states "not recorded" only for
  a cohort without marked runs.
- **AC10. CLI.** `gatereeve follow-ups` lists the records (`--json` for the
  structured form), `gatereeve follow-ups decide <file>` runs
  `followup.decide`, and `gatereeve follow-ups render` runs
  `followup.render`.
- **AC11. Documentation.** `PROTOCOL.md` documents the record, the
  non-review API, the operations, the `policy-default` authority, the
  enforcement and the distinction from waivers. `USER-GUIDE.md` explains
  deciding follow-ups; `PERFORMANCE.md` the `followUp` values;
  `cli/README.md` the commands. The desktop mirrors are restaged.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Review follow-ups (AC1) | Tests show a low finding, a reviewer non-blocking medium and a round-4 demoted medium each listed with the stated fields and reason; a round-4 low finding with reason `low`; a blocking finding (including one waived, and one adjudicated) not listed; a finding without severity not listed; a finding on a regression path and a missed site of a swept class in round 4 not listed (they blocked); a finding path outside every alias assigned to the candidate's first repository; a later `resolved` making it `fixed`, `unsupported` leaving the status unchanged, and a peer still marking it present keeping it open; a `present` after `fixed` reopening it as `undecided` with the earlier decision no longer counting; the first raising result as origin | A Pass condition is unmet or untested | `cli/test/follow-ups.test.js` |
| R2 | Non-review origins (AC2) | A test records a synthetic `dependency-scan` finding twice in one run (in 1 call and across 2 calls), gets the same ID returned for each input in input order, and one record with the stated dedup key, `repository`, origin fields (`preExisting: true`), `finding` and `reason`; refusals for an unknown kind, a missing field, an unknown field and an unknown repository are tested with nothing recorded | A Pass condition is unmet or untested | `cli/test/follow-ups.test.js` |
| R3 | Decisions (AC3) | Tests show decision by IDs and by `select`, the event and status, a later human decision superseding a policy default, a later policy-default skipping a human-decided ID, each of the eight refusals with nothing recorded, and a bulk `new-work` call whose second `gh` filing fails recording nothing, with a retry reusing the first issue | A Pass condition is unmet or untested | `cli/test/follow-ups.test.js` |
| R4 | Authority and defaults (AC4) | Tests show the defaults for low, medium, review high (undecided), `preExisting` high and `preExisting` low (both `new-work`); agent policy-default accepted under goal and mandated, refused under supervised and delegated without instruction and accepted with it; `status.followUps.defaults` listing them; authority kind kept as policy-default | A Pass condition is unmet or untested | `cli/test/follow-ups.test.js` |
| R5 | Filing new work (AC5) | With a stubbed `gh`, tests show a created issue with the marker and backlink in the repository the finding path names (with 2 configured repositories), a reused open issue, a seed without a GitHub remote and no `gh` call, a failed call recording no decision, and issue text free of the workspace root and its folder name, feature home, run ID, host name, absolute paths, other repository aliases and paths, and a `followUpRedactions` term | A Pass condition is unmet or untested | `cli/test/follow-ups.test.js` |
| R6 | Enforcement (AC6) | Tests show Completion blocked by undecided and unavailable follow-ups and passing once decided; release merge check blocked by an undecided review high and not by a `preExisting` high; goal `ready-pr` withheld and the park reason; a decision and a newly recorded follow-up each making the ready record stale; status counts; a light run blocked the same way; a run without the `followUps` marker blocked the same way | A Pass condition is unmet or untested | `cli/test/follow-ups.test.js` |
| R7 | Generated view (AC7) | A test shows `follow-ups.md` written by decide and render with the banner and the four sections, each record showing its severity, origin, class and failure scenario, and a decided record its decision, authority kind and tracking link | A Pass condition is unmet or untested | `cli/test/follow-ups.test.js` |
| R8 | PR surface (AC8) | A test shows the published summary listing each follow-up, an accepted low included, with its severity, status, authority kind and issue link, and the "none" statement | A Pass condition is unmet or untested | `cli/test/follow-ups.test.js` |
| R9 | Metrics measure 2 (AC9) | Tests show the `STARTED` marker, projected `followUp` values (undecided, decided, fixed, and undecided again after a reopen), absence for an unmarked run, `rejected` accepted, the Completion milestone list, measure 2 `decided` computed from the rows (met true when all are decided, false with one undecided, null with coverage incomplete for a mixed cohort holding 1 unmarked demoted row), and measure 3's follow-up count from `followUp`; existing convergence tests still pass | A Pass condition is unmet or untested | `cli/test/follow-ups-metrics.test.js`, `cli/test/convergence-metrics.test.js` |
| R10 | CLI (AC10) | Tests run the three commands through the CLI | A Pass condition is unmet or untested | `cli/test/follow-ups.test.js` |
| R11 | Documentation (AC11) | The four documents contain the stated content; the desktop mirrors match the sources byte for byte | A Pass condition is unmet | `PROTOCOL.md`, `USER-GUIDE.md`, `PERFORMANCE.md`, `cli/README.md`, mirror diff |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.

- 2026-11-27 (before implementation authority): spec review round 1 (Codex,
  FAIL, five findings). AC1: only `resolved` makes a follow-up `fixed`, as
  the design states; reopening and the `reason` precedence are defined. AC3:
  a policy default never supersedes a human decision. R1, R3 and R6 cover
  those rules and the stale ready record after a new follow-up.
- 2026-11-27 (before implementation authority): spec review round 2 (Codex,
  FAIL, four findings). AC5 adds the client-name protection
  (`followUpRedactions`) and AC1 the follow-up's repository; AC2 states the
  stored origin shape; AC9 projects the current status, so a reopen reads
  `undecided`. R2, R5 and R9 cover them.
- 2026-11-27 (before implementation authority): spec review round 3 (Claude,
  FAIL, two medium and three low findings). AC1: a path outside every alias
  belongs to the candidate's first repository. AC3 enumerates its eight refusals and the
  all-or-nothing filing. R1, R3, R4, R6 and R8 cover the added cases.
- 2026-11-27 (before implementation authority): spec review round 4 (Codex,
  FAIL, three high and three medium findings). Records stay one per finding
  ID and the API takes `{origin, findings}`, as the design states (a
  round-3 per-scope change was reverted; finding ID stability across scopes
  is the existing reviewer contract). AC9 adds measure 3. R1, R3, R7 and R9
  cover regression paths, sweep records, bulk filing failure, the view's
  details and measure 3.
- 2026-11-27 (before implementation authority): spec review round 5 (Codex,
  FAIL, three high rubric findings). AC9 defines measure 2 for a mixed
  cohort (incomplete, never met). R2, R4 and R9 test the returned IDs, the
  pre-existing low default and the mixed cohort.
