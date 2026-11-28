# Local workflow measurement

Measurement does not select tests, change their exit status, qualify evidence or grant gate authority. Agents remain free to run appropriate checks within the authorized phase. Use the measurement wrapper for ordinary test/build commands so exploratory work appears alongside formal runner activity. Avoid wrapping the same command repeatedly; instrumented descendants carry correlation.

From an installed CLI:

```sh
gatereeve metrics run --category unit --reason initial -- pnpm test
gatereeve metrics status
gatereeve metrics report --project /absolute/project --format html > performance.html
gatereeve metrics report --feature feature-id --format markdown
gatereeve metrics export --limit 1000 --offset 0 > performance.json
gatereeve metrics config --enabled false
gatereeve metrics cleanup                 # preview
gatereeve metrics cleanup --apply         # eligible owned measurement data only
gatereeve metrics purge-test-data         # preview rows from test-suite fixtures
gatereeve metrics purge-test-data --apply --workflow <id...>  # remove the named previewed workflows
gatereeve metrics purge-test-data --apply --workflows-file <path>  # one previewed ID per line
```

`metrics status` reports `records` as everything the store holds, with a
`breakdown` of execution records, reporting observations, known workflows and
datasets. `metrics capture` keeps a stored value when a local row conflicts with
it (same observation identity and time, different content), skips that row and
lists it under `skipped`; explicit snapshot imports still refuse conflicts.
`metrics purge-test-data` previews candidate test-fixture workflows: a workflow
whose database lived below a temporary directory (the host temporary directory,
`/tmp`, `/var/tmp` or macOS `/var/folders`) in a directory with the exact shape
the test suites create (`gatereeve-current-`, `gatereeve-current-surface-`,
`gatereeve-dials-`, `gatereeve-light-`, `gatereeve-s5-` or `gatereeve-targets-`
plus a six-character `mkdtemp` suffix, or `gatereeve session start ` plus an
eight-character `tempfile` suffix) and whose folder no longer exists. The
preview lists each candidate's ID and folder. Nothing is removed automatically:
`--apply` removes only the workflows named with `--workflow <id...>` or
`--workflows-file <path>` (one ID per line), each of which must still be a
candidate, together with their observations. Observations under a project key
that any other workflow also uses are kept.

The CLI test suite (`npm test --prefix cli`) runs through
`cli/scripts/isolated-test.js`, which gives every test process a private scratch
root and metrics store, so tests never write to the shared store or the host
scratch area.

Human wait is measured from a recorded question to the human-confirmed answer of
the same decision kind in the same workflow. Record the question with the
`decision.ask` operation (`gatereeve ask <file>`) when it is presented;
a decision with no recorded question is counted as unmeasured, not as zero.

Without the optional CLI, use the plugin's `resources/performance/command.js` with the same wrapper options and `-- command args...`. Pass the real project/workspace identity consistently across local and CI imports. Omit unknown feature/source identity instead of guessing it. Do not redirect a test's normal output to the measurement store.

Collection defaults to enabled. `GATEREEVE_METRICS=off` disables it for a process and instrumented descendants. `GATEREEVE_METRICS_DIR` selects an owned store for explicit installations and tests; do not point it at an existing project/evidence directory. The default is `~/.local/share/gatereeve/performance`. Settings apply to future observed operations; they do not reload an already running plugin or restart sessions.

## Reporter and import integration

- Vitest: import its JSON reporter output with `--format vitest`.
- Playwright: import JSON reporter output with `--format playwright`.
- Node: use `resources/performance/node-reporter.js` alongside the usual reporter, or import an array of Node events with `--format node`. Missing absolute event times are labeled estimated.
- MyLifeMap: import the verification harness's `artifacts/verification/<suite>.json` with `--format verification`; only selected fields are normalized, never the raw command/error text.
- Release lifecycle: import a retained coordinated-release receipt with `--format release`; stage completion facts are retained without inventing stage execution durations.
- GitHub Actions: explicitly refresh bounded metadata with `--format github --repository owner/repo --run RUN --attempt ATTEMPT`. The `gh` executable uses existing authentication. No CI jobs are dispatched.

```sh
gatereeve metrics import --format vitest --file result.json --execution stable-run-attempt-id --project /absolute/project
gatereeve metrics import --format github --repository owner/repo --run 123 --attempt 1 --execution owner/repo:123:1 --project /absolute/project
```

Reuse the execution identity on reimport; use a distinct identity for each actual retry. For known wrapper/report relationships, assign `metrics run --execution UNIQUE_ATTEMPT` and import with `--parent-id UNIQUE_ATTEMPT --clock "$(hostname)"` on that same host. Use that clock only when the timestamps are known to share the local clock. The parent keeps exclusive setup time; child work is counted once. Never reuse a wrapper ID for a new execution. Imported executions lacking a known link to wrapper spans remain a coverage limitation; do not claim their combined cost is fully deduplicated. CI job-to-start gaps can include dependencies and are not pure queue time. Framework reporter shape support is validated by fixtures, not an assertion that every version is supported.

By default, suite summaries per retry ordinal are retained rather than all passing test cases. `gatereeve metrics config --diagnostic-details true` enables at most ten additional normalized case observations per import. Their names remain private identifiers; this is not raw-log or transcript collection. Disable it when the investigation is finished.

## Privacy, storage and interpretation

Commands, paths, raw titles, failure messages and output are not stored by default. Private locally keyed identities support repeat detection. Record references are opaque; inspect canonical evidence separately when necessary. Local reports and MCP responses disclose their selected contents to their caller; sharing/export is an explicit action, not automatic hosted telemetry.

The store is one local SQLite database (`metrics.sqlite`, using Node's built-in `node:sqlite`) in the store directory, beside its `owner` marker and private `key`. It retains detail for 90 days and summaries for 365 days (12 months), capped at 100 MiB of used database pages across projects (the write-ahead log is transient and excluded). The cap takes precedence; active producers are protected. Each observation is one short transaction; a writer in another process waits up to two seconds for the write lock rather than dropping its observation. Reports select by indexed project, feature and time window instead of reading every record. Age/cap reconciliation runs after 1,000 writes, after an hour or under byte pressure, and pressure evicts the oldest records to 90% of the cap so it stays infrequent. A store written by an earlier collector (one JSON file per record) is imported once, with identities and settings preserved, and those files are then removed; records from a newer collector with unfamiliar labels remain readable. Missing capacity or collector errors leave work running, print a bounded capture warning and can leave incomplete records. Cleanup does not delete authoritative evidence, recovery packets or exported reports. Existing active plugin sessions may remain uninstrumented after installation; verify activation rather than restarting them implicitly.

Reports distinguish observed elapsed time and worker time; neither is CPU time or billed cost. Unknown input identity permits only possible-repeat classification, not proof that work was redundant. Known-execution denominators remain unknown until reconciled against receipts. External/uninstrumented commands are always a blind spot. No report authorizes skipping a check.

## Protocol operation detail

Adapter operations record child spans for work that previously showed only as operation time. `environment-fingerprint` spans cover each computed runtime-input fingerprint (count: bound entries); requests answered from an operation's shared observation add no record. `environment-hash` and `environment-hash-bytes` count the files and bytes an observation actually read, and are absent when every hash came from the stat-validated cache. Independent reviews record `review-prompt` (measured prompt characters; `REJECTED` when no history tier fits the provider limit) and `review-history` (selected entries; `SKIPPED` when some were carried by reference or index only). Counts are sizes, not durations; see `docs/RUN-SCALING.md` in the source repository for their meaning.

## Local MCP

Start a local stdio server with `gatereeve metrics serve`. This exposes only bounded status/report/export tools. `--allow-management` additionally exposes explicit settings and cleanup tools; configure this only where those capabilities are intended. The client's existing approval/authorization policy still applies. No HTTP listener, shell executor or arbitrary filesystem tools are provided.

Example client configuration (add manually to the intended client's configuration; do not restart active sessions without direction):

```json
{"mcpServers":{"gatereeve-metrics":{"command":"gatereeve","args":["metrics","serve"]}}}
```

The small tools-only adapter implements the [MCP 2025-06-18 stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) and [tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools). It uses newline-delimited JSON-RPC, negotiates the pinned version and bounds each incoming message to 64 KiB. Tool annotations describe behavior; backend validation enforces scope.

## Desktop

In a selected project's overview, load Workflow metrics to inspect totals and capture health. Open the shared report for detail. Measurement settings are global across projects; cleanup preview/apply affect only eligible owned metrics. Opening the panel does not execute validation or refresh remote CI. **Load convergence measures** shows the four convergence measures for the selected project (see Convergence measures).

## MyLifeMap rollout and ordinary-use reconciliation

Inventory checked 2026-11-05 against MyLifeMap's root `package.json` and `scripts/run-verification-suite.mjs`. This is a usage plan, not a separate per-project installation or a claim that MyLifeMap has already activated the collector.

| Actual entrypoint | Capture and available detail |
| --- | --- |
| `pnpm verify:fast` | Command wrapper, then verification `steps` receipt |
| `pnpm verify:integration` / `pnpm verify:evaluation` | Wrapper with integration category; verification receipt |
| `pnpm verify:browser` | Wrapper with browser category; verification receipt and optionally Playwright JSON |
| `pnpm verify:deployed` | Wrapper only during separately authorized deployed verification; receipt |
| `pnpm test` | Command wrapper for recursive packages and Node script tests; Node reporter or Vitest JSON where produced |
| `pnpm typecheck` | Command wrapper with build category |
| `pnpm verify:openai-live` / `pnpm verify:postgres` | Existing credential/runtime authority still required; wrapper does not grant it |

The harness writes `artifacts/verification/<suite>.json`: `steps` include `startedAt`, `finishedAt`, `exitCode` and command. Those selected fields are normalized; raw command/error strings do not enter the store. Source/runtime identity is unknown unless observed, never inferred from the command.

1. After separately authorized shared installation, record installed version/source and confirm activation in each new session through its loaded plugin path/version and `metrics status`. Preserve existing active sessions; label their capture pending or incomplete.
2. During ordinary authorized MyLifeMap work, wrap the checks the model chooses. Give each actual run a unique execution ID. Record that ID with the ordinary verification receipt so a later import can name its wrapper parent. Do not run extra tests just to populate metrics.
3. Import matching verification or framework receipts with stable run/attempt IDs and the known wrapper parent/clock. Avoid importing overlapping unlinked representations as separate executions. Refresh only the CI run/attempts actually associated with the work, using explicit `metrics import --format github`.
4. Reconcile the report against the known command list, receipt steps and CI job/attempt IDs: count observations, compare durations and outcomes, reimport once to confirm no duplicate cost, inspect failed retries and missing timestamps, and explain overlaps and unobserved commands. Keep that bounded reconciliation with the feature's verification notes. The report's global denominator remains unknown; the reconciled subset is not all possible work.
5. Retain the first ordinary-use report plus activation and coverage limitations. Installation, released-artifact acceptance and ordinary-use confirmation remain separate from pre-merge fixture success. Do not restart active sessions or claim completion of these delivery obligations from a local test.

### Adapter support boundary

Initial support is structural, not a claim that every framework version is compatible: Node normalized `test:pass`/`test:fail` events; Vitest JSON `testResults` with suite start/end/status; Playwright JSON `suites/specs/tests/results` with startTime/duration/status and optional retry ordinal; GitHub REST jobs/steps with stable IDs, attempt identity and UTC timing. Retries without an ordinal use their position in that test's results. Missing timing produces durable incomplete observations; unsupported top-level shapes are rejected explicitly. Live Node reporter support is tested on the current Node 24 runtime. The fixtures define the supported JSON contract; validate a new producer shape before claiming its coverage. Pure CI queue time and release stage durations are unavailable when not supplied by the source.

## Fixed fleet reevaluation (current/6)

The shared user-local `metrics.sqlite` is the reporting store. Each issue/worktree
has its own authoritative per-contract `.gatereeve-current/workflow.sqlite*` database. Reporting is a
nonblocking projection: it can be incomplete or deleted without erasing workflow
authority. Snapshots import reporting observations only, never approval state.

- `gatereeve metrics capture --platform local --missing-source UpCloud` captures a
  fixed local dataset with explicit missing-source disclosure.
- `metrics snapshot-export <dataset>` and `snapshot-import <file>` move portable
  JSON observations between machines without database synchronization.
- `metrics combine <dataset>...` selects latest observed versions for overlapping
  identities. Conflicting identity/time values reject; existing datasets stay fixed.
- `metrics reevaluate --dataset <id> --format html` emits standalone HTML; JSON is
  the default. Optional exact project/workflow/check/model/platform filters support
  drill down. Unknown historical project labels stay unknown unless mapped.
- `metrics analyze --dataset <id> --provider <provider> --model <model>` explicitly
  requests cited hypotheses and experiments. It never edits policy. Deterministic
  results remain available if the selected provider is unavailable.
- `metrics datasets` lists source windows; `metrics databases` lists known local
  stores, and `--workflow <id>` inspects one workflow's schema/health. CLI `database`
  inspects the current workflow; `--history` exposes bounded structured history.

MCP exposes corresponding `metrics_*` operations; imports/settings/cleanup require
its explicit management capability. Desktop's all-project reevaluation section
uses these same services and supports snapshot transfer, dataset combination,
HTML drill downs, explicit analysis and database visibility. Normal refresh does
not launch analysis or fetch remote data.

Historical rc.23/rc.24 normalized exports can be imported through `legacy-import`
with explicit `records`, `sourceId`, `platform`, `capturedAt` and optional verified
project-ID `labels`. Copy only normalized JSON records; never transfer collector
keys, environment values or raw logs. Remote capture times and missing sources
are visible. Whole conversation/transcript capture and live fleet synchronization
remain deferred. Artifact references leave room for future transcript links.

Use `workflow-note <file>` to retain bounded strategy, friction, escaped-defect,
disposition and artifact notes with reasons and finding/fix/reference links.
These records are agent memory, never a decision constraint or authority source.
An escaped-defect origin link (fix to origin run or PR) is recorded only with a
`linkBasis` of `human-stated` or `agent-proposed` and the human's statement or
confirmation as authority; an unconfirmed agent proposal is refused (see
PROTOCOL.md, Escaped defects). The report distinguishes observed facts from
analysis and unknown denominators; it does not claim complete time capture or
that every repeated check was waste.

**Rigor, autonomy and authority.** Every observation projected from a run
carries `rigor` (`full`/`light`) and `autonomy` (`supervised`/`delegated`/`mandated`/`goal`; retained `autonomous` records report as `mandated`): the
run's dials when its event was recorded. A contract-7 run with no dial events
reads `full`/`supervised`. Observations projected before dial measurement, and
execution timings (which are not run events), have no dial fields and are
grouped as "Not recorded", never as full/supervised. Projected run events:

| Run event | Observation |
|---|---|
| `STARTED` | `event`, check `STARTED`, initial dials; plus one `DIAL_INITIAL` per recorded start dial with `dial`, `dialValue`, `dialSource` (`built-in`/`explicit`), `actor`, `authorityKind` |
| `DIAL_SET` (settings, delegation, escalation, hand-back) | `event`, check `DIAL_SET`, `dial`, `dialValue`, `dialPrevious`, `dialSource` (`explicit`/`automatic`), `actor`, `trigger` (`tripwire`, `amend`, `agent`, `human`, `external-blocker`, `protection-lost`), `authorityKind` when a human instruction was observed |
| `DECIDED` (incl. `stay-light`, delegated decisions) | `decision`, check = kind, `authorityKind` (`human-confirmed`/`delegated-evaluator`/`autonomous-evaluator`), `authorityBasis` (`planning-review`/`autonomous-judgment`/`required-gates`), `actions`, `count` of hits for `stay-light` |
| `TRIPWIRES_EVALUATED` | `event`, `stage`, `outcome` `HIT`/`CLEAR`, hit `count`, hit `categories` (never paths or text) |
| `PLANNING_REVIEWED` | `artifact`, check `planning-review:<artifact>`, outcome, evaluator model/provider |
| `MERGE_BLOCKED` | `event`, `blocker` (`required-review`/`branch-policy`), outcome `BLOCKED` |
| `OBSERVATION` | the note; escaped-defect links only with `linkBasis` |

Review publication writes the PR description and records no run event; it is
measured as the `review.publish` operation timing. `metrics reevaluate` adds
Rigor, Autonomy and Decision authority groups and a `measurement` summary (runs
by dial, dial changes, delegations, escalations and hand-backs by trigger,
decisions by authority, human touches, tripwire hits and stay-light decisions,
planning reviews, external blockers, escaped defects). With no escaped-defect
records the report says "No escaped defects recorded" and that this is not
evidence of safety; it never reports "no escaped defects". Dial comparisons are
observational, not randomized, and are never presented as safety evidence.

Snapshot retention uses the shared metrics summary-retention setting. Explicit
cleanup can expire old datasets and unreferenced reporting observations; it never
removes authoritative workflow databases or retained evidence. Optional analysis
uses a disclosed bounded sample (failures first, then long observations), cites
record IDs, and remains an inference. A project filter accepts a displayed label
or the exact project group ID; equal display names do not merge identities.
Unknown timing stays unknown in aggregate work and elapsed totals.

## Convergence measures (current/8)

The projection (version 3) records the review data behind the four
convergence success measures, and `gatereeve metrics convergence` computes
them from reporting rows alone. Reporting only: nothing here grants or
changes workflow authority.

| Source | Observation fields |
|---|---|
| Review result (`artifact`, check `review`) | `reviewScope`, `round`, `band` when its input recorded a round policy; `reviewerStatus` (`completed`, `refused`, `provider-failed`, `verdict-rejected`, `could-not-assess`); for UNAVAILABLE, `unavailableReason` and the `providerFailure` category |
| Finding (`finding`) | `severity` (`high`/`medium`/`low`, `unrated` for earlier-contract findings), `classId`, `classStatement` (only one line of at most 200 characters), `criterion`, `reviewerBlocking` (the reviewer's flag), `blocking` (whether it blocked when raised under the round schedule, including a missed site of a class an earlier `fixed` claim swept), `demoted` (`reviewerBlocking` and not `blocking`), `hasFailureScenario`, `reviewScope`, `round`, and `reference` (the raising result's hash). In a run that tracks follow-ups (`STARTED.followUps`), `followUp`: the current status of the finding ID's follow-up record (`undecided`, `accepted-risk`, `new-work`, `rejected`, `fixed`), absent when the finding is not a follow-up |
| `ROUND_COUNTED` | `reviewScope`, `round` |
| `BOUNDARY_REVIEWED` | one pair row (`outcome` PASS when every reviewer completed with PASS, FAIL when a completed reviewer FAILed, else UNAVAILABLE; `count` reviewers) and one `boundary-reviewer` row per reviewer with its final attempt's status, outcome, reason, provider, model and result `reference`. The round is the one the reviewers' inputs recorded, else the counted round of the reviewed revision; a pair with neither launched no reviewer on a counted revision and is reported as uncounted, not as a round |
| `REVIEW_ADJUDICATED` | `reviewScope`, `round`, outcome `ADJUDICATED` |
| `waive` decision | `gates` (gate IDs) |
| `STARTED` | `followUpTracking: true` when the run tracks follow-ups (issue #148) |
| Follow-up (`follow-up`) | One row per follow-up record of a tracking run: `followUp` status, `severity` (a scanner's `critical` reads `high`), `reason` (`low`, `reviewer-non-blocking`, `demoted`, `pre-existing`), `findingId`, `classId`, `reviewScope`, `round` and the origin result as `reference`. Re-emitted when its status changes (a decision, a fix, a reopening), as are the follow-up's finding rows |

Failure scenarios, evidence, paths, summaries and reasons are never projected.
A status or reason outside the current vocabulary (retained from an earlier
build) is omitted rather than failing the workflow's projection.
A workflow last projected by version 1 is replayed once: rows that gain
convergence fields get a new version of the same ID with every stored field
kept, other rows are left untouched (earlier rows are not converted), and only
the new per-reviewer rows are added. A replayed version that differs from the
earlier version only in convergence fields is an upgrade, not a conflict:
`metrics capture` keeps it, and importing either snapshot beside the other
keeps the replayed version as latest. Any other difference at the same
observation time is still refused as a conflict.

`gatereeve metrics convergence [--dataset <id>] [--project <label>] [--since <date>]
[--until <date>] [--format json|markdown]` reads this store's latest rows, or a
fixed dataset. MCP `metrics_convergence`, `metrics reevaluate`
(`measurement.convergence` and an HTML section) and the desktop metrics card
("Load convergence measures", scoped to the selected project) show the same
report.

| Measure | Computed as | `met` |
|---|---|---|
| 1. Rounds to PASS | Per workflow and boundary scope instance (`slice`, `feature-final`; a new instance starts at each round-1 count: the next slice PR, a split part, the rounds after an amendment): the first round with a recorded pair whose every reviewer completed with PASS (reviewers of separate pair events never combine), or an adjudicated round. Open scopes count their current round as a lower bound in the median; a `review` waiver closes only the scope instance of the workflow's latest reviewed round before it, when that instance never passed | false when the median exceeds 3 or a waive followed a FAIL; null while a scope is open or none passed; else true |
| 2. Demoted findings | `recorded`: demoted findings by severity, and how many have a rated severity and a failure scenario. `decided`: `follow-up` rows by `followUp` (a cohort without a tracking run reports "not recorded by this version"; a demoted finding row from a run that did not track follow-ups makes `decided` incomplete) | null while either part is null; `decided` is true when no follow-up is `undecided`; else both parts |
| 3. Escaped defects traced to demoted findings | Confirmed escaped defects whose links include `finding:<result-hash>:<finding-id>` naming a demoted finding, the distinct linked demoted findings, and how many of them have a follow-up record | always null: counted, with no threshold |
| 4. Second opinion | Per provider and reviewed round, its final outcome: the latest attempt that launched a reviewer (retries and re-reviews of one revision share the round and count once; a reused retained result is `refused` and never hides an attempt that ran). Rounds, rounds not completed (UNAVAILABLE), rate, and findings from completed final results. `peerUnmatchedClasses` is a class-ID proxy only | true when every provider is below 10% UNAVAILABLE and reported a finding; null without rows |

The report also lists, per provider and model, review results by status,
UNAVAILABLE reasons, normalization and rejection rule counts and findings by
severity. Every measure states its denominator. Rows projected before these
fields (including review results without a reviewer status) are counted as not recorded, never as zero, PASS or non-demoted; a
measure whose cohort contains them reports `coverage: incomplete` and
`met: null`. Use `--since` to measure the runs after an upgrade. A `met`
value is a reading of the recorded cohort, not proof that convergence
improved.
