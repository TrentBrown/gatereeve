# Design - tb-metrics-remainder

**Status:** draft

## Problem

The convergence work (source feature `tb-convergence-and-retirement`) defined
four success measures (D6) to judge, over the next real runs, whether review
convergence actually improved. Its AC11 remainder was moved to this feature:
the metrics store does not yet hold the per-finding and per-reviewer fields
those measures need, nothing computes them, and no CLI, desktop or guide
surface shows them. Today the reporting projection records a finding only as
`{kind: finding, findingId}` and a reviewer result only as its outcome, so the
four measures cannot be answered from the store.

## Intent

Make the four D6 measures, and the per-reviewer reliability behind them,
reportable from the local metrics store (or a fixed fleet dataset) alone, and
show them in the CLI, the desktop metrics card and the user guide. Reporting
only: nothing here grants or changes workflow authority.

## Chosen shape

All decisions: `interview.md` D1-D11 (agent-answered, goal run).

**1. Projection fields** (`performance/workflow-projection.js`, `fleet.js`
observation schema). From records that already exist (D1):

- Review result rows (`kind: artifact`, gate `review`): `reviewScope`,
  `round`, `band`, `unavailableReason`, `reviewerStatus` (#140 status of this
  result: completed, refused, provider-failed, verdict-rejected,
  could-not-assess), `providerFailure` category.
- Finding rows: `severity` (`high|medium|low|unrated`), `classId`,
  `classStatement` (one line, at most 200 characters, else omitted; D7),
  `criterion`, `reviewerBlocking`, `blocking` (effective at raise time under
  the round schedule), `demoted`, `hasFailureScenario`, `reviewScope`,
  `round`, plus the existing provider, model and `reference` (the raising
  result's hash: with `findingId`, the join key for D6.3) (D2, D4). The
  `followUp` field (`undecided | accepted-risk | new-work | fixed`) is
  defined and validated here but set only once follow-up records exist
  (#148, D3).
- `ROUND_COUNTED` events: `reviewScope`, `round`.
- `BOUNDARY_REVIEWED` events: one row per paired round (`reviewScope`,
  `round`, `outcome` PASS when every reviewer completed with PASS, else FAIL
  or UNAVAILABLE) and one `boundary-reviewer` row per reviewer with its final
  `reviewerStatus`, `outcome`, `unavailableReason`, provider, model and the
  final result hash as `reference` (D5, D6).
- `REVIEW_ADJUDICATED` events: `reviewScope`, `round` (from the adjudicated
  pair's result input).
- `waive` decisions: `gates` (enumerated gate IDs).
- New fields are validated: enumerations for severity, status, band and
  reason; safe integers for round; booleans for the flags; labels for the
  rest. Text beyond D7's class statement is never projected.
- Projection version 2: a workflow last projected under version 1 is
  reprojected from its first event, replacing rows by stable ID (D8).

**2. Measures** (`performance/convergence.js`, new). A pure function over
observation rows returns:

- `rounds` (D6.1): per scope rounds to PASS, open scopes with their current
  round, waived scopes, waives after a FAIL streak, and the median over
  passed and open scopes, where an open scope counts its current round as a
  lower bound. `met` is false when that median exceeds 3 or a waive followed
  a FAIL streak (open scopes can only raise it); otherwise null while any
  scope in the cohort is open (`coverage: in-progress`) or no scope passed;
  otherwise true. Open scopes are never dropped from the median.
- `demoted` (D6.2): two parts (D3). `recorded`: demoted findings by
  severity, how many record a rated severity and a failure scenario, `met`
  when all do. `decided`: demoted findings by `followUp` status, `met` when
  none is missing or `undecided`; null with the statement that follow-up
  decisions are not recorded by this version while no row has `followUp`.
  The measure's `met` is null while either part is null.
- `escapedFromDemoted` (D6.3): confirmed escaped defects whose
  `finding:<result-hash>:<finding-id>` link matches a demoted finding (D4).
- `secondOpinion` (D6.4): per provider rounds, UNAVAILABLE count and rate,
  and findings the reviewer itself reported in its final results; `met` when
  every provider is below 10% and reported at least one finding (D5).
  `peerUnmatchedClasses` (class IDs the peer did not use in the same pair) is
  informational only, labelled as a proxy that does not establish distinct
  defects, and never used for `met`.
- `reviewers`: per provider and model, results by `reviewerStatus`,
  UNAVAILABLE reasons, rejection and normalization rule counts (#141 rows),
  findings by severity.
- Every section states its denominators and that rows projected before this
  version are not recorded, never zero. A measure whose cohort contains
  not-recorded rows reports `coverage: incomplete` and `met: null`, never a
  success from partial data; `--since` selects a cohort by observation time
  (D8).

**3. Surfaces.**

- CLI `gatereeve metrics convergence [--dataset <id>] [--project <label>]
  [--since <date>] [--until <date>] [--format json|markdown]` (D9). Without `--dataset` it reads the local
  reporting store's latest rows.
- `metrics reevaluate` gains `measurement.convergence`, and its HTML a
  convergence section.
- Desktop: IPC `convergence` action scoped to the selected project, a "Load
  convergence measures" button in the metrics card (D10). Desktop resource
  mirror restaged.
- MCP metrics server: a read-only `convergence` tool, matching `report`.

**4. Docs.** USER-GUIDE.md (how to read the measures), PERFORMANCE.md (fields,
command, interpretation limits), PROTOCOL.md (escaped-defect finding link
form), cli/README.md (command).

## Alternatives considered

- New metrics journal events (D1): duplicates data already recorded and
  touches protocol files the parallel work edits.
- Waiting for #148 follow-up records before measure 2 and 3 (D3, D4): would
  leave two measures unreportable; the chosen fields extend cleanly.
- Identifying a "second" reviewer (D5): needs an ordering the selection does
  not record.

## Constraints

- Reporting never grants passage or changes workflow state; projection
  failure only marks capture incomplete (existing rule).
- Stay out of `execution.js`, `boundary-review.js`, `local-agent-adapters.js`
  (#142), reviewer instructions and spec lint (#143), and round-policy
  disposition/sweep code (#144). This design reads their exported helpers
  (`scheduledBlocking`, `outcomeStatus`) without editing them.
- Desktop protocol/performance mirror stays byte-identical to
  `plugin-src/shared/resources`.
- Do not touch any live remote metrics store.

## Open risks

- Older runs not reprojected lack the fields: measures report incomplete
  coverage for cohorts that include them; early cohorts after the release
  are small.
- Measure 2's Completion-decision part stays unmeasurable until #148 sets
  `followUp`; this is the human's sequencing (#150), not a dropped
  requirement.
- `outcomeStatus` and the result shape are owned by #142; a rename there
  breaks the projection quietly into "capture incomplete". Tests pin the
  mapping.
- The raise-time effective blocking can differ from the boundary's later view
  of a prior finding (origin tracking); D2 accepts that.

## Changes

- Out of scope: #148 follow-up records, #136 planning qualification, the
  parked live-store purge (D11).
