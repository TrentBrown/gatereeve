# Branch Tracker - tb-desktop-file-actions

**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Issues:** [`issues.md`](issues.md)
**Created:** 2026-08-31

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|----|-------|
| R1 | Bounded open routes | PASS | - | Contract, service, IPC, and renderer tests cover default/preferred/one-time routes. |
| R2 | Accurate copy/location actions | PASS | - | Copy tests preserve source bytes, avoid Downloads overwrites, and cover cancellation-aware UI routes. |
| R3 | Provenance-driven GitHub action | PASS | - | URL derivation rejects non-GitHub/untracked failures and renderer omits unavailable action. |
| R4 | Coherent accessible UI | PASS | - | Grouped/labelled menu renderer test and 1280x800 fixture inspection passed without overflow. |

## PR Log

Append PR boundary entries here.

Implementation is complete pending native macOS runtime verification of editor
discovery, application chooser, and OS handoff.
