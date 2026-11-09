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
```

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

In a selected project's overview, load Workflow metrics to inspect totals and capture health. Open the shared report for detail. Measurement settings are global across projects; cleanup preview/apply affect only eligible owned metrics. Opening the panel does not execute validation or refresh remote CI.

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
has its own authoritative `.gatereeve-current/workflow.sqlite`. Reporting is a
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
The report distinguishes observed facts from analysis and unknown denominators;
it does not claim complete time capture or that every repeated check was waste.

Snapshot retention uses the shared metrics summary-retention setting. Explicit
cleanup can expire old datasets and unreferenced reporting observations; it never
removes authoritative workflow databases or retained evidence. Optional analysis
uses a disclosed bounded sample (failures first, then long observations), cites
record IDs, and remains an inference. A project filter accepts a displayed label
or the exact project group ID; equal display names do not merge identities.
Unknown timing stays unknown in aggregate work and elapsed totals.
