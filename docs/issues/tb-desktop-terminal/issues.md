# Issues - tb-desktop-terminal

**Feature:** `tb-desktop-terminal`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-31

Operational task breakdown derived from the plan.

## I-1 - Add and stage terminal runtime dependencies

- **Status:** in-review
- **Estimate:** 0.5d
- **Plan steps:** P1
- **Rubric criteria:** R2, R4, R6, R8
- **Depends on:** none
- **PR:** [#43](https://github.com/TrentBrown/gatereeve/pull/43)

Lock the PTY and xterm packages, expose only approved browser assets, and make
the deterministic development and macOS staging paths retain the required
runtime files and executable modes.

## I-2 - Implement the trusted terminal manager and contract

- **Status:** in-review
- **Estimate:** 1d
- **Plan steps:** P2, P3
- **Rubric criteria:** R2, R3, R4, R5, R6, R7
- **Depends on:** I-1
- **PR:** [#43](https://github.com/TrentBrown/gatereeve/pull/43)

Build the main-process registry, shell derivation, bounded memory state,
validated lifecycle operations, process-group cleanup, IPC handlers, shared
contracts, and preload surface.

## I-3 - Guard quit and project removal

- **Status:** in-review
- **Estimate:** 0.5d
- **Plan steps:** P4
- **Rubric criteria:** R3, R5, R6
- **Depends on:** I-2
- **PR:** [#43](https://github.com/TrentBrown/gatereeve/pull/43)

Add the two-outcome confirmation flows and prove cancel, targeted termination,
descendant cleanup, and unrelated-session isolation.

## I-4 - Build terminal layout state and bottom-panel UI

- **Status:** in-review
- **Estimate:** 1d
- **Plan steps:** P5, P6
- **Rubric criteria:** R1, R3, R4, R7
- **Depends on:** I-2
- **PR:** [#43](https://github.com/TrentBrown/gatereeve/pull/43)

Add preference migration, per-project visibility, the masthead control,
shortcut, resizer, xterm host, header, focus behavior, and exited/restart UI.

## I-5 - Complete security, privacy, and interaction coverage

- **Status:** in-review
- **Estimate:** 1d
- **Plan steps:** P7
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7
- **Depends on:** I-2, I-3, I-4
- **PR:** [#43](https://github.com/TrentBrown/gatereeve/pull/43)

Add exhaustive fake-PTY, contract, IPC, renderer, accessibility, lifecycle,
process sentinel, no-persistence, and protocol-separation tests.

## I-6 - Extend macOS packaging and Ubuntu runtime evidence

- **Status:** in-review
- **Estimate:** 1d
- **Plan steps:** P8
- **Rubric criteria:** R2, R4, R5, R6, R8
- **Depends on:** I-1, I-2, I-3, I-4
- **PR:** [#43](https://github.com/TrentBrown/gatereeve/pull/43)

Verify both macOS terminal runtime architecture paths, signing/notarization and
packaged smoke, real Ubuntu PTY behavior, and transparent native-Intel versus
Rosetta evidence labeling.

## I-7 - Run final verification and rubric evaluation

- **Status:** in-review
- **Estimate:** 0.5d
- **Plan steps:** P9
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-5, I-6
- **PR:** [#43](https://github.com/TrentBrown/gatereeve/pull/43)

Run the complete verification matrix, perform available runtime/manual checks,
reconcile all rubric evidence, and produce the completion report.
