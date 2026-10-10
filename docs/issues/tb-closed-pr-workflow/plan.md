# Plan - tb-closed-pr-workflow

**Feature:** `tb-closed-pr-workflow`
**Spec:** [spec.md](spec.md)
**Design:** [design.md](design.md)
**Interview:** [interview.md](interview.md)
**Created:** 2026-10-09

## Strategy

Reuse PR identity and exact-source verification. Pin the boolean preference in context, add a shared PR lifecycle helper, and remove synthetic execution. Preserve historical readers and protocol gate authority.

## Steps

- **P1.** Replace JS/Python configuration, templates and parity tests. **Advances:** R1.
- **P2.** Pin closure policy and accept closed PRs during resolution, gates, currentness and finalization only when opted in. **Advances:** R3, R5.
- **P3.** Implement create/reuse/close and authorized merge/re-close lifecycle with negative tests. **Advances:** R2, R4.
- **P4.** Remove active synthetic operations/routing and update instructions/inventory while retaining historical interpretation. **Advances:** R5, R6.
- **P5.** Stage resources, run Python/CLI/Desktop suites and plugin checks, record real closed-PR behavior and prepare the closed implementation PR. **Advances:** R1, R2, R3, R4, R5, R6.

## Verification

Use real local Git fixtures and injected GitHub operations for deterministic failures. Run broad existing suites, staged parity and portable plugin checks. Verify a real closed implementation PR without unauthorized reopening or merge. Release and installation remain separate post-merge obligations.
