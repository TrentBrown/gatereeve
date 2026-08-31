# Branch Tracker - tb-desktop-markdown-rendering

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-31

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | CommonMark on artifacts and Session | PASS | - | Shared renderer; CommonMark 0.31.2 examples and both-surface integration pass. |
| R2 | Required GFM extensions | PASS | - | Table, task-list, autolink, strikethrough, and footnote tests plus browser fixture pass. |
| R3 | DOM and resource safety | PASS | - | Hostile DOM tests and real-browser zero-request smoke pass. |
| R4 | Capability-controlled links | PASS | - | Accepted and rejected inline/reference/autolink/artifact/fragment/Session cases pass. |
| R5 | Stable prefixed heading anchors | PASS | - | Formatted, duplicate, reserved-name, and fragment integration tests pass. |
| R6 | Graceful degradation and existing flows | PASS | - | Malformed, code/Mermaid, source-toggle, reread, and refresh flows pass. |
| R7 | Reproducible offline integration | PASS | - | Repeat bundle digest matched; lifecycle/staging/ASAR/isolation checks pass; native host smoke remains at PR/release boundary. |
| R8 | Semantic accessible presentation | PASS | - | Semantic/accessibility tests and real-browser containment checks pass. |

## PR Log

Append PR boundary entries here.
