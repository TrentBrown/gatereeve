# Independent code on 476ace0

Outcome: FAIL

The three reported defects are repaired. A further R7 defect remains: desktop database inspection cannot reach a current workflow created while measurement is disabled. Hosted Linux, packaged-runtime and installed activation results are not claimed.

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
      "Compared all 73 base/head content changes, including deleted fingerprint/workspace helpers and their callers. The pinned target equals the base; retained metadata shows no mode changes or special entries.",
      "Examined SQLite persistence, transaction boundaries, retry/concurrency handling, resumption, independent assessment qualification, evidence replacement and protected-delivery callers.",
      "Checked reporting projection, snapshot provenance/versioning, source-window combination, accounting, optional analysis and CLI/MCP/desktop adapters.",
      "Compared all 50 canonical protocol/performance files with desktop staged copies; their bytes agree.",
      "Independently reproduced repaired nested accounting in memory: a 100 ms parent containing a 20 ms child produces 100 ms overall and project totals.",
      "Reimported the retained 303 historical inputs into an in-memory reporting database; the resulting 12156626.083617995 ms worker total matches the bound report.",
      "Traced disabled collection through workflow registration, database inventory, desktop selection and the unused current snapshot database field."
    ],
    "limitations": [],
    "paths": [
      "product/.gitignore",
      "product/apps/desktop/main/ipc.js",
      "product/apps/desktop/renderer/metrics-view.js",
      "product/apps/desktop/renderer/current-view.js",
      "product/apps/desktop/renderer/presentation.js",
      "product/apps/desktop/resources/desktop-projection.json",
      "product/apps/desktop/resources/performance/analysis.js",
      "product/apps/desktop/resources/performance/fleet.js",
      "product/apps/desktop/resources/performance/mcp.js",
      "product/apps/desktop/resources/performance/observe.js",
      "product/apps/desktop/resources/performance/report.js",
      "product/apps/desktop/resources/performance/service.js",
      "product/apps/desktop/resources/performance/store.js",
      "product/apps/desktop/resources/performance/workflow-projection.js",
      "product/apps/desktop/resources/protocol/current/actions.js",
      "product/apps/desktop/resources/protocol/current/adapter.js",
      "product/apps/desktop/resources/protocol/current/authorization.js",
      "product/apps/desktop/resources/protocol/current/contracts.js",
      "product/apps/desktop/resources/protocol/current/core.js",
      "product/apps/desktop/resources/protocol/current/coverage.js",
      "product/apps/desktop/resources/protocol/current/environment.js",
      "product/apps/desktop/resources/protocol/current/execution.js",
      "product/apps/desktop/resources/protocol/current/fingerprint-cache.js",
      "product/apps/desktop/resources/protocol/current/store.js",
      "product/apps/desktop/resources/protocol/current/validation-scope.js",
      "product/apps/desktop/resources/protocol/current/workflow-database.js",
      "product/apps/desktop/resources/protocol/current/workspace-sources.js",
      "product/apps/desktop/test/current-view.test.js",
      "product/apps/desktop/test/metrics-view.test.js",
      "product/apps/desktop/test/presentation.test.js",
      "product/apps/desktop/test/protocol-adapter.test.js",
      "product/apps/desktop/test/renderer-integration.test.js",
      "product/cli/src/commands/current.js",
      "product/cli/src/commands/metrics.js",
      "product/cli/src/performance.js",
      "product/cli/test/current-cli.test.js",
      "product/cli/test/current-core.test.js",
      "product/cli/test/current-delivery.test.js",
      "product/cli/test/current-environment.test.js",
      "product/cli/test/current-scaling.test.js",
      "product/cli/test/fleet-report.test.js",
      "product/cli/test/performance.test.js",
      "product/cli/test/stage-protocol.test.js",
      "product/cli/test/workflow-database.test.js",
      "product/plugin-src/contracts/workflow-inventory.json",
      "product/plugin-src/shared/resources/DELIVERY-EXECUTION.md",
      "product/plugin-src/shared/resources/PERFORMANCE.md",
      "product/plugin-src/shared/resources/PROTOCOL.md",
      "product/plugin-src/shared/resources/commands/judge.md",
      "product/plugin-src/shared/resources/commands/pr-boundary.md",
      "product/plugin-src/shared/resources/commands/pr-review.md",
      "product/plugin-src/shared/resources/commands/spec-evaluate.md",
      "product/plugin-src/shared/resources/performance/analysis.js",
      "product/plugin-src/shared/resources/performance/fleet.js",
      "product/plugin-src/shared/resources/performance/mcp.js",
      "product/plugin-src/shared/resources/performance/observe.js",
      "product/plugin-src/shared/resources/performance/report.js",
      "product/plugin-src/shared/resources/performance/service.js",
      "product/plugin-src/shared/resources/performance/store.js",
      "product/plugin-src/shared/resources/performance/workflow-projection.js",
      "product/plugin-src/shared/resources/policy/WORKFLOW.md",
      "product/plugin-src/shared/resources/protocol/current/actions.js",
      "product/plugin-src/shared/resources/protocol/current/adapter.js",
      "product/plugin-src/shared/resources/protocol/current/authorization.js",
      "product/plugin-src/shared/resources/protocol/current/contracts.js",
      "product/plugin-src/shared/resources/protocol/current/core.js",
      "product/plugin-src/shared/resources/protocol/current/coverage.js",
      "product/plugin-src/shared/resources/protocol/current/environment.js",
      "product/plugin-src/shared/resources/protocol/current/execution.js",
      "product/plugin-src/shared/resources/protocol/current/fingerprint-cache.js",
      "product/plugin-src/shared/resources/protocol/current/store.js",
      "product/plugin-src/shared/resources/protocol/current/validation-scope.js",
      "product/plugin-src/shared/resources/protocol/current/workflow-database.js",
      "product/plugin-src/shared/resources/protocol/current/workspace-sources.js"
    ]
  },
  "coverageDecisions": [],
  "criteria": [],
  "dispositions": [
    {
      "evidence": "fleet.js:129\u2013162 now supplies each dimension with the same workerAccounting contributions used by report.js. The independent in-memory nested case reconciles at 100 ms, and fleet-report.test.js asserts agreement across dimensions.",
      "id": "code-nested-worker-double-count",
      "status": "resolved"
    },
    {
      "evidence": "fleet.js:123\u2013127 preserves metrics.workflowId and explicitly labels missing runs. The retained passing legacy-import fixture distinguishes two known runs under one feature and checks their filters.",
      "id": "code-legacy-workflow-identity",
      "status": "resolved"
    },
    {
      "evidence": "metrics-view.js:37\u201346 adds the formerly absent workflow selector and selected-workflow request. The bound desktop run passes a rendered interaction against real SQLite health/schema data. The separate failure to discover workflows when collection is disabled is reported in code-inspection-requires-measurement.",
      "id": "code-desktop-workflow-inspection",
      "status": "resolved"
    }
  ],
  "featureId": "tb-implementation-efficiency",
  "findings": [
    {
      "blocking": true,
      "classId": "database-discovery-coupled-to-collection",
      "criterion": "R7",
      "evidence": "Lines 38\u201346 populate the workflow selector exclusively from metricsRequest('databases') and refuse inspection without a returned ID. performance/fleet.js:200\u2013221 obtains those IDs exclusively from reporting_workflows. However performance/workflow-projection.js:11\u201313 returns before registering a workflow when GATEREEVE_METRICS=off or settings.enabled=false. Consequently a fresh workflow created with collection disabled has an authoritative database but no selectable desktop inspection path. protocol/current/adapter.js:55\u201357 already supplies the selected workflow's database inspection independently of collection, but renderer/current-view.js never renders it. A controlled current-source probe confirmed disabled collection skips authoritative-state reads and registration and yields an empty inventory. AC7 requires visibility for known/explicit stores; the already selected current workflow must remain inspectable.",
      "id": "code-inspection-requires-measurement",
      "path": "product/apps/desktop/renderer/metrics-view.js"
    }
  ],
  "gate": "code",
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
  "summary": "The three reported defects are repaired. A further R7 defect remains: desktop database inspection cannot reach a current workflow created while measurement is disabled. Hosted Linux, packaged-runtime and installed activation results are not claimed."
}
```
