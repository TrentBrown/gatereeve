# Interview - tb-metrics-remainder

**Feature start:** 2026-11-27
**Status:** concluded 2026-11-27

Goal run (autonomy `goal`). The human is not present, so every entry below was
answered by the agent from the design input: GitHub issue #149, the tracking
issue #150, and the source feature's follow-up seed
(`docs/issues/tb-convergence-and-retirement/follow-up-feature.md`), its design
(D6, D17 metrics fields) and spec (AC11). The source on `main` at
`6874b9d` (rc.34, including #140 reviewer outcome statuses and #141 per-rule
normalization counts) is the code baseline.

Each entry: **Question** / **Answer** / **Answered by:** `human | agent` /
**Decision**. An `agent` entry also records **Options:** and
**Reversibility:**.

## Binding input (human)

- **Question:** What is the goal?
- **Answer:** "One PR that closes #149 ... full rigor with goal autonomy ...
  work unattended to a ready, unmerged PR ... If the desktop surface turns out
  much larger than the CLI and metrics work, deliver metrics + CLI status +
  user guide and leave the desktop part open with a comment." (relayed grant)
- **Answered by:** human
- **Decision:** Scope is #149: per-finding and per-reviewer metrics fields,
  the four D6 measures from the metrics store alone, CLI status and desktop
  surfaces, user guide.

The four D6 measures (source interview D6, human-approved):
1. Convergence: median review rounds to PASS is 3 or fewer, and no run ends
   with a waive after a FAIL streak.
2. Nothing silently dropped: every finding demoted to a follow-up is recorded
   with its severity and failure scenario, and decided at Completion.
3. Quality guard: escaped defects later traced to a demoted follow-up are
   counted, with the human naming origins.
4. Second opinion restored: the second reviewer's UNAVAILABLE rate falls below
   10%, and that reviewer produces findings of its own.

## D1 - Where the new fields come from

- **Question:** Which recorded data feed the per-finding and per-reviewer
  fields?
- **Answer:** Everything is already in the run journal and result objects:
  each review result carries `findings` (severity, classId, classStatement,
  criterion, path, blocking), `unavailableReason`, `rejectionRule`,
  `normalized`, `reviewerLaunched`; its prepared input carries `roundPolicy`
  (scope, round, band, regressionPaths); `ROUND_COUNTED`,
  `BOUNDARY_REVIEWED` (per-reviewer outcome rows with #140 statuses) and
  `REVIEW_ADJUDICATED` events carry rounds and pair outcomes. The reporting
  projection (`performance/workflow-projection.js`) only needs to copy
  bounded, enumerated values from these.
- **Answered by:** agent
- **Options:** (a) project from the existing records in the reporting
  projection; (b) add new journal events for metrics.
- **Reversibility:** high; the projection is derived, replaceable reporting
  memory.
- **Decision:** (a). No protocol event or result shape changes. The
  projection stays in the performance module, away from the files the
  parallel #142/#143/#144 work edits.

## D2 - Effective blocking and "demoted"

- **Question:** How is a demoted finding identified from the store?
- **Answer:** A finding is demoted when the reviewer marked it blocking but
  the round schedule did not let it block when it was raised: severity low
  (low never blocks), or rounds 4-5 where only high findings and medium
  regressions block. The projection computes the effective flag with the
  same `scheduledBlocking` rule the boundary uses, from the result's own
  `roundPolicy` (round and regressionPaths).
- **Answered by:** agent
- **Options:** (a) derive with `scheduledBlocking` from the recorded round;
  (b) count only low findings; (c) wait for follow-up records (#148).
- **Reversibility:** high.
- **Decision:** (a). Each finding row carries `reviewerBlocking` (the
  reviewer's flag), `blocking` (effective at raise time) and `demoted`.
  Later re-evaluation of a prior finding against history (origin tracking) is
  not replayed; the raise-time view is the measure.

## D3 - Follow-up status before follow-up records exist

- **Question:** D6 measure 2 needs follow-up records, which #148 adds later.
  What does this PR report?
- **Answer:** The count of demoted findings by severity, with the failure
  scenario recorded per finding (a boolean `hasFailureScenario`, never the
  text), and the follow-up count explicitly reported as not recorded. The
  measure's `met` value is `null` (not measurable) until follow-up rows exist.
- **Answered by:** agent
- **Options:** (a) report demoted findings and mark follow-ups not recorded;
  (b) invent a placeholder follow-up record; (c) implement #148 here.
- **Reversibility:** high; #148 adds a follow-up field to the finding row and
  the measure starts counting it.
- **Decision:** (a). #148 is out of scope (separate issue, later wave).
- **Revision (design review round 1, F1):** the measure has two parts. The
  recording part ("every demoted finding is recorded with its severity and
  failure scenario") is computable now and gets its own `met`: true when every
  demoted finding row records a rated severity and a failure scenario. The
  decision part ("decided at Completion") depends on follow-up decisions,
  which the human sequenced separately: the source seed lists AC7 (follow-up
  records and the Completion decision) apart from AC11, and #150 orders #148
  after this issue. This PR fixes the extension point: a finding row's
  `followUp` field (`undecided | accepted-risk | new-work | fixed`, set by
  #148), and the decision part counts it once present; until then the report
  says follow-up decisions are not recorded by this version and the decision
  part's `met` is null. The overall measure `met` is null while either part
  is null.

## D4 - Escaped defects traced to demoted findings

- **Question:** How does the store link an escaped defect to a demoted
  finding?
- **Answer:** Escaped-defect notes already take free-form origin `links`
  with a human basis. Add one documented link form,
  `finding:<result-hash>:<finding-id>`, naming the result that raised the
  finding. The measure counts confirmed escaped defects with at least one such
  link that matches a demoted finding row (by result reference and finding
  ID). Result hashes are globally unique, so the join works across runs and
  imported snapshots.
- **Answered by:** agent
- **Options:** (a) `finding:<result-hash>:<finding-id>` links; (b) link to a
  run and treat any demoted finding of it as the origin; (c) wait for
  follow-up IDs (#148).
- **Reversibility:** high; #148 can add a follow-up link form alongside it.
- **Decision:** (a). Finding rows keep the existing `reference` field (the
  hash of the result that raised the finding), which is the join key with the
  finding ID (design review round 1, F2).

## D5 - Which reviewer is "the second reviewer"

- **Question:** D6 measure 4 names "the second reviewer". The paired
  selection has no first/second order.
- **Answer:** The concern was the cross-provider second opinion going
  missing. Report the UNAVAILABLE rate and own findings per reviewer provider
  (and model), over each paired round's final per-reviewer outcome
  (`BOUNDARY_REVIEWED` rows, so repair and transient retries are not double
  counted). The measure is met when every provider that took part is below
  10% and produced at least one finding the peer did not report in that round
  (by class ID).
- **Answered by:** agent
- **Options:** (a) per provider, met when all providers qualify; (b) treat the
  non-implementing provider as second (needs the implementer's provider,
  which run.start does not record reliably); (c) the provider with the higher
  rate.
- **Reversibility:** high; a report-time rule.
- **Decision:** (a). It is stricter than the original wording and needs no
  ordering.
- **Revision (design review round 2, F2):** "findings of its own" is measured
  as findings the reviewer itself reported in its final result (its own
  output, as opposed to an UNAVAILABLE or empty result), not as findings
  proven distinct from the peer's: the store has no reliable cross-reviewer
  identity for a defect (class IDs are reviewer slugs). The report adds
  `peerUnmatchedClasses` (class IDs the peer did not use in the same pair) as
  an informational signal only, labelled as a class-ID proxy that does not
  establish distinct defects, and never used for `met`.

## D6 - Rounds to PASS and waives after a FAIL streak

- **Question:** How are rounds to PASS and "a waive after a FAIL streak"
  computed?
- **Answer:** Per workflow and review scope: the round of the first paired
  round (`BOUNDARY_REVIEWED`) in which every reviewer completed with PASS, or
  of a `REVIEW_ADJUDICATED` pair. Scopes with rounds but no PASS are reported
  as open. A waive after a FAIL streak is a `waive` decision naming the
  `review` gate recorded in a workflow whose latest paired round before it had
  a FAIL and that scope never passed. The waiver's gate list is projected
  (enumerated gate IDs only).
- **Answered by:** agent
- **Options:** (a) paired-round based; (b) count individual results.
- **Reversibility:** high.
- **Decision:** (a). Planning scopes are included as their own scopes when
  they record rounds; the measure is reported over boundary scopes (`slice`,
  `feature-final`), which is what D6 discussed.
- **Revision (design review round 3, F2):** open scopes are never dropped.
  The median covers passed and open scopes, an open scope counting its
  current round as a lower bound. `met` is false once that median exceeds 3
  or a waive followed a FAIL streak, because open scopes can only raise the
  median; otherwise it is null while any scope is open, and true only when
  every scope in the cohort has passed or been waived without a FAIL
  streak.

## D7 - Text in the reporting store

- **Question:** D17 lists class ID and class statement per finding. The
  projection rule so far is "enumerated values and counts only, no
  conversation text".
- **Answer:** Project `classId` (a reviewer slug) and `criterion` (a rubric
  ID) as labels; project `classStatement` only when it is a single line of at
  most 200 characters, otherwise omit it. Never project the failure scenario,
  evidence or path text.
- **Answered by:** agent
- **Options:** (a) as stated; (b) no class statement at all; (c) everything
  D17 lists including scenario text.
- **Reversibility:** medium; projected text reaches snapshots that may be
  exported. Narrowing later needs a reprojection.
- **Decision:** (a). The class statement is a one-line defect class name the
  human approved in D17; scenario text stays in the run journal.

## D8 - Rows already projected before this change

- **Question:** Runs that were projected by rc.34 lack the new fields.
- **Answer:** Version the workflow projection. A workflow whose stored
  projection version is older is reprojected from its first event the next
  time it is projected. Observation IDs are stable, so reprojection replaces
  rows (new version, same ID) rather than duplicating them. Runs that are
  never touched again keep their old rows and simply lack the fields; reports
  treat missing fields as not recorded.
- **Answered by:** agent
- **Options:** (a) projection version with reprojection; (b) a one-off repair
  command over all local stores; (c) forward only.
- **Reversibility:** high.
- **Decision:** (a).
- **Revision (design review round 1, F3):** a report never claims success
  from partial data. Every review-gate result row projected by this version
  carries `reviewerStatus`; a review result, finding or pair row without the
  new fields is counted as not recorded, and any measure whose cohort contains
  not-recorded rows reports its partial values with `met: null` and
  `coverage: incomplete`. To measure "the next several real runs" (D6), the
  report takes `--since <date>` (observation time), so a cohort can start
  after this version shipped.

## D9 - CLI surface

- **Question:** What is "CLI status" for these metrics?
- **Answer:** A new `gatereeve metrics convergence` command reports the four
  measures and the per-reviewer table, from the local reporting store by
  default or from a fixed `--dataset`, as JSON or Markdown. The reevaluation
  report's `measurement` gains the same `convergence` section so fleet
  datasets show it too. `gatereeve status` already shows review scopes and
  rounds (source AC11), so it is unchanged.
- **Answered by:** agent
- **Options:** (a) new `metrics convergence`; (b) extend `metrics status`
  (store health; it accepts no arguments); (c) extend protocol `status`.
- **Reversibility:** high.
- **Decision:** (a), plus the reevaluation section.

## D10 - Desktop surface

- **Question:** How large is the desktop part?
- **Answer:** Small. The desktop metrics card already calls the shared
  `metricsRequest` over IPC and embeds the reevaluation HTML. Add the
  `convergence` action to the IPC allowlist (scoped to the selected project
  like `report`), a "Load convergence measures" button and a convergence
  section in the reevaluation HTML. The desktop mirror of the shared
  resources is restaged with the existing sync script.
- **Answered by:** agent
- **Options:** (a) deliver it here; (b) leave it open with a comment on #149.
- **Reversibility:** high.
- **Decision:** (a).

## D11 - Issue #136 and the purge parked item

- **Question:** Fold in #136 (earlier-contract planning PASS qualification) or
  the parked `metrics purge-test-data --workflows-file` item?
- **Answer:** #136 is a planning-qualification fix in `delegation.js`, not a
  metrics change, and does not fall out of this work. The purge command with
  `--workflows-file` already exists on `main`; the parked item is an
  operation on a live remote store, which this run must not touch.
- **Answered by:** agent
- **Options:** fold in / leave.
- **Reversibility:** high.
- **Decision:** Leave both. Say so in the PR.
