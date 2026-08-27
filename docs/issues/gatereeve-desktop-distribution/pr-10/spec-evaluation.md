# Specification Evaluation - PR #10

**Scope:** Coordinated release and recovery slice P5 / I-4

**Pinned base:** `3a340e3e33791d08934c783ca0d0ac2fe1c97a0b`

**Pinned head:** `fd9eddd37b6b7a0bfebf9936b6685c080a2a777f`

## Definition of Done

- **Build status:** PASS - Plugin candidates and coordinated records build in
  full acceptance; Desktop version staging and package verification pass.
- **Lint status:** PASS - JavaScript, workflow YAML, docs, and pinned-diff
  checks pass.
- **Tests written:** Candidate identity, evidence integrity, stable lineage,
  approval binding, ordered state, path safety, and failure/retry boundaries
  are covered.
- **Test suite status:** PASS - Plugin 116/116, Python 94/94, Desktop 62/62,
  and hosted repository matrices pass.
- **Integration verified:** Yes - the guarded CLI, Plugin candidate builder,
  versioned Desktop package contract, native evidence, coordinated record, and
  pre-publication workflow share one exact identity.
- **Application runs:** Preserved - hosted source and packaged Desktop runtime
  jobs pass on macOS and Ubuntu.
- **Pending manual verification:** None for P5. Apple-controlled enrollment and
  protected trust setup intentionally begin in P6.

## Acceptance Criteria

| # | Status | Evidence |
|---|---|---|
| AC1 | NOT YET | The universal candidate remains intact; public trusted download is P6-P8. |
| AC2 | PASS | Preserved by all source and packaged runtime jobs. |
| AC3 | PASS | Preserved by Desktop Setup tests and runtime smoke. |
| AC4 | PASS | Coordinated RC packaging now stages the exact matching Desktop/Plugin version pair. |
| AC5 | NOT YET | This slice encodes the required trust state and blocks publication without it; live Apple trust is P6. |
| AC6 | NOT YET | P5's required model passes: one semantic identity, checksummed candidates and evidence, exact approval plan, deterministic ordered continuation, and stable exact-source proof. Protected trust and live publication remain P6 and P8. |
| AC7 | NOT YET | Planned for P7-P8 / I-6-I-7. |
| AC8 | NOT YET | Planned for P9-P10 / I-8. |

## Rubric

| # | Result | Scope | Notes |
|---|---|---|---|
| R1 | NOT YET | Preserved and future | P4 candidate evidence remains green; trusted public RC is P8. |
| R2 | PASS | Preserved | Full runtime and package matrices pass. |
| R3 | PASS | Preserved | No Setup regression. |
| R4 | PASS | Preserved and advanced | Exact RC version staging creates the matching tested pair. |
| R5 | NOT YET | Future | P6, P8, P10 / I-5, I-7, I-8. |
| R6 | NOT YET | In scope and future | P5 record, recovery, guard, and stable-source obligations pass; Apple trust, live publication, and final proof remain P6, P8, and P10. |
| R7 | NOT YET | Future | P7, P8, P10 / I-6, I-7, I-8. |
| R8 | NOT YET | Future | P9, P10 / I-8. |

## Verdict

P5 / I-4 passes its coordinated identity, pre-publication preparation,
approval gate, deterministic recovery, and stable-source obligations. R6
advances but correctly remains `NOT YET` until the protected Apple-trust and
live publication slices exercise the model against real public surfaces.
