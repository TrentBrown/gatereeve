# PR 34 Code Review

**Verdict:** PASS - no findings in the remediated pinned diff

**Pinned diff:** `3b0e719af9258e5b7ee8bc9b6b8a7dd908a5bc41..c9813f3c6d66f6b6c7a7e886e299772594b40d68`

## Findings

No open findings.

Boundary attempt 1 found one blocking operational regression: the native
public-Cask smoke workflow still pinned immutable RC.1 after the public tap had
advanced to immutable RC.2. `.github/workflows/homebrew-cask-smoke.yml:7-116`
now pins retained preparation run `33234514595` and `v0.1.0-rc.2`, preserves
RC.1 history, and triggers when the v2 Cask implementation changes. Hosted run
33333444342 passes public installation and local upgrade on ARM64 and Intel.

## Reviewed risk areas

- `cli/src/plugin/hosted-publication-v2.js:187-316` revalidates every authority
  consumed by finalization and publication, including the complete Plugin tree,
  final DMG, native evidence, trust facts, plan bytes, generated outputs, and
  ordered receipt prefix.
- `cli/src/plugin/hosted-publication-v2.js:397-478` runs all remote preflights
  before mutation, records approval against the sealed digest, persists a
  receipt after each converged surface, and verifies the packet after each
  write. Retry skips recorded surfaces and exact remote preflights reject drift.
- `cli/src/plugin/coordinated-publication.js:121-181` prevents the retained
  Plugin transport from forcing an equal-different or newer marketplace
  deployment, while allowing the exact completed identity.
- `.github/workflows/coordinated-release-publish.yml:43-190` separates the
  read-only protected rehearsal from real publication and references no Apple
  secret. Successful finalization run, source SHA, packet name, plan digest,
  and environment approval are all required.
- `cli/src/plugin/homebrew-cask-v2.js:132-224,260-410` validates complete
  primary linkage and Cask state consistency. The Cask publisher uses the
  existing deterministic PR transport, and a completed record must still match
  the public tap.
- `.github/workflows/homebrew-cask-publish.yml:43-174` gives the dry run no
  publication token and exposes the tap-limited token only to the real Cask
  publication step.

## Residual risk and test gaps

- No live protected v2 finalization or publication workflow was dispatched;
  P9 must prove environment custody and zero public mutation with a fresh RC.
- Direct public-DMG install/launch proof is deliberately a named human
  attestation collected only after primary publication. The future Cask
  operation must retain the actual timestamp and confirmer accurately.
- GitHub emits existing `actions/*@v4` Node-runtime deprecation notices. They
  do not affect this diff's behavior but warrant a separate repository-wide
  action-version maintenance pass.
