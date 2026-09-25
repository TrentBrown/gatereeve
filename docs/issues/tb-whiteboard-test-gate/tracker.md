# Branch Tracker - tb-whiteboard-test-gate

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-09-24

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Activation and graph behavior | PASS | pending | Explicit policy activation, required disposition, Verification dependency, optional Judge ordering, waiver behavior, and disabled-gate invalidation are covered by module contract and scheduler tests. |
| R2 | Scope and freshness | PASS | pending | Slice and feature-final scope contracts, pinned snapshots, input fingerprints, changed-input invalidation, and attempt binding pass runtime and scheduler tests. |
| R3 | Challenger/Publisher isolation | PASS | pending | Runtime tests enforce unique fresh context IDs and immutable questions; live Codex and Claude Code structured fresh-context smokes both passed. |
| R4 | Defense experience and coverage | PASS | pending | Whiteboard validation and a real narrow-viewport Electron smoke cover layered reveal, Push Harder, evidence, linked findings, accessible SVG, and layout. |
| R5 | Outcome semantics | PASS | pending | Validator fixtures prove disclosed work deficiencies can PASS while artifact deficiencies fail; the artifact never claims human comprehension. |
| R6 | Artifact provenance and containment | PASS | pending | Digest/schema tests, bounded publication, sandboxed renderer protocol, strict CSP, blocked external requests, and the Electron interaction smoke pass. |
| R7 | Reusable runtime and parity | PASS | pending | Generic staged runtime, provider adapters, automatic CLI/Desktop scheduling, four-package composition, native validation, and Codex/Claude installation and live smokes pass. |
| R8 | Judge correction and compatibility | PASS | pending | Judge v2 uses one fresh read-only context, emits bound JSON/Markdown evidence, blocks on FAIL without remediation, and retains legacy evidence readability. |

## PR Log

Append PR boundary entries here.

The implementation is provisionally evaluated in
[`implementation-verification.md`](implementation-verification.md). A formal
packet and PR number remain pending the commit, push, and draft-PR boundary.
