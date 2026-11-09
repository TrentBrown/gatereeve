# Scratchpad - tb-implementation-efficiency

## Current decisions

Approved architecture and scope: [design.md](design.md). Full user decision provenance: [interview.md](interview.md), D1–D26. Specification and plan translate those choices; observed implementation approval is recorded below.

## Investigation notes

- Fetched source baseline: 8b016e84ceba636f868314f32e62dcf73eefae1f (rc.24 publication metadata). Original main checkout remains untouched apart from fetched refs.
- GateReeve .github/workflows/plugin-ci.yml selects full versus review-artifact scope. Broad source suites include portable/container/Desktop/runtime/package checks. A post-push source-acceptance receipt is not available as pre-merge proof.
- The local MyLifeMap .github/workflows/ci.yml has fast, integration, PostgreSQL, browser, evaluation and conditionally deployed checks, with expensive-work classification. This is local source inspection, not a live fleet/CI coverage guarantee.
- docs/RUN-SCALING.md describes rc.24 caching and measurement improvements plus remaining history/source-view costs. Do not compare the supplied rc.23 sample directly to the new design as a controlled benchmark.
- The old root feature tb-workflow-modules has retained completion records; do not resume or delete it as part of this refactoring.

## Unresolved engineering details

Resolve minimal schema, snapshot envelope and source identity mapping within the approved specification. Preserve unknown legacy labels. Do not grow into fleet synchronization or full transcript archival. Review any material discovery that changes approved behavior rather than silently changing scope.

## Authority

Design approved. Specification validation recorded. Implementation is approved below. Merge, publication, installation and deployment remain unapproved.

## Implementation authorization - 2026-11-09

User instruction: “Approved”, responding to the concrete specification/plan approval request. Recorded authorize-implementation through the installed current adapter. Implementation is now authorized; merge/publication/installation/deployment remain separate.

## 2026-11-09 - Implementation details within approved scope

SQLite schema uses authoritative ordered events plus indexed history, jobs and
review-view records. Artifact bytes remain retained files. A derived projection
writes only new observations into the shared metrics database; it does not copy
workflow authority. Projection failure is visible/nonblocking. Snapshot versions
and dataset membership preserve fixed reports without synchronizing databases.

The report exposes a bounded optional analyst input (failure observations first,
then longest durations) with its omitted count, citations and hypotheses. Full
conversation logging remains deferred. A `workflow-note` command records strategy,
friction, escaped defects and fix/artifact links without creating a decision gate.

Runtime dependency changes deliberately no longer invalidate local receipts.
Actual source/configuration/declared environment and integrity remain checked.
Acceptance needs exact-candidate CI scope or an independently assessed local
alternative. A historical observation is never called a fresh execution.

Public database inspection is bounded to known local paths. General workflow
reset remains unsupported, as permitted by the approved scope; database loss can
start a fresh run with explicit observed approvals. Existing legacy files survive.


## 2026-11-09 - Verification and reporting corrections

Preserved executed supplemental assessments in the review packet without making
those optional assessments mandatory. Required consolidated assessment still
considers relevant cross-gate findings. Fixed dataset project keys distinguish
same-named folders; readable workflow labels use issue/branch when known.
Unknown worker durations now remain unknown in aggregate timing (formerly omitted
from the sum). Nested direct measurement records inherit public workflow/display
context. These corrections implement AC1/AC4/AC6; no CI suites were removed.

The governing installed rc.24/current-5 run remains active. Its actual independent
review obligations will review the candidate; the new current-6 code is exercised
only in disposable fixtures until separately authorized activation.
