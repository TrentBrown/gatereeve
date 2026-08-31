# Branch Tracker - tb-desktop-terminal

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-31

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Panel layout, controls, accessibility, resize, and persistence | PASS | [#43](https://github.com/TrentBrown/gatereeve/pull/43) | DOM/accessibility, preference, renderer, and native packaged UI smoke pass. |
| R2 | Explicit trusted login-shell creation | PASS | [#43](https://github.com/TrentBrown/gatereeve/pull/43) | Fake and real PTY tests prove lazy main-owned account-shell/cwd creation. |
| R3 | Per-project session isolation and continuity | PASS | [#43](https://github.com/TrentBrown/gatereeve/pull/43) | Manager/renderer multi-project and delayed-load tests pass. |
| R4 | Interactive terminal lifecycle and scoped controls | PASS | [#43](https://github.com/TrentBrown/gatereeve/pull/43) | Input, output, focus, resize, exit, Terminate, and Restart pass without excluded controls. |
| R5 | Guarded process-group cleanup | PASS | [#43](https://github.com/TrentBrown/gatereeve/pull/43) | Cancel/confirm flows and shell-plus-descendant sentinel cleanup pass. |
| R6 | Narrow validated renderer-to-PTY authority | PASS | [#43](https://github.com/TrentBrown/gatereeve/pull/43) | Exact preload/shared/main validation and Electron hardening pass. |
| R7 | Bounded ephemeral and non-authoritative output | PASS | [#43](https://github.com/TrentBrown/gatereeve/pull/43) | Bounded-memory, persistence inventory, Session, and protocol-separation tests pass. |
| R8 | Ubuntu and universal macOS delivery evidence | PASS | [#43](https://github.com/TrentBrown/gatereeve/pull/43) | Ubuntu plus exact universal DMG smoke pass natively on arm64 and Intel; actual Apple trust remains the mandatory post-merge release gate. |

## PR Log

### PR #43 — GateReeve Desktop terminal

- Pull request: [#43](https://github.com/TrentBrown/gatereeve/pull/43)
- Evidence packet: [pr-43](pr-43/boundary.json)
- Scope: feature-final terminal implementation, platform evidence, review, and
  approved trust sequencing
