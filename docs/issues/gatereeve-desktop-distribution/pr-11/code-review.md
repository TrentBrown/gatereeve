# Code Review - PR #11

**Pinned range:** `20b555eb6abeae051b32cfc309321478c196337a..34d272628b42662b2f0781175b9ebcc7da98b63e`

## Findings

No findings.

The review traced the protected workflow from candidate creation through
credential import, Developer ID package creation, notarization, cleanup,
native verification, and coordinated-record assembly. It also inspected the
trust schemas and their negative tests, the existing publication-readiness
guard, the package-signing options, and the maintainer runbook.

The important boundaries are coherent:

- `.github/workflows/coordinated-release-prepare.yml:21` retains repository
  `contents: read`, and line 197 is the only job with protected credentials.
- `.github/workflows/coordinated-release-prepare.yml:307` performs unconditional
  temporary credential/keychain cleanup.
- `apps/desktop/scripts/notarize-macos.mjs:57` validates the exact identity and
  team before submission; lines 107-137 accept only complete Apple evidence.
- `cli/src/plugin/coordinated-release.js:96-159` rejects altered bytes,
  incomplete trust, and contradictory evidence ordering before record creation.
- The two trusted native jobs consume the same uploaded DMG and trust evidence,
  and record preparation requires both results.

## Residual risks and test gaps

- The real `.p12`, G2 chain, team API key, and Apple notarization service have
  not yet executed inside GitHub Actions because the protected environment is
  deliberately limited to `main`. This is the explicit post-merge
  nonpublishing rehearsal.
- The signing job is intentionally tested through command-contract doubles,
  not secret-bearing PR CI. The test gap is bounded by protected workflow
  approval, exact evidence validation, and the fact that no publication
  permission exists.
- The local NUC lacks `unzip`; hosted Ubuntu and container checks cover the
  otherwise passing acceptance suite.
