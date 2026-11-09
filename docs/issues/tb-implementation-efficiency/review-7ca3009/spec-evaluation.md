# Independent spec review — 7ca3009

Outcome: **FAIL**. Actual gpt-6.1-sol/high execution through installed rc.24 adapter with Codex 0.166.0.

R1–R4 and R8 are supported at the approved pre-merge boundary. R5–R7 fail on current behavior. The claimed 303-record historical import is not bound as reviewable evidence. The targeted verification replacement is justified for the checks it replaces; that does not establish complete acceptance.

## spec-nested-worker-double-count

Criterion: R6; path: `product/plugin-src/shared/resources/performance/fleet.js`.

group() lines 129–137 sums inclusive durationMs, whereas reevaluationReport lines 146–151 obtains exclusive overall worker totals from report.js. Current-source reproduction yields 100 ms overall versus 120 ms in project/check drill-downs for a 100 ms worker containing a 20 ms worker. This violates AC6's tested overlap accounting and reconciliation requirement despite the passing overall-total fixture.

## spec-legacy-workflow-identity

Criterion: R5; path: `product/plugin-src/shared/resources/performance/fleet.js`.

importLegacySnapshot lines 124–125 replaces the observation's workflow identity with metrics.featureId, discarding a known metrics.workflowId. A valid two-record historical-format reproduction with one feature and two workflows returns one workflow group and zero observations when filtering by either recorded workflow ID. AC5 requires preserved historical provenance and honest mapping gaps.

## spec-desktop-workflow-inspection

Criterion: R7; path: `product/apps/desktop/renderer/metrics-view.js`.

Line 37 exposes only the unselected database listing. Shared fleet.js returns workflow health/schema/size/state only for a selected input.workflow, but desktop provides no selection/request path and current-view.js does not render snapshot.database. The desktop therefore lacks required workflow database visibility available through CLI/MCP.

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
    "complete": false,
    "interactions": [
      "Scored each selected criterion against current implementation, retained execution receipts and applicable test source.",
      "Compared old and replacement verification snapshots; distinguished historical execution from head execution.",
      "Assessed shared accounting, historical identity preservation and desktop database visibility independently of passing test counts.",
      "Checked staged resource parity and pre-merge versus separately authorized release/install/activation boundaries."
    ],
    "limitations": [
      "The supplied evidence does not retain the claimed 303-record rc.23 export, its imported dataset or its reconciliation output. Required supplied-historical-export validation for AC5/AC6 therefore remains unverified; fleet-report.test.js contains no legacy-import case."
    ],
    "paths": [
      "requirements/spec.md",
      "requirements/design.md",
      "product/plugin-src/shared/resources/protocol/current/contracts.js",
      "product/plugin-src/shared/resources/protocol/current/execution.js",
      "product/plugin-src/shared/resources/protocol/current/core.js",
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
      "product/apps/desktop/main/ipc.js",
      "product/apps/desktop/renderer/metrics-view.js",
      "product/apps/desktop/renderer/current-view.js",
      "product/apps/desktop/test/metrics-view.test.js",
      "product/.github/workflows/plugin-ci.yml"
    ]
  },
  "coverageDecisions": [
    {
      "evidence": "Independently compared retained 91beb92 source with 7ca3009: changes are confined to fleet canonical ordering/historical conflict checks, desktop diagnostic/report-frame fixes and associated tests. Core/SQLite/delivery implementations and their tests are unchanged. Broad output retains 195 core passes/one skip and 397 outer passes/two skips with the sole obsolete retired-message assertion failure. The head assertion now matches the approved removal of external-runtime declarations; head receipts rerun all affected CLI/fleet/performance/staging cases (47 passes), execute previously unreached portable steps and rerun all 180 desktop tests. This justifies the targeted replacement without relabeling old execution or erasing failure. It establishes neither hosted Linux/package/activation coverage nor the missing historical-sample reconciliation, and does not overcome the identified product defects.",
      "id": "targeted-followup-after-broad-91beb92",
      "outcome": "PASS"
    }
  ],
  "criteria": [
    {
      "evidence": "contracts.js makes review the required independent assessment and named additional reviews supplemental. execution.js requires five responsibility conclusions, every selected criterion, actual consumed verification and a fresh non-implementer receipt. WORKFLOW.md maps responsibilities and gives discretionary test-pyramid/model-diversity guidance. Unchanged current-core/current-delivery suites in retained 91beb92 execution exercise consolidated acceptance and rejection, including inherited contexts; head staging and desktop receipts support package parity. Skipped live-provider checks are not represented as executed.",
      "id": "R1",
      "outcome": "PASS"
    },
    {
      "evidence": "environment.js now records configuration, declared environment and runtime metadata without enumerating dependency/external trees; fingerprint-cache.js and workspace-sources.js are removed from new paths and inventories. validation-scope.js checks exact CI head and executed required jobs or retains an explicit alternative proposal. Source/configuration drift, late-result retention, approval and protected-delivery fixtures are present in unchanged core/delivery code and retained broad results. The declared-context assurance explicitly disclaims installed-state equality.",
      "id": "R2",
      "outcome": "PASS"
    },
    {
      "evidence": "workflow-database.js uses one per-home SQLite database with short synchronous IMMEDIATE transactions, schema/contract checks and no awaited external work. store.js atomically persists ordered events/history, operation retries and immutable job outcomes. workflow-database.test.js covers independent stores/instances, process competition, interruption rollback, duplicate operations and missing databases; retained broad output records these cases passing. Structured participant, decision, assessment, finding and disposition records remain queryable.",
      "id": "R3",
      "outcome": "PASS"
    },
    {
      "evidence": "observe.js propagates parent/workflow/display context; core/execution measure preparation, qualification and execution and expose bounded workflow observations. workflow-projection.js publishes incrementally in a transaction and marks capture incomplete on failure without changing authority. Default reporting uses allowlisted observations; raw arguments/environment/logs are excluded. Unknown timing remains null, and cleanup touches reporting tables rather than authoritative workflow stores. Current receipt d67741c5\u2026 and output baa5f7ff\u2026 record 47 passing focused cases, including privacy, projection idempotence and unknown-timing behavior.",
      "id": "R4",
      "outcome": "PASS"
    },
    {
      "evidence": "Versioned fixed membership, repeated/overlapping import rejection and missing-source fixtures are supported, including the head correction checking all historical same-time versions. However fleet.js:124\u2013125 maps historical workflow identity to featureId and loses known workflowId; a current-source in-memory reproduction collapses two workflows and breaks their filters. The claimed supplied 303-record historical import additionally lacks retained input/output evidence.",
      "id": "R5",
      "outcome": "FAIL"
    },
    {
      "evidence": "The factual JSON/HTML report requires no model and exposes observations, reasons, coverage and dimensions. Nevertheless fleet.js:136 sums inclusive durations for every group while the overview uses exclusive accounting. Reproduced 100 ms overview versus 120 ms project/check totals violates required reconciliation and nested accounting. Existing tests assert overall totals without asserting drill-down agreement; supplied-historical reconciliation is also unverified.",
      "id": "R6",
      "outcome": "FAIL"
    },
    {
      "evidence": "CLI, MCP and desktop IPC delegate report/import/export/analysis to shared service.js, and analysis.js validates fixed-dataset citations and provider provenance while preserving factual results on failure. Inspection uses bounded known paths and reset remains explicitly unsupported. However desktop metrics-view.js:37 never selects a workflow, so fleet.js:194\u2013196 workflow health inspection is unreachable through the UI. The newly supplied snapshot.database is not displayed by current-view.js. Passing desktop tests use a mock API and do not exercise this missing capability.",
      "id": "R7",
      "outcome": "FAIL"
    },
    {
      "evidence": "store.js preserves legacy activation files as provenance and does not replay legacy events. core.resume requires observed planning instructions and fresh-contract evidence; database loss grants no approvals. Retained core/SQLite fixtures cover byte preservation, explicit resume, interruption and missing-database behavior. Planning authority expressly excludes merge/publication/install/deployment. Head portable packaging/relocation receipts are controlled pre-merge checks, not evidence of shipped installation or actual session activation.",
      "id": "R8",
      "outcome": "PASS"
    }
  ],
  "dispositions": [],
  "featureId": "tb-implementation-efficiency",
  "findings": [
    {
      "blocking": true,
      "classId": "report-group-nested-double-count",
      "criterion": "R6",
      "evidence": "group() lines 129\u2013137 sums inclusive durationMs, whereas reevaluationReport lines 146\u2013151 obtains exclusive overall worker totals from report.js. Current-source reproduction yields 100 ms overall versus 120 ms in project/check drill-downs for a 100 ms worker containing a 20 ms worker. This violates AC6's tested overlap accounting and reconciliation requirement despite the passing overall-total fixture.",
      "id": "spec-nested-worker-double-count",
      "path": "product/plugin-src/shared/resources/performance/fleet.js"
    },
    {
      "blocking": true,
      "classId": "legacy-workflow-identity-collapse",
      "criterion": "R5",
      "evidence": "importLegacySnapshot lines 124\u2013125 replaces the observation's workflow identity with metrics.featureId, discarding a known metrics.workflowId. A valid two-record historical-format reproduction with one feature and two workflows returns one workflow group and zero observations when filtering by either recorded workflow ID. AC5 requires preserved historical provenance and honest mapping gaps.",
      "id": "spec-legacy-workflow-identity",
      "path": "product/plugin-src/shared/resources/performance/fleet.js"
    },
    {
      "blocking": true,
      "classId": "desktop-workflow-health-unreachable",
      "criterion": "R7",
      "evidence": "Line 37 exposes only the unselected database listing. Shared fleet.js returns workflow health/schema/size/state only for a selected input.workflow, but desktop provides no selection/request path and current-view.js does not render snapshot.database. The desktop therefore lacks required workflow database visibility available through CLI/MCP.",
      "id": "spec-desktop-workflow-inspection",
      "path": "product/apps/desktop/renderer/metrics-view.js"
    }
  ],
  "gate": "spec",
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
  "summary": "R1\u2013R4 and R8 are supported at the approved pre-merge boundary. R5\u2013R7 fail on current behavior. The claimed 303-record historical import is not bound as reviewable evidence. The targeted verification replacement is justified for the checks it replaces; that does not establish complete acceptance."
}
```
