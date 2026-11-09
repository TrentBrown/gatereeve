# Independent spec on 476ace0

Outcome: FAIL

R1–R6 and R8 satisfy the approved pre-merge boundary. R7 fails because disabling measurement prevents desktop inspection of an otherwise known current workflow. The historical evidence gap is closed. Local alternative verification is accepted without claiming hosted Linux, packaged-runtime or installed activation success.

```json
{
  "artifacts": [
    {
      "bytes": 1334,
      "format": "json",
      "hash": "sha256:a6f05a146fbbe809273c06c5f2cb492edce269d2e02c53c9d19954ce16c0fbb5"
    },
    {
      "bytes": 24317,
      "format": "json",
      "hash": "sha256:f530940d2ca729cc5df889f0987d92b9d6022b3eaf910566a4ca4332ba827684"
    }
  ],
  "contract": "gatereeve/current/5",
  "coverage": {
    "complete": true,
    "interactions": [
      "Scored every selected criterion against current source and retained execution output, independently of prior verdicts.",
      "Compared the broad and portable verification snapshots with current source before assessing semantic replacement coverage.",
      "Checked historical input/output reconciliation, fixed dataset behavior and overview/drill-down accounting with in-memory current-source execution.",
      "Verified the desktop selection repair and examined its dependency on optional measurement registration.",
      "Distinguished pre-merge fixture/package evidence from separately authorized release, installation and fresh-session activation."
    ],
    "limitations": [],
    "paths": [
      "requirements/spec.md",
      "requirements/design.md",
      "product/plugin-src/shared/resources/protocol/current/contracts.js",
      "product/plugin-src/shared/resources/protocol/current/core.js",
      "product/plugin-src/shared/resources/protocol/current/execution.js",
      "product/plugin-src/shared/resources/protocol/current/environment.js",
      "product/plugin-src/shared/resources/protocol/current/validation-scope.js",
      "product/plugin-src/shared/resources/protocol/current/store.js",
      "product/plugin-src/shared/resources/protocol/current/workflow-database.js",
      "product/plugin-src/shared/resources/protocol/current/adapter.js",
      "product/plugin-src/shared/resources/performance/observe.js",
      "product/plugin-src/shared/resources/performance/workflow-projection.js",
      "product/plugin-src/shared/resources/performance/fleet.js",
      "product/plugin-src/shared/resources/performance/report.js",
      "product/plugin-src/shared/resources/performance/analysis.js",
      "product/plugin-src/shared/resources/performance/service.js",
      "product/plugin-src/shared/resources/performance/mcp.js",
      "product/plugin-src/shared/resources/policy/WORKFLOW.md",
      "product/cli/src/commands/current.js",
      "product/cli/src/commands/metrics.js",
      "product/cli/test/current-core.test.js",
      "product/cli/test/current-delivery.test.js",
      "product/cli/test/current-environment.test.js",
      "product/cli/test/workflow-database.test.js",
      "product/cli/test/fleet-report.test.js",
      "product/cli/test/performance.test.js",
      "product/cli/test/stage-protocol.test.js",
      "product/apps/desktop/main/ipc.js",
      "product/apps/desktop/renderer/metrics-view.js",
      "product/apps/desktop/renderer/current-view.js",
      "product/apps/desktop/test/metrics-view.test.js",
      "product/.github/workflows/plugin-ci.yml"
    ]
  },
  "coverageDecisions": [
    {
      "evidence": "Accepted as semantic replacement of executed checks, not as proof that every criterion passes. The retained 91beb92 output shows 195 core passes/one skip and 397 CLI passes/two skips, with the sole failure an obsolete --checks error-message assertion. The 7ca3009 runner subsequently completed the affected CLI checks and remaining audit, 29/59/2 Python tests, validation, reproducible packaging and relocation steps. Snapshot comparison shows subsequent changes confined to reporting, desktop inspection/presentation, related labels, tests, staging and reviewer guidance. The current runner binds 49 affected passes, 181 desktop passes and the reviewable 303-record historical import. Current source and staged-resource parity support carrying unchanged broader evidence under its original identity. Hosted Linux/container/runtime and installed activation success are not inferred. The separate R7 behavior failure remains blocking despite accepting this check replacement.",
      "id": "focused-report-repairs-after-broad-core",
      "outcome": "PASS"
    }
  ],
  "criteria": [
    {
      "evidence": "contracts.js defines one required independent review with supplemental named assessments. execution.js:338\u2013351 requires all five responsibility conclusions and every selected criterion, while evaluator qualification rejects inherited/implementer contexts. core.js retains cross-gate blocking-review barriers. PROTOCOL.md and WORKFLOW.md describe agent-selected checks and discretionary model diversity. Retained core shards include consolidated-assessment, qualification and stale-review cases.",
      "id": "R1",
      "outcome": "PASS"
    },
    {
      "evidence": "environment.js records declared configuration/environment and runtime metadata without walking dependency trees; fingerprint-cache.js and workspace-sources.js are removed with their new-path callers. validation-scope.js checks exact candidate CI identity and actual job outcomes or labels an alternative as a proposal. Core/source and authorization/delivery guards remain in place. current-environment.test.js and retained core/delivery output exercise declared-environment changes, source drift, stale proof and authority rejection.",
      "id": "R2",
      "outcome": "PASS"
    },
    {
      "evidence": "workflow-database.js uses versioned per-home SQLite, BEGIN IMMEDIATE transactions, unique operation identities and a prohibition on asynchronous transaction callbacks. store.js atomically records events/history and immutable completed job outcomes. workflow-database.test.js covers replacement instances, isolated homes, conflicting concurrent updates, idempotent retries, process-exit rollback and separate-process competition; these cases appear in the retained broad output. Scoped ignore setup preserves untracked database files.",
      "id": "R3",
      "outcome": "PASS"
    },
    {
      "evidence": "observe.js inherits workflow/public context, while core.js and execution.js record setup, proof and execution spans. workflow-projection.js retains incremental findings/dispositions and explicit notes separately from authority, reporting failures through incomplete-capture health. fleet.js allowlists public observation fields; metrics records omit raw command/environment values. Retained performance fixtures cover projection retry, capture failure, privacy, retention and unknown timing; current affected tests pass.",
      "id": "R4",
      "outcome": "PASS"
    },
    {
      "evidence": "fleet.js:53\u201391 retains versioned fixed membership and rejects duplicate identities and same-time conflicts across historical versions. combineSnapshots preserves source gaps/windows. importLegacySnapshot:123\u2013127 retains known workflowId and labels unknown runs. Current passing fixtures cover fixed/repeated/overlapping/conflicting/missing-source imports and distinct legacy runs. Bound artifact 0854684d89be1302fd4fdb383303d1a90bc3697dfede324b26eacb430bfc08d5 now retains 303 normalized historical inputs, their source manifest and resulting fixed report; independent in-memory reimport reproduced its record count and worker total. Imports do not register workflow authority.",
      "id": "R5",
      "outcome": "PASS"
    },
    {
      "evidence": "fleet.js:129\u2013162 applies shared workerAccounting contributions to project/workflow/check/model/platform dimensions and overview totals. Independent current-source execution reconciled a 100 ms parent containing a 20 ms worker at 100 ms in both overview and project totals. The bound 303-record input independently reproduces 12156626.083617995 ms worker time, with unavailable elapsed placement preserved. Reports expose observations, repetition reasons, outcomes, dimensions and coverage, and render JSON/escaped standalone HTML without an LLM. Current fixtures assert dimension reconciliation and unknown timing.",
      "id": "R6",
      "outcome": "PASS"
    },
    {
      "evidence": "CLI/MCP/desktop delegate report/import/export to service.js; analysis.js binds cited hypotheses to a fixed dataset and preserves factual results on provider failure. The desktop selector repair is verified against real SQLite. However workflow-projection.js:11\u201313 skips discovery registration when collection is disabled, fleet.js:200\u2013221 lists only registered workflows, and metrics-view.js:38\u201346 has no alternative path. The already selected workflow's snapshot.database is unused by current-view.js. Required desktop database visibility therefore depends on enabling optional measurement.",
      "id": "R7",
      "outcome": "FAIL"
    },
    {
      "evidence": "store.js treats legacy activation as preserved provenance, and core.js resume creates fresh current-contract authority only from observed approvals. Missing SQLite returns missing/fresh-run state rather than reconstructing approval. Retained workflow/core fixtures cover legacy byte preservation, damaged history, missing database, explicit resume and isolation. Planning and receipts distinguish package relocation from actual installation/activation, which remain separately authorized obligations.",
      "id": "R8",
      "outcome": "PASS"
    }
  ],
  "dispositions": [
    {
      "evidence": "Shared workerAccounting now supplies dimension contributions and overview totals. Current-source in-memory nested execution reconciles at 100 ms, and the retained affected test adds dimension assertions.",
      "id": "spec-nested-worker-double-count",
      "status": "resolved"
    },
    {
      "evidence": "Legacy import preserves metrics.workflowId instead of substituting featureId. The current fixture checks separate known-run groups and filters; the bound historical output explicitly retains unavailable run identity.",
      "id": "spec-legacy-workflow-identity",
      "status": "resolved"
    },
    {
      "evidence": "Desktop now requests input.workflow through an actual selector, and the bound rendered integration fixture verifies schema/integrity against SQLite. The newly identified disabled-collection discovery condition is tracked separately.",
      "id": "spec-desktop-workflow-inspection",
      "status": "resolved"
    }
  ],
  "featureId": "tb-implementation-efficiency",
  "findings": [
    {
      "blocking": true,
      "classId": "database-discovery-coupled-to-collection",
      "criterion": "R7",
      "evidence": "AC7 requires database visibility through desktop for known/explicit stores. metrics-view.js:38\u201346 only permits inspection of workflows listed by fleet.js:200\u2013221 from reporting_workflows. workflow-projection.js:11\u201313 skips that registration when measurement is disabled. Thus a selected current workflow started with collection disabled cannot be inspected through desktop, although adapter.js:55\u201357 supplies its health independently and CLI database.inspect remains available. current-view.js does not display snapshot.database. The new passing desktop integration fixture explicitly calls projectWorkflow with collection enabled and does not cover this condition.",
      "id": "spec-inspection-requires-measurement",
      "path": "product/apps/desktop/renderer/metrics-view.js"
    }
  ],
  "gate": "spec",
  "historyAssessment": null,
  "input": {
    "bytes": 7352,
    "format": "json",
    "hash": "sha256:f13868fce7777907f67c0a362fa0d2351544aa0855396ed6c4d7f5c0be944a52"
  },
  "kind": "result",
  "mode": "full",
  "outcome": "FAIL",
  "prior": null,
  "priorCandidate": null,
  "receipt": {
    "bytes": 754,
    "format": "json",
    "hash": "sha256:4619eb830d5ddd3067484d59ce951b2ef7f4377dda56e02e998f01b6a6ef2bae"
  },
  "runId": "implementation-efficiency-20261109",
  "summary": "R1\u2013R6 and R8 satisfy the approved pre-merge boundary. R7 fails because disabling measurement prevents desktop inspection of an otherwise known current workflow. The historical evidence gap is closed. Local alternative verification is accepted without claiming hosted Linux, packaged-runtime or installed activation success."
}
```
