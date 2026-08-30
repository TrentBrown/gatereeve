# Judge Evaluation

**Verdict:** PASS WITH CONCERNS

**Pinned diff:** `3b0e719af9258e5b7ee8bc9b6b8a7dd908a5bc41..c9813f3c6d66f6b6c7a7e886e299772594b40d68`

### Rubric Evaluation

| # | Criterion | Result | Evidence |
|---|---|---|---|
| R1 | Schema lifecycle | PASS | `hosted-publication-v2.js:268-316,362-381,417-478` validates a sealed distribution packet and advances only through approval and publication after ordered receipts. The in-memory schema-v1 projection invokes the existing validator but no new mutable v1 record is persisted. |
| R2 | Source and byte authority | PASS | `hosted-publication-v2.js:187-265,268-307` independently rebinds the Plugin tree, final DMG, native documents, Apple trust, and every publication input/output. Hosted workflows require matching successful source runs and exact artifact names. |
| R3 | Credential custody | PASS WITH CONCERNS | Finalization has read-only permissions; dry-run jobs are read-only; primary publication uses the workflow token; only the real Cask job references `GATEREEVE_PUBLICATION_TOKEN` (`homebrew-cask-publish.yml:109-167`). Live environment contents and protection rules are not observable until P9. |
| R4 | Notarization recovery | PASS IN SCOPE | Publication code has no signing, notarization, or resubmission path and consumes the P2-P4 retained trust record. Operator docs preserve bounded recovery, request reuse, and generic-rerun prohibition. Live Apple history remains outside this slice. |
| R5 | Native verification | NOT IN SCOPE | P3-P4 authority is consumed as an exact prerequisite. Hosted regression run 33333444341 passes both native packaged-runtime jobs. |
| R6 | Finalization and publication | PASS | Exact finalization, sealed plan verification, preflight-only dry run, protected approval, ordered per-surface receipts, remote exactness checks, and deterministic retry are implemented and covered by negative tests. |
| R7 | Cask linkage | PASS WITH CONCERNS | `homebrew-cask-v2.js:132-224,260-410` binds completed primary history, public DMG/trust, post-publication installation attestation, exact Cask bytes, separate approval, and PR receipt. Actual v2 protected dispatch remains P9/future release evidence. |
| R8 | Conformance and acceptance | NOT IN SCOPE | P8-P9. No PortReeve CLI/service topology or product UI was introduced. |

### Scope Check

- **Scope creep found:** No.
- **Details:** The diff preserves GateReeve's Plugin plus universal-DMG graph,
  keeps implementation repository-local, and adds only the P5-P7 hosted
  publication, linked Cask, compatibility, test, and operator surfaces. The
  RC.2 smoke-fixture remediation follows immutable public history and is part
  of Cask operational correctness.

### Gap Check

- **Unaddressed AC:** No P5-P7 behavior is missing. AC8 and the live portions
  of AC2-AC5 remain explicitly assigned to P8-P9 rather than being claimed by
  repository-only evidence.

### Contradiction Check

- **Contradictions found:** None. Reusing established repository-local
  transport adapters behind a sealed v2 authority does not mutate or upgrade
  historical v1 records. Separate Cask completion also does not reopen the
  completed primary lifecycle.

### Concerns

Repository tests and ordinary hosted CI prove structure, exact-byte rejection,
native runtime behavior, and deterministic simulated recovery. They do not
prove the live `release-trust`/`release-publication` inventories, a real fresh
Apple request, or the protected zero-mutation rehearsal. Merge is appropriate
for this sequential slice only if the tracker continues to leave those facts
`NOT YET` for P8-P9.
