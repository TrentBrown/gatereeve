# Specification Evaluation - PR #8

**Scope:** Setup and compatibility slice P3 / I-2

**Pinned base:** `dae5c536fc1d90b17a5d7397f34a6a9fc0d8cb4f`

**Pinned head:** `a5a8e93ad16d206861c1f8845823bd9ca309b52f`

## Definition of Done

- **Build status:** PASS — applicable JavaScript syntax and package composition
  checks pass.
- **Lint status:** PASS — pinned-diff whitespace, Plugin validation, native
  validation, and portability lint pass.
- **Tests written:** Setup contracts, compatibility schema/matrix, native
  adapters, executable discovery, persistence/recheck coordination, IPC,
  renderer behavior, accessibility, and exact runtime smoke.
- **Test suite status:** PASS — Desktop 56/56 and complete portable acceptance.
- **Integration verified:** Yes — main/preload/renderer Setup flow, both native
  manager adapter fixtures, packaged composition, and actual local Codex
  detection.
- **Application runs:** Yes — exact-head Electron smoke passes on macOS and both
  supported Ubuntu releases.
- **Pending manual verification:** None for this slice.

## Acceptance Criteria

| # | Status | Evidence |
|---|---|---|
| AC1 | NOT YET | Native identity and universal DMG are P4 / I-3. |
| AC2 | NOT YET | Runtime foundation advanced in PR #7; exact packaged-byte execution remains P4 / I-3. |
| AC3 | PASS | Setup is persistent and always accessible; stores only explicit Codex/Claude selection; probes only selected agents; distinguishes missing, disabled, incompatible, unauthenticated, and unavailable states; provides copy-only manager/native remediation; rechecks; requires no CLI; and preserves labeled historical/offline reading. Readiness requires all shared prerequisites and at least one ready selected agent. |
| AC4 | PASS | Project-controlled exact pairs produce matched, compatible, or incompatible outcomes; unknown or manager-unreported versions fail closed; tested skew remains ready with visible update guidance; no semantic-version proximity inference exists. |
| AC5 | NOT YET | Planned for P6 / I-5. |
| AC6 | NOT YET | Planned for P5-P6 / I-4-I-5. |
| AC7 | NOT YET | Planned for P7-P8 / I-6-I-7. |
| AC8 | NOT YET | Planned for P9 / I-8. |

## Rubric

| # | Result | Scope | Notes |
|---|---|---|---|
| R1 | NOT YET | Future | P4, P8, P10 / I-3, I-7, I-8. |
| R2 | NOT YET | Future | Exact packaged-byte execution remains P4 / I-3. |
| R3 | PASS | In scope | Persistent selected-agent Setup is accurate, actionable, non-mutating, CLI-independent, and preserves historical reading; adapter, renderer, live local, and exact-head runtime evidence pass. |
| R4 | PASS | In scope | Exact project metadata and matrix tests prove all three compatibility states and fail-closed unknown-pair behavior. |
| R5 | NOT YET | Future | P6, P8, P10 / I-5, I-7, I-8. |
| R6 | NOT YET | Future | P5, P6, P8, P10 / I-4, I-5, I-7, I-8. |
| R7 | NOT YET | Future | P7, P8, P10 / I-6, I-7, I-8. |
| R8 | NOT YET | Future | P9, P10 / I-8. |

## Verdict

P3 / I-2 satisfies AC3, AC4, R3, and R4. The remaining criteria correctly stay
`NOT YET` for later distribution slices.
