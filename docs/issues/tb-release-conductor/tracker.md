# Branch Tracker - tb-release-conductor

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-09-01

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Entry point and preflight | PASS | - | Conductor-only trigger topology and fresh reviewed-main/version preflight are covered by static workflow and negative contract tests. |
| R2 | Ordered derivation | PASS | - | The reusable DAG derives run IDs and plan digests; state, discovery, and orchestration fixtures cover ordered advancement and mismatches. |
| R3 | Approval isolation | PASS | - | Static permission/environment tests prove protected trust and mutation boundaries while rehearsals remain read-only and environment-free; hosted deployment proof is intentionally post-merge under AC8. |
| R4 | State and dashboard | PASS | - | Canonical digest-chain, tag-discovery, JSON-status, artifact, and summary suites cover valid and corrupt/divergent histories. |
| R5 | Recovery semantics | PASS | - | Failure records, tag-only routing, retained Apple recovery, and receipt idempotence pass local suites; hosted recovery proof is intentionally post-merge under AC8. |
| R6 | Direct install and Cask completion | PASS | - | Exact-DMG actor/time attestation and the four-artifact completion contract pass; public ARM64/Rosetta smoke remains an explicit post-merge acceptance check. |
| R7 | Metadata-only CI | PASS | - | Exact-path CI exception and deterministic branch/base/path/bytes/digest publication guards pass positive and negative tests. |
| R8 | Runtime and lifecycle verification | PASS | - | Node 24/action lint, 192 CLI tests, 158 Desktop tests, 94 Python tests, audit, build, and portable acceptance pass without an engine mismatch. |

## PR Log

No pull request has been opened.
