# Independent reconcile on 476ace0

Outcome: FAIL

The approved feature maps to implementation and retained pre-merge evidence, and the previous historical/accounting/selector gaps are repaired. P2/P7 and AC7 remain incomplete because desktop inspection of a known current workflow depends on optional measurement. Delivery and installed activation remain separately authorized.

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
      "Mapped P1\u2013P8 and AC1\u2013AC8 to protocol consolidation, evidence qualification, SQLite authority, measurement, fleet snapshots, reporting, adapters and rollout evidence.",
      "Reassessed prior cross-gate failures and the historical-data limitation against current source and newly retained inputs/output.",
      "Checked that optional measurement and replaceable reporting storage do not become authority, and examined their remaining effect on database visibility.",
      "Assessed broad/portable/current verification together without relabeling historical executions as current runs.",
      "Separated implementation readiness from merge, publication, installation and activation."
    ],
    "limitations": [],
    "paths": [
      "requirements/spec.md",
      "requirements/design.md",
      "planning/plan.md",
      "planning/issues.md",
      "planning/tracker.md",
      "planning/scratchpad.md",
      "planning/decisions.md",
      "product/plugin-src/shared/resources/protocol/current/contracts.js",
      "product/plugin-src/shared/resources/protocol/current/core.js",
      "product/plugin-src/shared/resources/protocol/current/execution.js",
      "product/plugin-src/shared/resources/protocol/current/environment.js",
      "product/plugin-src/shared/resources/protocol/current/store.js",
      "product/plugin-src/shared/resources/protocol/current/workflow-database.js",
      "product/plugin-src/shared/resources/protocol/current/adapter.js",
      "product/plugin-src/shared/resources/performance/workflow-projection.js",
      "product/plugin-src/shared/resources/performance/fleet.js",
      "product/plugin-src/shared/resources/performance/report.js",
      "product/plugin-src/shared/resources/performance/analysis.js",
      "product/plugin-src/shared/resources/performance/service.js",
      "product/plugin-src/shared/resources/performance/mcp.js",
      "product/apps/desktop/renderer/metrics-view.js",
      "product/apps/desktop/renderer/current-view.js",
      "product/apps/desktop/test/metrics-view.test.js",
      "product/cli/test/workflow-database.test.js",
      "product/cli/test/fleet-report.test.js"
    ]
  },
  "coverageDecisions": [],
  "criteria": [],
  "dispositions": [
    {
      "evidence": "P5's legacy mapping now preserves workflowId with explicit unknown-run fallback. The retained 303-record normalized input, manifest and output close the former historical-evidence gap; independent in-memory reimport reproduces its totals.",
      "id": "reconcile-historical-provenance-gap",
      "status": "resolved"
    },
    {
      "evidence": "P6 dimensions and overview now share exclusive worker contributions. The nested fixture asserts dimension reconciliation, and independent current-source execution verifies the formerly failing 100 ms/20 ms case.",
      "id": "reconcile-accounting-gap",
      "status": "resolved"
    },
    {
      "evidence": "P7 now includes the previously absent selected-workflow request and a rendered real-SQLite fixture. A separate registration dependency still prevents complete AC7 coverage when measurement is disabled.",
      "id": "reconcile-desktop-inspection-gap",
      "status": "resolved"
    }
  ],
  "featureId": "tb-implementation-efficiency",
  "findings": [
    {
      "blocking": true,
      "classId": "database-discovery-coupled-to-collection",
      "criterion": "R7",
      "evidence": "P2/P7 and AC7 require bounded visibility of known/explicit authoritative stores through desktop. The selector at lines 38\u201346 only exposes reporting_workflows entries returned by fleet.js:200\u2013221. Registration is skipped by workflow-projection.js:11\u201313 when collection is disabled, so a fresh selected workflow's real database cannot be reached. adapter.js:55\u201357 already supplies its independent inspection, but current-view.js ignores that field. The enabled-projection integration fixture establishes the selector repair, not complete visibility under the supported disabled-measurement setting.",
      "id": "reconcile-inspection-requires-measurement",
      "path": "product/apps/desktop/renderer/metrics-view.js"
    }
  ],
  "gate": "reconcile",
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
  "summary": "The approved feature maps to implementation and retained pre-merge evidence, and the previous historical/accounting/selector gaps are repaired. P2/P7 and AC7 remain incomplete because desktop inspection of a known current workflow depends on optional measurement. Delivery and installed activation remain separately authorized."
}
```
