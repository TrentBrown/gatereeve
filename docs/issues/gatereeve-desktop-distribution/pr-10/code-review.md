# Code Review - PR #10

**Result:** PASS - no remaining findings.

**Pinned base:** `3a340e3e33791d08934c783ca0d0ac2fe1c97a0b`

**Pinned head:** `fd9eddd37b6b7a0bfebf9936b6685c080a2a777f`

## Findings

No correctness, regression, security, or test-gap finding remains.

## Resolved during review

- The first hosted run found that `Dockerfile.acceptance` did not copy the new
  workflow fixture read by its CLI tests. Commit `4c451be` adds the exact file,
  restoring both Ubuntu container contracts.
- Stable RC lineage was enforced during record creation but not revalidated on
  every later record read. Commit `fd9eddd` makes promotion evidence, application
  version, artifact path, approval, and publication state mutually consistent,
  with negative tests for tampering and path escape.

## Review notes

- Candidate inventory rejects symlinks, hashes a sorted portable manifest, and
  verifies the copied Plugin tree, DMG bytes, and both evidence documents
  before publication readiness can pass.
- Preparation uses a fresh sibling staging directory and one atomic rename;
  record updates use exclusive temporary files and atomic rename. Exact
  temporary paths are cleaned on failure.
- Approval binds the semantic identity, candidate hashes, native evidence,
  trust evidence, and fixed surface order through one stable plan digest.
- Completed publication receipts must be an ordered prefix and repeat the
  exact tag and source commit. Adapters are convergence operations, so a crash
  after a remote mutation can discover that identity and resume without
  replacing history.
- The existing Plugin publisher has a required `--release-record`; workspace
  verification and trusted exact-plan approval run before its confirmation or
  mutation path, so `--yes` is not authority.
- CI checks out one resolved commit in every job, builds both candidates before
  the record, emits architecture-specific evidence from the same DMG, and has
  only `contents: read` permission.

## Residual risks and later evidence

- Current trust evidence is a typed state with evidence labels; P6 must produce
  and validate the real Developer ID, timestamp, notarization, staple, and
  Gatekeeper outputs before recording that state.
- The new `workflow_dispatch` preparation path can only be exercised after the
  workflow reaches the default branch. Its first real candidate run belongs to
  P6 and must remain non-public until exact approval.
- Live publication adapters, update/website convergence, and public receipt
  inspection are P7-P8, not omissions from this pre-publication slice.
