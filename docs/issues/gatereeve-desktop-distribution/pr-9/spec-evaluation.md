# Specification Evaluation - PR #9

**Scope:** Identity and universal DMG slice P4 / I-3

**Pinned base:** `9ccee2ae49de3d2cb03b702da05f6cdcea432495`

**Pinned head:** `0eebfb89b76355c9e49e1a41a32d3c6f8eacfd4b`

## Definition of Done

- **Build status:** PASS - the universal app and DMG build on hosted macOS.
- **Lint status:** PASS - JavaScript syntax, YAML syntax, and pinned-diff
  whitespace checks pass.
- **Tests written:** Icon identity, standard iconset generation, staging
  exclusions, packager identity, DMG layout, mounted bundle inspection, and
  native exact-byte smoke are covered.
- **Test suite status:** PASS - Desktop 61/61 and every hosted acceptance,
  contract, container, source-runtime, package, and packaged-runtime job pass.
- **Integration verified:** Yes - icon generation, Electron universal package,
  ASAR, ad-hoc bundle sealing, DMG composition, artifact handoff, read-only
  mount, canonical observer, and renderer smoke execute as one path.
- **Application runs:** Yes - the same DMG artifact runs natively on hosted ARM
  and Intel against a real governed feature record.
- **Pending manual verification:** None for P4. Apple trust and public install
  are deliberately later acceptance boundaries.

## Acceptance Criteria

| # | Status | Evidence |
|---|---|---|
| AC1 | NOT YET | P4's portion passes: one conventional DMG contains branded `GateReeve.app`, exact bundle ID `com.trentbrown.gatereeve.desktop`, an Applications shortcut, and universal ARM/Intel executables that run natively. The candidate is deliberately ad-hoc; a publicly downloadable trusted DMG remains P6-P8. |
| AC2 | PASS | The mounted packaged app opens and renders a real governed fixture on ARM and Intel with only packaged JavaScript resources and system Git; ASAR inspection excludes Python, development Node modules, tests, and the optional CLI. PR #7 parity and Finder-discovery evidence remains intact. |
| AC3 | PASS | Preserved from PR #8; all source and packaged Setup runtime smokes pass. |
| AC4 | PASS | Preserved from PR #8; exact compatibility metadata and packaged Setup load pass. |
| AC5 | NOT YET | Planned for P6 / I-5. The ad-hoc candidate cannot enter a public surface. |
| AC6 | NOT YET | Planned for P5-P6 / I-4-I-5. |
| AC7 | NOT YET | Planned for P7-P8 / I-6-I-7. |
| AC8 | NOT YET | Planned for P9 / I-8. |

## Rubric

| # | Result | Scope | Notes |
|---|---|---|---|
| R1 | NOT YET | In scope and future | P4 candidate identity, branding, DMG layout, universal inspection, and native launch pass. Trusted public RC evidence remains P8 and final verification remains P10. |
| R2 | PASS | In scope | The exact mounted packaged bytes observe a real governed fixture on ARM and Intel without Python, external Node, optional CLI, or terminal-derived PATH; parity and Ubuntu evidence pass. |
| R3 | PASS | Preserved | No regression in persistent, non-mutating Setup or historical reading. |
| R4 | PASS | Preserved | No regression in exact compatibility governance. |
| R5 | NOT YET | Future | P6, P8, P10 / I-5, I-7, I-8. |
| R6 | NOT YET | Future | P5, P6, P8, P10 / I-4, I-5, I-7, I-8. |
| R7 | NOT YET | Future | P7, P8, P10 / I-6, I-7, I-8. |
| R8 | NOT YET | Future | P9, P10 / I-8. |

## Verdict

P4 / I-3 passes its candidate identity, universal packaging, conventional DMG,
and exact-byte native-runtime obligations. R2 moves to `PASS`. R1 advances but
correctly remains `NOT YET` until the trusted public RC and final verification
complete the criterion.
