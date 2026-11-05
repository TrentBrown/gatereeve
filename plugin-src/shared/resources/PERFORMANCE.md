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

Reuse the execution identity on reimport; use a distinct identity for each actual retry. Imported executions lacking a known link to wrapper spans remain a coverage limitation; do not claim their combined cost is fully deduplicated. CI job-to-start gaps can include dependencies and are not pure queue time. Framework reporter shape support is validated by fixtures, not an assertion that every version is supported.

By default, suite summaries are retained rather than all passing test cases. `gatereeve metrics config --diagnostic-details true` enables at most ten additional normalized case observations per import. Their names remain private identifiers; this is not raw-log or transcript collection. Disable it when the investigation is finished.

## Privacy, storage and interpretation

Commands, paths, raw titles, failure messages and output are not stored by default. Private locally keyed identities support repeat detection. Record references are opaque; inspect canonical evidence separately when necessary. Local reports and MCP responses disclose their selected contents to their caller; sharing/export is an explicit action, not automatic hosted telemetry.

The store retains detail for 90 days and summaries for 365 days (12 months), capped at 100 MiB across projects. The cap takes precedence; active producers are protected. Missing capacity or collector errors leave work running, print a bounded capture warning and can leave incomplete records. Cleanup does not delete authoritative evidence, recovery packets or exported reports. Existing active plugin sessions may remain uninstrumented after installation; verify activation rather than restarting them implicitly.

Reports distinguish observed elapsed time and worker time; neither is CPU time or billed cost. Unknown input identity permits only possible-repeat classification, not proof that work was redundant. Known-execution denominators remain unknown until reconciled against receipts. External/uninstrumented commands are always a blind spot. No report authorizes skipping a check.

## Local MCP

Start a local stdio server with `gatereeve metrics serve`. This exposes only bounded status/report/export tools. `--allow-management` additionally exposes explicit settings and cleanup tools; configure this only where those capabilities are intended. The client's existing approval/authorization policy still applies. No HTTP listener, shell executor or arbitrary filesystem tools are provided.

Example client configuration (add manually to the intended client's configuration; do not restart active sessions without direction):

```json
{"mcpServers":{"gatereeve-metrics":{"command":"gatereeve","args":["metrics","serve"]}}}
```

The small tools-only adapter implements the [MCP 2025-06-18 stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle) and [tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools). It uses newline-delimited JSON-RPC, negotiates the pinned version and bounds each incoming message to 64 KiB. Tool annotations describe behavior; backend validation enforces scope.

## Desktop

In a selected project's overview, load Workflow metrics to inspect totals and capture health. Open the shared report for detail. Measurement settings are global across projects; cleanup preview/apply affect only eligible owned metrics. Opening the panel does not execute validation or refresh remote CI.
