# Independent code review — 7ca3009

Outcome: **FAIL**. Actual gpt-6.1-sol/high execution through installed rc.24 adapter with Codex 0.166.0.

Found three supported defects in reporting and desktop database visibility. Reviewed the complete feature change against the pinned base and identical merge target. Prior evaluations were unavailable, not passing reviews. Retained verification supports local fixture behavior; it does not establish hosted CI, installation or activation.

## code-nested-worker-double-count

Criterion: R6; path: `product/plugin-src/shared/resources/performance/fleet.js`.

Lines 129–151 calculate every drill-down group's recordedWorkerMs by summing raw worker durationMs, while overall totals use report.js's exclusive nested accounting. A current-source in-memory reproduction with a 100 ms worker containing a 20 ms worker produced totals.workerMs=100 but projects[0].recordedWorkerMs=120 and checks[0].recordedWorkerMs=120. renderReevaluation labels both quantities as recorded worker time. Project/workflow/check comparisons therefore double-count nested work and do not reconcile to the overview, contrary to AC6. The existing nested fixture checks only overall totals.

## code-legacy-workflow-identity

Criterion: R5; path: `product/plugin-src/shared/resources/performance/fleet.js`.

importLegacySnapshot at lines 122–126 assigns workflow: metrics.featureId and ignores metrics.workflowId. In contrast, captureSnapshot at line 104 preserves workflowId and explicitly labels an unavailable run. Importing two valid normalized historical records with the same featureId and distinct known workflowIds produced one workflow group named with the feature ID; querying either known workflowId returned no observations. Historical workflow provenance is therefore misrepresented and distinct workflows collapse, contrary to AC5's provenance and historical-mapping requirements.

## code-desktop-workflow-inspection

Criterion: R7; path: `product/apps/desktop/renderer/metrics-view.js`.

The sole database control at line 37 always calls action:'databases' without a workflow selection. fleet.js lines 194–198 return workflow schema/size/integrity/state only when input.workflow is supplied; the default response lists only workflow ID/home/issue/project. No desktop control selects a workflow or issues that request. The database field added to currentSnapshot is also unused by renderer/current-view.js. Consequently desktop users cannot inspect workflow database health or state, although CLI --workflow and MCP expose it. This leaves required AC7 database visibility unavailable in the desktop interface.

## Retained structured result

```json
{
  "artifacts": [
    {
      "bytes": 1334,
      "format": "json",
      "hash": "sha256:5d90aa3d2d6accc66d9c411bd10d4e1ca629b37dd7741f95e769391a37d04387"
    },
    {
      "bytes": 24833,
      "format": "json",
      "hash": "sha256:9df6408480759871e32f5e34be0b463d357faab3eb48cb45769aecb9e0df993f"
    }
  ],
  "contract": "gatereeve/current/5",
  "coverage": {
    "complete": true,
    "interactions": [
      "Reviewed all 73 added, modified and deleted paths, including removal of fingerprint modules and their callers.",
      "Checked SQLite persistence, activation, concurrent updates, job reconciliation, authority, evidence applicability and protected delivery interactions.",
      "Checked snapshot import, fixed dataset membership, historical mapping, accounting, optional analysis and CLI/MCP/desktop adapters.",
      "Verified changed desktop resource copies match canonical source bytes and the desktop projection manifest matches staged protocol files.",
      "Compared the retained 91beb92 snapshot with 7ca3009 and assessed the changed reporting and desktop interactions against replacement receipts.",
      "Confirmed target source matches base source; retained metadata shows no special Git entries or existing-file mode changes.",
      "Executed filesystem-free reproductions using current source and an in-memory SQLite database for nested accounting and legacy workflow mapping."
    ],
    "limitations": [],
    "paths": [
      "product/.gitignore",
      "product/apps/desktop/main/ipc.js",
      "product/apps/desktop/renderer/metrics-view.js",
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
      "product/plugin-src/shared/resources/protocol/current/workspace-sources.js",
      "product/apps/desktop/renderer/current-view.js",
      "product/plugin-src/shared/resources/protocol/current/evidence.js",
      "product/plugin-src/shared/resources/protocol/current/delivery.js",
      "product/.github/workflows/plugin-ci.yml"
    ]
  },
  "coverageDecisions": [],
  "criteria": [],
  "dispositions": [],
  "featureId": "tb-implementation-efficiency",
  "findings": [
    {
      "blocking": true,
      "classId": "report-group-nested-double-count",
      "criterion": "R6",
      "evidence": "Lines 129\u2013151 calculate every drill-down group's recordedWorkerMs by summing raw worker durationMs, while overall totals use report.js's exclusive nested accounting. A current-source in-memory reproduction with a 100 ms worker containing a 20 ms worker produced totals.workerMs=100 but projects[0].recordedWorkerMs=120 and checks[0].recordedWorkerMs=120. renderReevaluation labels both quantities as recorded worker time. Project/workflow/check comparisons therefore double-count nested work and do not reconcile to the overview, contrary to AC6. The existing nested fixture checks only overall totals.",
      "id": "code-nested-worker-double-count",
      "path": "product/plugin-src/shared/resources/performance/fleet.js"
    },
    {
      "blocking": true,
      "classId": "legacy-workflow-identity-collapse",
      "criterion": "R5",
      "evidence": "importLegacySnapshot at lines 122\u2013126 assigns workflow: metrics.featureId and ignores metrics.workflowId. In contrast, captureSnapshot at line 104 preserves workflowId and explicitly labels an unavailable run. Importing two valid normalized historical records with the same featureId and distinct known workflowIds produced one workflow group named with the feature ID; querying either known workflowId returned no observations. Historical workflow provenance is therefore misrepresented and distinct workflows collapse, contrary to AC5's provenance and historical-mapping requirements.",
      "id": "code-legacy-workflow-identity",
      "path": "product/plugin-src/shared/resources/performance/fleet.js"
    },
    {
      "blocking": true,
      "classId": "desktop-workflow-health-unreachable",
      "criterion": "R7",
      "evidence": "The sole database control at line 37 always calls action:'databases' without a workflow selection. fleet.js lines 194\u2013198 return workflow schema/size/integrity/state only when input.workflow is supplied; the default response lists only workflow ID/home/issue/project. No desktop control selects a workflow or issues that request. The database field added to currentSnapshot is also unused by renderer/current-view.js. Consequently desktop users cannot inspect workflow database health or state, although CLI --workflow and MCP expose it. This leaves required AC7 database visibility unavailable in the desktop interface.",
      "id": "code-desktop-workflow-inspection",
      "path": "product/apps/desktop/renderer/metrics-view.js"
    }
  ],
  "gate": "code",
  "historyAssessment": null,
  "input": {
    "bytes": 3021,
    "format": "json",
    "hash": "sha256:01edd2f57babe27b756575543ca7b5596efd6fd7037a7c0f7b2480f023879c1a"
  },
  "kind": "result",
  "mode": "full",
  "outcome": "FAIL",
  "prior": null,
  "priorCandidate": null,
  "receipt": {
    "bytes": 754,
    "format": "json",
    "hash": "sha256:607e9e3259ccd666bfcd2c11e9fc61c43a17a17f98dfb710b838b5fd5ba7344d"
  },
  "runId": "implementation-efficiency-20261109",
  "summary": "Found three supported defects in reporting and desktop database visibility. Reviewed the complete feature change against the pinned base and identical merge target. Prior evaluations were unavailable, not passing reviews. Retained verification supports local fixture behavior; it does not establish hosted CI, installation or activation."
}
```
