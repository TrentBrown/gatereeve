# Branch Tracker - tb-desktop-file-actions

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-31

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Bounded open routes | PASS | #40 | Contract, service, IPC, and renderer tests cover default/preferred/one-time routes. |
| R2 | Accurate copy/location actions | PASS | #40 | Copy tests preserve source bytes, avoid Downloads overwrites, and cover cancellation-aware UI routes. |
| R3 | Provenance-driven GitHub action | PASS | #40 | URL derivation rejects non-GitHub/untracked failures and renderer omits unavailable action. |
| R4 | Coherent accessible UI | PASS | #40 | Grouped/labelled menu renderer test and 1280x800 fixture inspection passed without overflow. |

## PR Log

### PR #40 — Desktop artifact file actions

- Pull request: [#40](https://github.com/TrentBrown/gatereeve/pull/40)
- Evidence packet: [pr-40](pr-40/boundary.json)
- Scope: feature-final

Implementation is complete pending native macOS runtime verification of editor
discovery, application chooser, and OS handoff.
