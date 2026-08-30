## Judge Evaluation

**Verdict:** PASS WITH CONCERNS

**Pinned diff:** `4a6a680be51b5b0c2b9454497a8950df739e1805..6641b2842a94100a3a72d1e8806ddc7f3f05cbcf`

### Rubric Evaluation

| # | Criterion | Result | Evidence |
|---|---|---|---|
| R1 | Schema lifecycle | PASS WITH CONCERNS | `release-lifecycle-v2.js` implements the exact ordered GateReeve prefix, source/stage hash chain, candidate binding, strict stage progression, v1 mutation rejection, and version dispatch. Tests reject ordering and identity drift and validate the published RC.2 fixture unchanged. Concern: the existing operational preparation path still emits v1 until later slices can supply the complete v2 trust/publication packet. |
| R2 | Source and byte authority | PASS | Lifecycle and attempt identities bind full source SHA, exact tag/version, filename, byte count, and SHA-256. `notarizeMacos` recomputes the DMG identity and refuses a retained attempt for changed bytes; tests exercise that refusal. |
| R4 | Notarization recovery | PASS WITH CONCERNS | The attempt record is durable before submission, reaches `submitting` before invoking Apple, persists request ID before polling, enforces 60 polls at the 30-second policy interval, resumes the same request, requires Apple-history evidence for ambiguous creation, validates response request identity, and records rejection/supersession. Concern: live Apple-history query transport and 30-day hosted retention are deliberately deferred to P4. |

### Scope Check

- **Scope creep found:** No.
- **Details:** The diff preserves the universal DMG and Plugin/Desktop topology.
  It adds no product UI, PortReeve CLI/service machinery, architecture-specific
  DMG, shared runtime, credential transport, or public mutation.

### Gap Check

- **Unaddressed AC:** AC3 and AC5-AC8 are future slices by plan. The hosted
  portions of AC1, AC2, and AC4 also remain future work and are still `NOT YET`
  in the cumulative tracker.
- **Slice gaps:** No blocking P1-P2 contract gap remains after the two recorded
  boundary remediations.

### Contradiction Check

- **Contradictions found:** None. The additive v2 contract does not reinterpret
  or mutate published v1 history, and the attempt failures remain separate
  from successful lifecycle stages.

### Concerns

1. The current release command continues to create schema-v1 records. This is
   safe for an additive contract slice but must be removed from new-candidate
   authority before final acceptance; otherwise AC1/R1 fail globally.
2. No Linux test can establish actual Apple notarization, native architecture,
   retention, or protected-environment behavior. Those remain mandatory hosted
   evidence in P3-P4/P9.
