# Verification - PR #11

**Scope:** Apple trust boundary P6 / I-5

**Pinned base:** `20b555eb6abeae051b32cfc309321478c196337a`

**Pinned head:** `34d272628b42662b2f0781175b9ebcc7da98b63e`

## Verification matrix

| Category | Command or evidence | Result |
|---|---|---|
| Build/typecheck | `npm run package:mac --prefix apps/desktop` in hosted Universal macOS package CI | PASS - the universal ad-hoc candidate built and its package contract passed at the pinned head |
| Changed-file syntax and format | Node syntax checks, workflow YAML parse/contract tests, documentation bash-block parse, and `git diff --check 20b555e..34d2726` | PASS |
| Desktop unit and integration | `npm test --prefix apps/desktop` | PASS - 66/66, including signing configuration, codesign parsing, notarization orchestration, evidence validation, packaging, runtime, and renderer regression coverage |
| Coordinated trust integration | `node --test cli/test/coordinated-release.test.js cli/test/coordinated-workflow.test.js cli/test/developer-documentation.test.js` | PASS - 11/11 focused tests |
| Full Plugin acceptance | `bash ci/portable-acceptance.sh` | ENVIRONMENT-LIMITED locally - 116/117 Node tests passed; the unrelated offline-bundle test could not spawn the host's missing `unzip` executable. Hosted Ubuntu 22.04/24.04 acceptance and container jobs pass the same suite with Info-ZIP installed |
| Hosted Desktop regression | GitHub source runtime, contract, universal package, and native packaged-runtime jobs on Ubuntu, Apple Silicon, and Intel | PASS at the pinned head |
| Live Apple credential readiness | Account Holder walkthrough plus `security find-identity` and `xcrun notarytool history` on the maintainer Mac | PASS - one valid Developer ID Application identity and authenticated team API key; an empty notarization history is valid |
| Protected configuration | GitHub `release-publication` environment | PASS - required reviewer, `main`-only policy, four environment variables, and three environment secrets are configured; values were checked by name without exposing secret content |
| API/database/webhook/cross-repository integration | No API, database, webhook, or cross-repository application contract changed | N/A |
| Application runtime | Hosted exact-DMG ARM64 and Intel governed-fixture smoke | PASS for the development candidate; the trusted-DMG repeat is the post-merge protected rehearsal |

## Security and trust boundary proof

The ordinary candidate jobs complete without protected credentials. Only the
`desktop-trust` job references `release-publication`; it has repository
`contents: read`, waits for environment approval, materializes credentials in
runner-temporary files, imports the identity into an ephemeral keychain, and
deletes both files and keychain in an `always()` cleanup step.

The notarization path verifies the application and DMG identity, team,
hardened runtime, and secure timestamps before submission. It accepts only an
Apple `Accepted` result, staples and validates the exact DMG, runs Gatekeeper,
and hashes the resulting bytes. Independent ARM64 and Intel jobs re-run the
signature, staple, Gatekeeper, universal-binary, package, and governed-runtime
checks against those same bytes. The coordinated record accepts the trusted
state only when both native evidence documents agree exactly.

## Known failures

No product or hosted failure remains at the pinned head. The first hosted
attempt exposed that `Dockerfile.acceptance` omitted the new Apple runbook;
commit `40ca7c2` repaired the acceptance image. The current NUC's missing
`unzip` executable is an environment limitation covered by passing hosted
acceptance and container jobs.

## Pending manual/operational verification

The protected workflow entry point exists only on this branch, while the
environment policy permits `main` only. After PR #11 merges, dispatch one
nonpublishing RC preparation from merged `main` with `apple_trust=true`, approve
the environment job, and require the notarization, stapling, Gatekeeper,
ARM64/Intel runtime, and coordinated-record jobs to pass. This does not publish
a tag or public artifact. R5 remains `NOT YET` until that rehearsal and the
later public RC/final verification slices are complete.
