# Decisions - tb-implementation-efficiency

## Approved design

The controlling design was approved on 2026-11-09 with the user's instruction “Approved”, in reply to the request to use it as the basis for specification and planning. The current adapter recorded approve-design against the approved document. Interview D1–D26 retain the supporting decisions and their supersession.

Key dispositions: remove runtime-tree fingerprinting; consolidate independent code/spec/Judge responsibilities; preserve model-led execution; use per-issue/branch/worktree SQLite authority and separate shared metrics; report fleet snapshots through shared CLI/MCP/desktop code; keep transcript ingestion, live synchronization and complex recovery outside scope.

## Implementation plan

Specification validation passed. The implementation plan and issue breakdown were approved as recorded below. No scope waiver is recorded. Current product gates remain in force while this refactoring is developed.

## Implementation authorization - 2026-11-09

User instruction: “Approved”, responding to the concrete specification/plan approval request. Recorded authorize-implementation through the installed current adapter. Implementation is now authorized; merge/publication/installation/deployment remain separate.
