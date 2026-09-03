# Branch Tracker - tb-workflow-modules

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-09-03

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Deterministic module policy and resolution | NOT YET | - | Slice 1 schema, discovery, resolver, full lock/attempt pinning, invalid-graph fixtures, and migration impact pass; final assembled verification remains P10 |
| R2 | Declarative boundary parity and locked envelope | NOT YET | - | Slice 1 converts all ten gates to built-ins with legacy outcome keys, locked envelope, unchanged runtime dependency/freshness behavior, and passing regression suites; final assembled verification remains P10 |
| R3 | Project settings, waivers, and readiness | NOT YET | - | Slice 1 supplies policy validation, local-readiness separation, locked/configurable metadata, and migration impact; settings and waiver UI remain P4 |
| R4 | Compact state-specific module UI | NOT YET | - | Planned for P5, P8 / I-4, I-7 |
| R5 | Explicit adapters and isolated task terminals | NOT YET | - | Planned for P6-P7 / I-5-I-6 |
| R6 | Command semantics and provider protocol | NOT YET | - | Slice 1 validates declarative command metadata and installed-provider references without execution; runtime semantics remain P6-P7 and P9 |
| R7 | Generic finalization semantics | NOT YET | - | Slice 1 defines and validates the generic `feature.finalization` slot and zero-module default; passage semantics remain P8 |
| R8 | GateReeve Release verified end to end | NOT YET | - | Planned for P9-P10 / I-8-I-9 |

## PR Log

Append PR boundary entries here.
