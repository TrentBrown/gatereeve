# Delivery execution contract

The model chooses work inside the authorized phase. GateReeve verifies identities,
declared inputs, required separate verdicts and authority at milestone boundaries.
Judgments about adequate scope, coverage, decision dispositions and replacement
checks belong in existing independent reviews; do not launch an assessor per setting.

## Runner profiles

Pass a reusable JSON configuration to `evaluate --configuration`. The baseline
contains PATH, C locale, and available HOME/USER/LOGNAME/SHELL/temporary-directory
and Windows launch settings. Only named additions are inherited. Resolve once per
attempt; the same effective environment launches every declared check.

```json
{
  "environment": {
    "inherit": ["PROJECT_TEST_TOKEN"],
    "required": ["PROJECT_TEST_TOKEN"],
    "values": {"NODE_ENV": "test"}
  },
  "externalRuntimeInputs": {"app": []},
  "workspaceSources": {"app": ["packages/unusual"]},
  "checks": [
    {"repository":"app","command":"npm","args":["run","build"],"purpose":"Build reviewed source","produces":["dist"]},
    {"repository":"app","command":"npm","args":["test"],"purpose":"Exercise distributed behavior","generatedInputs":[{"path":"dist","fromCheck":0}]}
  ],
  "diagnostics": {"maxBytes":65536,"maxChangedPaths":100}
}
```

Keep secrets out of literal `values` and arguments; inherit named settings instead.
Required missing values fail before launch. Environment identities use a private
local comparison key; key loss requires refreshed proof. Logs redact named inherited
additions before retention. Failed-check excerpts default to 64 KiB and changed-path lists to 100 entries, with truncation
and retained supporting references. Deeper capture can increase the limit.

Standard pnpm/npm/Yarn workspace declarations identify pinned source packages.
Dependency links to those packages bind package/source identity without following
their generated output. Verified `workspaceSources` declarations handle unusual
layouts. Explicit runtime inputs remain exact; unknown, escaping or cyclic links
remain conservative. Declared output scopes are concrete directories/files without
symlinks. A generated input uses `fromCheck` for an earlier preparation in this
attempt or `fromResult` for an applicable retained runner result. Its output must
still match the preparation receipt. A stale output hash alone is insufficient.
Reviewers assess whether these declarations cover the real execution.

## Reviews and evidence

Batch `code`, `spec`, `reconcile`, `triage` when useful. Judge stays separate.
Use `coverageClaims` (CLI `--coverage-claims`) with `id`, `supersedes`,
`replacements`, selected `criteria` and `reason`. References name actual results.
Independent spec/Judge verdicts qualify each replacement in `coverageDecisions`;
prior failures remain in history. Mechanical proof equivalence ignores receipt
timestamps, not substantive output, configuration, source or coverage changes.

The output schema enumerates selected criterion IDs. `repair` (CLI `--repair`)
names an original unvalidated result and requests independent targeted correction.
Original findings, evidence and outcome remain intact. Changed substantive
assessment requires a normal reassessment. If provider context is lost, the fresh
independent context receives the original output and pinned evidence.

## Delivery and installation

`delivery.resume` / `resume-delivery` reconnects unfinished work and advances
eligible acceptance, scoped merge and completion actions. It returns `running`,
`waiting`, `needs-attention` or `complete`, with the reason and next action. It
does not launch arbitrary reviews or grant publication permission. Protected merge
claims persist before writes; recovery observes the PR before retrying. Explicit
pause, revocation, expiry and source/target changes still block new effects.

Release preparation reuses a successful full main Plugin CI receipt for the exact
source/tree. It retains package round-trip, signing/trust and distribution checks.
A known completed Conductor artifact ID avoids repository-wide discovery. Features
share the hash-checked artifact under `.gatereeve-release-receipts`; each separately
establishes inclusion, fresh provider state and completion eligibility. Missing or
expired provider evidence remains unavailable. Retain shared proof while active
work references it; do not delete it as part of one feature's cleanup.

Recognized transport/rate-limit failures retry with backoff and a configurable
elapsed-time budget. Unknown failures, test failures and unexplained trust
rejection require investigation. Retry budgets are not remediation-round caps.

`plugin upgrade` uses native managers, an exact expected package and a persistent
receipt. Resume observes installation before retrying. Package presence, enablement
and activation are distinct. A host without a supported enable operation reports
that limitation. No upgrade operation restarts/switches active sessions. Activation
remains pending until a fresh native session is observed; an install smoke is not
that observation. Desktop updates continue through the supported signed artifact
flow and require separate switch/restart authorization for active sessions.

`run.resume-current` preserves documents/history and records observed unchanged
approvals. Its transition report explains retained versus refresh-required evidence.
It never fabricates execution under the new environment contract. The current
contract replaces the old runtime; no compatibility execution mode is provided.
