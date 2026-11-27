# Spec - tb-metrics-remainder

**Feature:** `tb-metrics-remainder`
**Created:** 2026-11-27
**Issue:** #149 (tracking #150)
**Design:** [`design.md`](design.md), [`interview.md`](interview.md) D1-D11

## Summary

The metrics store records per-finding and per-reviewer review data, the four
D6 success measures are computed from the store (or a fixed dataset) alone,
and the CLI, the desktop metrics card and the user guide show them. Reporting
only: no workflow authority, protocol event or result shape changes.

Out of scope (interview D3, D11): follow-up records (#148), the
earlier-contract planning qualification fix (#136), and purging any live
remote metrics store.

## Definition of Done

The global Definition of Done in the software development workflow applies.
In addition: the changed CLI test suites pass, the hosted Plugin CI passes,
and the desktop resource mirror is byte-identical to
`plugin-src/shared/resources`.

## Failure model

In model: a run journal and result objects as recorded by rc.34 and later,
including UNAVAILABLE results, retried attempts in one round, earlier-contract
findings without severity, rows projected by an earlier projection version,
and fleet datasets that mix both. Out of model: hand-edited or corrupted
journals and result objects (projection failure marks capture incomplete, as
today), and concurrent projection of one workflow from two hosts.

## Acceptance Criteria

- **AC1. Finding fields.** For every finding of a review-gate result, the
  projected finding observation carries `severity` (`high`, `medium`, `low`,
  or `unrated` when the finding has none), `classId`, `criterion`,
  `reviewerBlocking` (the reviewer's flag), `blocking` (whether it blocked
  when raised under the round schedule: `scheduledBlocking` with the result's
  recorded round and whether its path is in the round's regression paths;
  with no recorded round, the reviewer's flag with low never blocking),
  `demoted` (`reviewerBlocking` and not `blocking`), `hasFailureScenario`,
  `reviewScope` and `round` (when recorded), and the existing provider,
  model and `reference` (the hash of the result that raised it). A
  `followUp` field (`undecided`, `accepted-risk`, `new-work` or `fixed`) is
  accepted by the schema but not set by this version. `classStatement` is projected only when it is a single line of at
  most 200 characters. No failure-scenario, evidence or path text is
  projected.
- **AC2. Reviewer result fields.** Every projected review-gate result
  observation carries `reviewScope`, `round` and `band` when its input
  recorded a round policy, `reviewerStatus` (the #140 status mapping of that
  result), and, for UNAVAILABLE results, `unavailableReason` and the provider
  failure category when recorded.
- **AC3. Round and pair rows.** `ROUND_COUNTED` projects `reviewScope` and
  `round`. Each `BOUNDARY_REVIEWED` projects one pair observation (scope,
  round, outcome PASS when every reviewer completed with PASS, FAIL when any
  completed reviewer returned FAIL, otherwise UNAVAILABLE) and one
  `boundary-reviewer` observation per reviewer with its final status, outcome,
  UNAVAILABLE reason, provider, model and final result reference.
  `REVIEW_ADJUDICATED` projects its scope and round. A `waive` decision
  projects its gate IDs.
- **AC4. Validation.** The observation schema accepts the new fields only
  with valid values: enumerated severity, reviewer status, band and
  UNAVAILABLE reason; safe non-negative integer round; booleans for the flags;
  labels (as today) for the rest; gate IDs as a bounded list. Any other value
  is rejected.
- **AC5. Reprojection.** A workflow last projected by the earlier projection
  version is reprojected from its first event on its next projection: every
  observation ID it had keeps its ID, its latest version carries the new
  fields, and no observation is duplicated. A workflow already at the current
  version projects only new events, as today.
- **AC6. Measure 1: rounds to PASS.** A convergence report computes, per
  workflow and boundary review scope (`slice`, `feature-final`), rounds to
  PASS (the round of the first PASS pair or adjudicated pair), the open
  scopes with their current round, the waived scopes (a scope without a
  PASS whose workflow recorded a `waive` naming `review` after the scope's
  latest pair; it is closed, leaves the open list and the median, and makes
  `met` false only when it is a waive after a FAIL streak), and the waives
  after a FAIL streak (a
  `waive` naming `review` recorded after the workflow's latest pair before it
  FAILed, attributed to that pair's scope, which never passed). The median
  covers passed and open scopes, an open scope counting its current round as
  a lower bound. `met` is false when that median exceeds 3 or any waive after
  a FAIL streak exists; otherwise null while any scope is open or no scope
  passed; otherwise true.
- **AC7. Measure 2: demoted findings.** The report has two parts. `recorded`
  counts demoted findings by severity and how many record both a rated
  severity and a failure scenario; its `met` is true when all do (null with
  no demoted finding). `decided` counts demoted findings by `followUp`
  status; its `met` is true when none is missing or `undecided`, and null,
  with a statement that follow-up decisions are not recorded by this
  version, while no demoted finding has `followUp`. The measure's `met` is
  null when either part is null (as the design states), otherwise false when
  either part is false, otherwise true.
- **AC8. Measure 3: escaped defects traced to demoted findings.** The report
  counts confirmed escaped defects: escaped-defect rows with a link basis.
  Origin `links` (bounded reference labels) and `linkBasis` (an enumerated
  value) are projected today and are unchanged by this feature; the basis is
  an enumeration, not free text, and the authority text is never projected.
  The projection keeps an escaped defect's links and basis only when its
  origin is human-stated or agent-proposed and human-confirmed, so a row with
  a basis is confirmed and a row without one is never counted. Counted rows
  are those whose links include
  `finding:<result-hash>:<finding-id>` matching a demoted finding row, and
  how many of those findings have a `followUp` record. It keeps the existing
  escaped-defect statement that absence is not evidence of safety. D6 sets
  no threshold for this measure (it is counted, not passed), so its `met` is
  always null and the report says so; it never reports success.
- **AC9. Measure 4: second opinion.** From `boundary-reviewer` rows, the
  report gives per provider the rounds, UNAVAILABLE count and rate, and the
  findings the reviewer reported in its final results. `met` is true when
  every provider has a rate below 10% and at least one finding, false
  otherwise, and null with no rows. `peerUnmatchedClasses` (class IDs the
  peer's final result in the same pair did not use) is reported as an
  informational proxy and never affects `met`.
- **AC10. Per-reviewer table.** The report lists, per provider and model,
  review results by reviewer status, UNAVAILABLE reasons, normalization and
  rejection rule counts, and findings by severity.
- **AC11. Not recorded is not zero.** Each measure states its denominator.
  Rows lacking the new fields are counted as not recorded and excluded from
  rates and medians, never read as zero, PASS or non-demoted. A measure
  whose cohort contains such rows reports `coverage: incomplete` and
  `met: null`.
- **AC12. CLI.** `gatereeve metrics convergence` prints the report from the
  local reporting store's latest rows, or from `--dataset <id>`, optionally
  filtered by `--project`, `--since` and `--until` (observation time), as
  JSON or `--format markdown`. The reevaluation
  report includes the same `convergence` section in `measurement`, and its
  HTML renders it. The MCP metrics server exposes a read-only `convergence`
  tool. `metrics convergence` is the CLI status surface for these measures (design
  D9); `gatereeve status` and `gatereeve metrics status` are unchanged
  (`status` already shows the run's review scopes and rounds).
- **AC13. Desktop.** The desktop IPC accepts a `convergence` action scoped to
  the selected project (the project cannot be overridden), and the metrics
  card has a control that loads the report and shows the four measures.
  Mandated fallback: if the desktop part proves much larger than the metrics
  and CLI work, it is left open with a comment on #149 and this criterion is
  recorded as deferred by a spec amendment, while AC1-AC12 and AC14 still
  apply.
- **AC14. Documentation.** USER-GUIDE.md explains how to read the four
  measures; PERFORMANCE.md documents the fields, the command and their
  interpretation limits; PROTOCOL.md documents the `finding:` escaped-defect
  link form; cli/README.md lists the command.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Finding fields (AC1) | Tests show projected finding rows with each listed field for a rated finding, an unrated earlier-contract finding, a round 4 medium non-regression (demoted), a round 4 medium regression (blocking), a low finding marked blocking (demoted), and a multi-line or over-long class statement omitted; and no scenario, evidence or path text in any row | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R2 | Reviewer result fields (AC2) | Tests show result rows with scope, round, band and the reviewer status for completed, verdict-rejected, could-not-assess, provider-failed and refused results, with the UNAVAILABLE reason and failure category | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R3 | Round and pair rows (AC3) | Tests show the round, pair (PASS, FAIL, UNAVAILABLE), boundary-reviewer, adjudication and waiver-gate rows from a recorded journal | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R4 | Validation (AC4) | Tests show each new field accepted with a valid value and rejected with an invalid one | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R5 | Reprojection (AC5) | A test projects a workflow under the earlier version, projects again, and shows the same IDs with the new fields as latest and no duplicates; a current-version workflow projects only new events | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R6 | Measure 1 (AC6) | Tests cover a pass at round 2, a pass by adjudication, a scope waived without a FAIL streak (closed, out of the median, `met` unaffected), an open scope counted at its current round, a waive after a FAIL streak, the median and `met` true, false (median over 3 including an open scope, and a waive) and null (open scope) | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R7 | Measure 2 (AC7) | Tests show demoted counts by severity, the recorded part's count and `met`, the decided part not recorded with `met: null`, and the decided part counting `followUp` values (true and false) when present | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R8 | Measure 3 (AC8) | Tests show a confirmed `finding:` link to a demoted finding counted, and an escaped-defect note without a confirmed origin (no basis after projection), a link to a non-demoted finding and a malformed link not counted; the count of linked findings with a `followUp` record (zero and non-zero); the escaped-defect statement present; and `met` null with the no-threshold statement for both zero and non-zero counts | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R9 | Measure 4 (AC9) | Tests show per-provider rates and findings across rounds with a retried attempt counted once, `peerUnmatchedClasses` reported without affecting `met`, and `met` true, false and null | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R10 | Per-reviewer table (AC10) | A test shows statuses, reasons, rule counts and severities grouped per provider and model | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R11 | Not recorded is not zero (AC11) | A test with rows lacking the new fields shows them reported as not recorded, excluded from rates and medians, and the measure reporting `coverage: incomplete` with `met: null`; and every measure in a report states its denominator (scopes, demoted findings, escaped defects, reviewer rounds) | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js` |
| R12 | CLI (AC12) | Tests run `metrics convergence` against a local store and a dataset in JSON and Markdown, with `--project`, `--since` and `--until` filters each excluding a row outside the cohort, show the reevaluation `measurement.convergence` section and its HTML, and call the MCP `convergence` tool and get the same report as the CLI for the same cohort | Any Pass condition is unmet or untested | `cli/test/convergence-metrics.test.js`, `cli/test/fleet-report.test.js`, `cli/test/performance.test.js` |
| R13 | Desktop (AC13) | Desktop tests show the IPC action scoped to the selected project, an override refused, and the metrics card control calling the action and rendering the four measures' results; or, under the AC13 fallback, the spec amendment recording the size comparison that meets the condition (desktop change estimate against the metrics and CLI diff) and the #149 comment | Any Pass condition is unmet or untested | `apps/desktop/test/`; under the fallback, the `spec.md` Changes entry and the #149 comment URL |
| R14 | Documentation (AC14) | The listed documents contain the stated content; the desktop mirror matches the source byte for byte | Any Pass condition is unmet | `USER-GUIDE.md`, `plugin-src/shared/resources/PERFORMANCE.md`, `plugin-src/shared/resources/PROTOCOL.md`, `cli/README.md`, mirror diff |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.

### A1. AC6 waiver rule and scope instances (2026-11-27, human-approved)

Approved by Trent on the PR #169 park question ("Confirm #148 + amend AC6").
Supersedes AC6's definition of a waived scope:

- A boundary review scope is measured per **scope instance**: rows of one
  workflow and scope are split at each `ROUND_COUNTED` of round 1 (the next
  slice PR, a split part, or the rounds after an amendment).
- A `waive` naming `review` closes only the scope instance of the
  workflow's latest reviewed round before it, and only when that instance
  never passed. It is a waive after a FAIL streak when that round FAILed. An
  earlier unpassed scope instance stays open.
- The `met` rule of AC6 is unchanged.

The measure 1 rubric row is assessed against this rule (tests: "scope
instances, one waiver per latest scope, re-reviews and reused results").

### A2. Measure 2's decided part ships with #148 (2026-11-27, human-confirmed)

Trent confirmed that the Completion-decision half of measure 2 (AC7
`decided`) and the follow-up count in AC8 are measured once #148 records
follow-up decisions. This feature delivers the `followUp` field and the
computation; until #148 the decided part reads "not measurable". AC7 and AC8
are unchanged.
