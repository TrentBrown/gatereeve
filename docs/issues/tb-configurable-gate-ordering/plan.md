# Plan - tb-configurable-gate-ordering

## Strategy

Deliver one cohesive feature-final slice: versioned policy/graph support, staged Desktop controls and actual-edge diagrams, then full portability and formal review. Preserve schema-1 serialization and definitions unchanged; store owner ordering in a schema-2 graph overlay. Use shared edge derivation for eligibility, migration and presentation rather than modifying manifests.

## Steps

- **P1.** Add strict schema-2 policy ordering and graph retention; keep schema-1 defaults/hashes intact. Resolve combined hard/conditional/owner edges and validate malformed/cyclic/cross-slot policies. **Advances:** R1-R3.
- **P2.** Carry ordering through project model, attempt snapshots, eligibility/freshness and migration impact; ensure independent Judge evidence includes only declared hard dependencies. **Advances:** R4-R5.
- **P3.** Extend existing module policy manager, IPC and Run after controls; preserve staged ordering across enablement, preview, apply and discard with explicit migration confirmation. **Advances:** R6-R7.
- **P4.** Render exact individual dependencies in overview/finalization and policy preview, with accessible descriptions and edge-origin legend. **Advances:** R8-R9.
- **P5.** Document policy examples and adoption; stage portable resources, run full CLI/Desktop and package integrity checks, assess all rubric rows and prepare the governed feature-final review. **Advances:** R10; final verification covers R1-R10.

## Verification

Core matrix: legacy hashes/locks, new retention, invalid endpoints/shapes/cycles, dormant edge restoration, prerequisites/locks, event-bound freshness and immutable old attempts. Desktop integration: IPC validation, ordering-only preview/apply, migration/cancellation, actual edge rendering and named relationship descriptions. Full existing CLI/Desktop suites, deterministic protocol/resource staging and portable package acceptance. Formal independent Judge and boundary evidence follow implementation readiness; human acceptance and exact-head merge authorization remain separate.
