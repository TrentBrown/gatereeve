# Design - tb-implementation-efficiency

**Status:** approved — human design approval 2026-11-09

## Problem

GateReeve's implementation and acceptance phases incur repeated broad validation, overlapping independent assessments, costly runtime-environment qualification and insufficiently explained elapsed time. Agents and users lack a concise view of whether those costs improve correctness or merely repeat work. Interview, design, specification and planning are useful and should retain their current intent.

The supplied rc.23 snapshot illustrates repetition and substantial unattributed operation time, but does not prove that every rerun was redundant or that every late finding was missed earlier. Its presumed MyLifeMap identity is unconfirmed. Current source contains rc.24 fingerprint-cache and SQLite metrics improvements; the older snapshot is not a current performance baseline. The local source report, docs/RUN-SCALING.md, also identifies remaining source-view and historical-finding qualification costs. Those are investigation targets, not approved speculative rewrites.

## Intent

Optimize time to trustworthy completion with bounded model usage, while preserving human authority, actual evidence and visibility into quality. Prefer a small deterministic acceptance core with agent judgment over implementation order, check selection, review strategy and remediation.

Use the test pyramid as guidance: frequent inexpensive focused feedback and selective broader validation. It imposes no mandatory ordering, test ratios or reviewer quotas. The agent may broaden, parallelize or repeat work when warranted.

Make structured workflow history useful as agent memory and as the primary evidence source for periodic cross-project reevaluation. Deliver the first report in this effort, including fleet snapshots, so the collection model is exercised by actual reporting needs.

## Chosen shape

### 1. One issue, branch, worktree and workflow

One issue has one topic branch, one worktree and one authoritative workflow database. Put the database alongside the canonical workflow records inside that worktree, outside source control. Chat threads are participants, not workflow identity: a replacement thread or reviewer can work on the same workflow. Multiple review rounds and validation attempts remain inside that record.

Avoid mandatory workflows spanning delivery branches. Preserve existing multi-branch historical records without requiring their conversion. Related future work can use separate issues with references. Stable project/issue/workflow/execution identities must not depend solely on absolute paths or a host thread ID. Provider thread identities remain provenance when available.

Do not add a new global-data database without a concrete need. Shared configuration/discovery can remain small; known locations and explicit paths are sufficient initially, without recursive filesystem discovery.

### 2. Agent-led implementation and consolidated acceptance review

The implementing agent chooses focused checks, review timing, concurrency and remediation. Self-review remains ordinary implementation work. Early independent review is encouraged for consequential design or interaction risks; it is not a gate on every edit.

Replace the mandatory separate independent code/spec and Judge executions with one fresh independent acceptance assessment. It must address:

- correctness, security-relevant defects, regressions and interactions in the actual change;
- every applicable approved acceptance criterion;
- whether test/runtime evidence is sufficient, including untested required behavior;
- material scope drift, contradictory requirements or unsupported completion claims;
- relevant prior findings, claimed corrections and remaining limitations.

These are distinct conclusions, not separate mandatory model calls. Include reconciliation and material decision assessment within this evaluation where needed rather than adding redundant review ceremonies. Agents may request further specialist or model-diverse assessments. Existing project-specific obligations must be inventoried and mapped to the consolidated responsibilities or appropriate checks; none should disappear silently because a gate name is removed.

Inputs include exact source/base/target context, approved design/spec/criteria, relevant planning and decisions, actual validation results, and bounded prior findings and labeled claims. The plan provides context rather than an inflexible implementation prescription. Do not inherit the implementer's raw conversation. Keep uncertainty and missing evidence visible. A fresh evaluator may use the same model family; diversity is strongly encouraged when useful, not required.

Use canonical guidance shared across interfaces and surface it at review decisions. Guidance should encourage different model families for consequential changes, cross-component interactions, unfamiliar areas, uncertainty and repeated missed findings. Capture reviewer strategy and brief rationale during ordinary work without an extra approval, form or LLM call.

### 3. Replace runtime fingerprints with a smaller evidence contract

Remove recursive runtime/dependency-tree fingerprinting, per-file fingerprint caching, runtime-tree manifests and their qualification dependencies. Do not replace them with a growing list of package-manager exclusions. Retain inexpensive source/document/artifact identity where it has a direct integrity or authority purpose; this is not removal of every hash.

A check result records the source revision or explicitly described local working state it actually tested, its selected scope/configuration, execution context, outcome and supporting artifact references. It does not establish that a mutable machine remains unchanged later. Useful toolchain/manifest identifiers may be recorded as metadata without walking installed dependencies.

Broad applicable CI on the acceptance candidate is the normal backstop. Verify actual project CI coverage and its source identity rather than treating a green badge as complete behavioral proof. Work lacking that backstop needs an explicit alternative validation scope assessed independently, not a silent assumption of equivalent CI.

Source changes retain old results as history. A past result must not be relabeled as a new execution. The agent may carry forward relevant reasoning and earlier evidence, but the independent assessment must address changed scope and interactions; acceptance CI must apply to the current candidate. Running jobs and late results retain their original candidate identity and cannot overwrite newer findings or approvals.

The deterministic core records actual outcomes and decisions, checks required acceptance evidence and unresolved blockers, and enforces explicit human authority for implementation, acceptance and merge/deployment as applicable. It does not prescribe implementation-time command order or demand that every small correction repeat every previous validator. Existing branch-direction and PR-closure preferences remain in force.

### 4. SQLite as structured workflow memory

Use one local authoritative SQLite database per workflow. Replace the independently authoritative file-journal role for new runs rather than keeping two editable authorities. Large logs, source and documents may remain files/Git objects with references; SQLite need not contain every artifact byte.

Logical record groups, to be specified without unnecessary schema generality:

| Records | Purpose |
|---|---|
| Workflow and participants | Issue/branch/worktree association, run identity, workflow version, originating threads/models |
| Executions and observations | Check/review scope, source/configuration, times, outcomes, parent relations, reasons and evidence references |
| Findings and dispositions | Stable finding identity, evidence, severity, status, origin and supported resolution |
| Corrections and relationships | Link findings to changes, regression checks, review outcomes and subsequent defects |
| Assessments and coverage | Requirements considered, selected strategy, conclusions, omitted scope and uncertainties |
| Human decisions | Actual instructions and their scope/provenance; changed or superseded decisions stay distinguishable |
| Friction and outcome observations | Rerun causes, late discoveries, escaped defects when linked, user/agent notes |
| Evidence references | Typed references to available artifacts and potentially future transcripts, with availability and provenance |

Facts, human instructions, model judgments and analytical hypotheses must remain distinguishable. Identical findings may be linked or classified by an agent; semantic equivalence is not established by a string/hash match. Unsupported defect provenance remains unknown.

Use short transactional operations. Do not hold a transaction during tests or model execution. Record execution identity so retries and concurrent completions do not duplicate or silently overwrite work. This protects factual history without becoming a distributed workflow scheduler.

Database loss may be handled by starting a new workflow run with the history gap visible. Preserve surviving source and documents; do not assume lost approvals or successful outcomes. No external recovery journal, automatic backup system, lossless reconstruction or fleet database coordination is required initially.

### 5. Shared measurement and reporting

Keep the user-local metrics database separate from authoritative per-workflow data. Its retention/cap cleanup must never evict workflow approvals or active findings. Publish derived reporting observations with source identities into the shared store. Metrics projection failure is visible but must not falsely change a successful check into failure or create acceptance authority. Define projection/reimport identity so retried publishing does not duplicate totals.

Capture useful labels by default: project, issue, branch, check, model/provider and platform when known. Exclude raw command arguments, environment values and full logs from default reporting exports. Preserve unmapped historical identifiers as unknown; do not invent labels.

Measure lead time, observed execution intervals, aggregate effort, setup overhead, observed waits, review/correction cycles, repeat reasons and quality outcomes. Deduplicate nested observations and account for overlap. Unknown waiting time is not human delay, elapsed time is not CPU time or billed cost, and check repetition alone does not establish waste. Capture method and missing coverage must be reportable. Do not require exhaustive chat capture to claim a complete denominator; make coverage limitations explicit.

Associate observations with workflow/policy versions and reviewer strategies so comparisons can separate changed process from changed projects or environments. Report sample sizes and missing outcomes; do not infer quality from raw finding counts or claim causal speedups from unmatched runs.

### 6. Fleet snapshots and reevaluation

Include local, Playpen, AWS and UpCloud reporting observations through exports/imports. Reports use a fixed imported dataset; they do not synchronize live workflow databases or import human authority. Keep per-source identity, collection time, covered period and provenance. Idempotent reimport must not double-count overlapping snapshots. Unavailable platforms and stale snapshots remain explicit.

The first report answers: where time went; what repeated and why; what caught defects; what was found late or after acceptance; whether completion time and quality appear to be improving; and what remains unobserved. Provide all-project overview with project and workflow drill-downs, plus useful dimensions such as platform, validator and reviewer strategy. Keep the top level concise and link to details.

Two layers share the same reporting facts:

1. Deterministic calculations and renderings available without an LLM call.
2. Explicitly requested agent analysis citing records, distinguishing hypotheses from observations, and proposing improvements without applying them.

Present consistent report content through CLI, MCP and desktop, with exportable structured data and a human-readable HTML report. All collection/import/query/calculation logic belongs to shared code; interfaces are adapters and presentation. No scheduled report or automatic policy optimization is implied.

### 7. Database visibility and bounded management

Expose shared operations for known database locations, purpose, issue/worktree association, state, schema, size, recent activity and health. Reporting-source views show included platforms, coverage and collection dates. Keep inspection free from hidden migrations, cleanup or expensive recursive scans.

Reuse metrics configuration and cleanup where practical. Add a narrowly scoped fresh-state operation for an explicitly selected inactive workflow only if straightforward, preserving code and documents. Defer complex active-run reset, cascading deletion, bulk administration and restoration machinery. No arbitrary SQL-editing interface is required.

### 8. Rollout

New workflows adopt the new contract. Existing workflows and active sessions remain intact until explicitly resumed. Resumption preserves unchanged approved planning using observed human authority and retains old runtime files as history. Obtain fresh evidence when required by the changed acceptance contract; do not replay old journals into authority or restart settled planning automatically.

Historical telemetry can be imported as historical observations with its original limits. Its availability does not imply old proof satisfies current acceptance.

## Alternatives considered

- Optimize or add exclusions to runtime fingerprints: rejected as the preferred direction; it preserves expensive environment modeling and tool-specific policy.
- One shared workflow database across all projects: rejected for initial scope; per-workflow isolation is simpler and limits contention/accidental cross-workflow updates.
- One database per chat thread: rejected as identity; threads can be replaced and reviewers participate in the same workflow.
- SQLite as only an index over an authoritative file journal: rejected; SQLite is authoritative for new structured workflow state.
- Lossless recovery and synchronized fleet databases: deferred; restart after loss and report snapshots satisfy initial needs.
- Mandatory separate Judge or multi-model council: replaced by consolidated independent responsibilities and discretionary additional review. This accepts the risk of losing a second mandatory perspective.
- Full transcript ingestion: deferred; typed references leave a future extension point.
- Report-only metrics with no outcome history: insufficient; speed must be interpreted alongside findings, corrections and quality limits.

## Constraints

- This is design only. No approved specification, implementation plan, implementation, merge, publication or deployment authority is recorded.
- Preserve the initial interview/design/spec/planning backbone and all existing source, documents and historical runtime files.
- Keep the scope bounded: no distributed database, live synchronization, T3-session migration, transcript archive, autonomous policy mutation or elaborate reset/cleanup subsystem.
- Cross-machine report imports are in scope; cross-machine active-workflow migration is not.
- Keep metrics advisory. A report, model assertion or missing record cannot grant acceptance or approval.
- Honor existing user authority without repeatedly requesting unchanged decisions. Keep actual evidence and uncertainty visible.

## Open risks

1. **Baseline completeness:** the rc.23 sample does not measure the current system. Fresh fleet inventory, actual CI configuration and review/fix histories remain to be collected. UpCloud linking failed twice. Verify available evidence before attributing savings or generalizing the workflow across projects.
2. **Review consolidation:** one reviewer may miss defects or underweight criteria that a second focused evaluation would catch. Explicit responsibilities and discretionary additional review mitigate but do not eliminate this; reevaluation must track it.
3. **Environment changes:** removing runtime fingerprints gives up comprehensive local installed-input equality checks. CI/environment provenance and fresh evidence must be adequate for each project's acceptance needs.
4. **Telemetry overhead and blind spots:** instrument shared execution paths, use existing receipts/imports and bounded records. Distinguish unobserved intervals rather than inferring complete coverage. Collection must not recreate a new bookkeeping bottleneck.
5. **Storage boundaries:** database references do not make external artifacts durable. Worktree deletion can remove workflow detail; shared summaries must disclose inaccessible drill-down evidence. Exact retention, schema versions and minimal reset semantics need specification.
6. **Async correctness:** late checks/reviews and interrupted writes must not produce false current acceptance, even with a simpler persistence model.
7. **Compatibility:** current modules and active-run semantics need a concrete mapping to the new acceptance responsibilities. Preserve historical runs without silently weakening project-specific obligations.
8. **Imported identity:** existing per-store opaque IDs may not identify the same project across hosts. New stable provenance and supported historical mappings are needed; unknown mappings remain visible.

## Changes

Initial synthesis from interview decisions D1–D25.

2026-11-09: User approved the presented design with “Approved”. Only status metadata changed at this boundary; the substantive design remains as presented. Later scope changes require an explicit amendment.
