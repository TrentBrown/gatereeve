# Branch Tracker - tb-workflow-modules

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-09-03

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Deterministic module policy and resolution | PASS | #64 | Complete feature tests prove deterministic discovery/resolution, invalid graph and digest rejection, exact lock/attempt pinning, explicit migration, and historical replay. |
| R2 | Declarative boundary parity and locked envelope | PASS | #64 | All ten existing checks resolve from built-in modules with locked envelope gates, unchanged freshness/dependency guards, and default Judge/code-review requirements. |
| R3 | Project settings, waivers, and readiness | PASS | #64 | Settings, dependency disclosure, atomic policy writes, explicit migration, scoped fingerprint-bound waivers, N/A distinction, and fail-closed readiness pass. |
| R4 | Compact state-specific module UI | NOT YET | #64 | Renderer and accessibility suites pass the fixed six-state rail and shared Implementing/Finalizing graph; the newly packaged app walkthrough/screenshots remain a post-merge release obligation. |
| R5 | Explicit adapters and isolated task terminals | NOT YET | #64 | Adapter, authorization, cancellation, timeout, evidence, and real PTY isolation tests pass; the newly packaged macOS interactive run remains a post-merge release obligation. |
| R6 | Command semantics and provider protocol | PASS | #64 | Exit/cancel mapping, installed provider isolation, exact byte/identity binding, supervision failures, live-status separation, and fresh core recording all pass. |
| R7 | Generic finalization semantics | PASS | #64 | Merge-bound module attempts, dependencies, waivers, invalidation, migration recovery, zero-module completion, and generic passage all pass without release-specific core state. |
| R8 | GateReeve Release verified end to end | NOT YET | #64 | Provider and adversarial source-containment tests pass, including distinct contained merges; the real post-merge release, publication, installation, and smoke evidence remains required. |

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
- Outcome: merged as `76f627928a84071b524c87772fd42f0680d9b85a`

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

### PR #64 - Finalization and GateReeve Release

- Delivery branch: `tb-workflow-modules-04-finalization-release`
- Scope: feature-final (P8-P10; R1-R8)
- Pull request: [#64](https://github.com/TrentBrown/gatereeve/pull/64)
- Evidence packet: [pr-64](pr-64/boundary.json)
- Status: PR boundary; post-merge release proof remains pending

This final delivery slice starts from the merged PR #63 mainline. Its pinned
source adds generic feature-finalization attempts and completion passage, ships
the `gatereeve/release` module with its `gatereeve/release-conductor` installed
provider, and passes the complete local feature verification matrix. The real
hosted release, publication, installation, and smoke evidence required by R8 is
intentionally unavailable before merge and remains an explicit post-merge
finalization obligation rather than a pre-merge waiver.
