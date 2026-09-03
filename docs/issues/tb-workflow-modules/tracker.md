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
| R3 | Project settings, waivers, and readiness | NOT YET | - | Slice 2 adds staged complete-policy settings, explicit dependency/migration impact, fail-closed readiness, atomic uncommitted policy writes, and fingerprint-bound boundary waivers; finalization waivers activate with P8 attempts and final assembled verification remains P10 |
| R4 | Compact state-specific module UI | NOT YET | - | Slice 2 preserves the six-state rail and supplies one accessible graph/detail renderer for boundary and finalization modules, including normalized live detail and empty-slot behavior; provider-fed runtime and final assembled verification remain P6/P8/P10 |
| R5 | Explicit adapters and isolated task terminals | NOT YET | #63 | Slice 3 implements explicit skill/manual/command actions, exact local consent, changed-input invalidation, and separate attributable PTYs with bounded evidence; packaged macOS walkthrough and final assembled verification remain P10 |
| R6 | Command semantics and provider protocol | NOT YET | #63 | Slice 3 implements fail-closed command result mapping and allowlisted out-of-process providers with exact response/fingerprint validation and fresh core passage; the GateReeve Release provider and final assembled verification remain P9-P10 |
| R7 | Generic finalization semantics | NOT YET | - | Slices 1-2 define the generic slot, zero-module default, readiness, dependency graph, and standard presentation; attempts, passage, and feature-scoped waivers remain P8 |
| R8 | GateReeve Release verified end to end | NOT YET | - | Planned for P9-P10 / I-8-I-9 |

## PR Log

### PR #61 - Module protocol foundation

- Pull request: [#61](https://github.com/TrentBrown/gatereeve/pull/61)
- Evidence packet: [pr-61](pr-61/boundary.json)
- Scope: slice (P1-P3; R1, R2, R3, R6, R7)
- Outcome: merged as `cb85c672e6090f0286159b9897eacee9c3edf8fc`

The corrected slice source is committed through `4878343`, with deterministic
module resolution, built-in boundary parity, project manifest/policy
validation, feature-lock and attempt pinning, and migration impact ready for
formal gate evaluation. The first boundary attempt exposed and remediated a
legacy-attempt replay defect; the second attempt evaluates that correction.

### PR #62 - GateReeve module interface

- Pull request: [#62](https://github.com/TrentBrown/gatereeve/pull/62)
- Evidence packet: [pr-62](pr-62/boundary.json)
- Scope: slice (P4-P5; R1, R3, R4, R7)
- Outcome: merged as `1f3e6b258dbb22129bd5174d371a0fae4527efd3`

This slice adds staged project module settings, dependency and migration
previews, scoped waivers, and the shared Implementing/Finalizing module graph.
The implementation passes 174 Desktop tests and 208 CLI tests. It exposes only
narrow main-process policy/waiver operations, writes no Git state, keeps locked
and unavailable modules fail-closed, and renders authoritative results
separately from normalized live progress. A Linux-host Electron launch was
attempted but could not start because the host lacks `libatk-1.0.so.0`; the
packaged macOS runtime walkthrough remains part of P10.

The first PR-boundary preflight found that the packaged Desktop omitted the
trusted Python context guard used by the default waiver path. The slice returned
to implementation and now stages only the three canonical scripts in that
guard's dependency closure, discovers compatible Python, Git, and GitHub executables
explicitly, and exercises the packaged default path in an integration test.
The first human-review CI run then exposed the package verifier's older blanket
Python exclusion. The repaired contract requires exactly those three trusted
scripts, rejects every other Python path, and passes the universal package plus
native Apple Silicon and Intel packaged-runtime jobs.

### PR #63 - Execution and provider runtime

- Delivery branch: `tb-workflow-modules-03-provider-execution`
- Scope: slice (P6-P7; R5, R6)
- Pull request: [#63](https://github.com/TrentBrown/gatereeve/pull/63)
- Evidence packet: [pr-63](pr-63/boundary.json)
- Status: human review accepted; approved for merge

This slice adds validated skill/manual/command adapters, supervised provider
observation, explicit local command authorization, and dedicated module task
terminal sessions while preserving the persistent user shell. The current
source passes 193 Desktop tests, 212 CLI tests, 94 Python tests, portable package
acceptance, direct PTY integration, and zero-vulnerability production dependency
audits. All GitHub checks pass, including universal packaging and native launch
on Apple Silicon and Intel/Rosetta. The Linux host cannot launch Electron because
`libatk-1.0.so.0` is absent; the installed interactive macOS walkthrough remains
assigned to P10 as already planned. The independent judge and code review pass
with no unresolved finding; the optional pattern gate is explicitly waived
because GateReeve has no configured rule scope.
