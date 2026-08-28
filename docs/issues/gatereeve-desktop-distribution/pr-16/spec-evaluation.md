# PR #16 Specification Evaluation

**Scope:** P8 / I-7 implementation boundary
**Base:** `5a69ee81a1838d61a0521e5fa21d54185a4abc1f`
**Evaluated source:** `fb91a03bef9883f78bac21c289e747f7c1d573aa`

## Completion report

### Definition of Done

- **Build status:** N/A - the release adapter is interpreted Node.js code; all
  changed modules pass syntax checking.
- **Lint status:** PASS - changed JavaScript parses, repository plugin-source
  lint passes inside the CLI suite, and the pinned diff passes whitespace
  validation.
- **Tests written:** Manifest generation, immutable publication outputs,
  website privacy/bounds, GitHub PR transport, contaminated-branch rejection,
  command registration, runbook contracts, and existing per-surface recovery
  all have executable coverage.
- **Test suite status:** PASS WITH ONE UNRELATED LOCAL LIMITATION - 14 focused,
  80 Desktop, and 4 website tests pass; the CLI passes 126/127 with only the
  pre-existing missing-`unzip` NUC environment failure.
- **Integration verified:** Yes for the nonpublishing implementation contract.
  The adapters share the existing coordinated record and exercise exact
  GitHub/API, marketplace, manifest, and website boundaries through injected
  fakes. Live public integration intentionally waits for exact approval.
- **Application runs:** N/A for this code-only slice; signed public runtime proof
  remains part of the P8 operation.
- **Pending manual verification:** Inspect and approve the exact fresh RC packet
  after this implementation merges, then verify the real public identities.

### Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC5 | Apple trust and credential readiness | PARTIAL - IMPLEMENTATION PASS | `coordinated-release.js` generates a public manifest only for complete Developer ID/notarization trust and rehashes every immutable output; `coordinated-publication.js` refuses publication without that output. The live public DMG trust inspection remains post-merge. |
| AC6 | Coordinated and recoverable releases | PARTIAL - IMPLEMENTATION PASS | The exact plan digest gates approval; all remote preflights precede mutation; adapters verify/recover the fixed ordered surfaces; generated PR transport rejects extra history and paths; existing fault tests prove durable per-surface continuation. The actual public receipts remain post-merge. |
| AC7 | Public RC and private update discovery | PARTIAL - IMPLEMENTATION PASS | The adapter creates/verifies an exact prerelease containing only the universal DMG and `SHA256SUMS`, publishes the trusted channel manifest via a deterministic PR, and waits for production to serve exact bytes. The real release and link remain absent until exact approval. |

### Rubric

| # | Criterion | Result | Scope | Notes |
|---|---|---|---|---|
| R1 | Native identity and universal DMG | NOT YET - P8 ADAPTER READY | P8 / I-7 | The adapter binds the existing universal artifact name, byte count, digest, and source identity; public download and native proof have not yet run. |
| R5 | Apple trust | NOT YET - P8 ADAPTER PASS | P8 / I-7 | Complete trust is required for immutable manifest creation and approval; live public inspection remains. |
| R6 | Coordinated release and recovery | NOT YET - P8 IMPLEMENTATION PASS | P8 / I-7 | Exact approval, read-only preflight, ordered convergence, immutable output identity, generated-PR transport, and fault recovery pass. Public receipts remain. |
| R7 | RC publication and update behavior | NOT YET - P8 IMPLEMENTATION PASS | P8 / I-7 | Exact prerelease assets, trusted manifest bytes, production polling, and fixed tag-page identity are implemented and tested; live publication remains. |

## Scope conclusion

The pinned implementation provides the guarded mechanism required to prepare,
approve, publish, recover, and prove the direct RC without exercising the
separately authorized public operation. No in-scope implementation failure
blocks PR #16. R1, R5, R6, and R7 correctly remain `NOT YET` until the exact
post-merge packet is approved and executed.
