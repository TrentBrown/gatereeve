# Verification - PR #12

**Scope:** Apple trust boundary P6 / I-9 keychain-discoverability follow-up

**Pinned base:** `8a93f4a1ad31f5b77fdea061ff6c8a7f9b5d82df`

**Pinned head:** `6d3ef5da66e2286e5067b23df70fc1cef12ded8c`

## Verification matrix

| Category | Command or evidence | Result |
|---|---|---|
| Build/typecheck | Hosted `Universal macOS package` job | PASS - the universal candidate built and its package contract passed at the pinned head |
| Changed-file syntax and format | Python safe YAML parse plus `git diff --check` | PASS |
| Focused unit/contract test | `node --test cli/test/coordinated-workflow.test.js` | PASS - the workflow must preserve, extend, restore, and clean up the user keychain search list |
| Full Plugin acceptance | `bash ci/portable-acceptance.sh` locally | ENVIRONMENT-LIMITED - 116/117 Node tests passed; the unrelated offline-bundle test could not spawn this container's missing `unzip` executable |
| Hosted Plugin acceptance | Ubuntu 22.04/24.04 acceptance and container jobs | PASS - both hosted environments include the required archive utility and pass the complete portable suite |
| Feature-document validation | `lint_issues.py`, `lint_tracker.py`, and `validate_branch_docs.py` | PASS |
| Hosted Desktop regression | Contract and source-runtime jobs on Ubuntu 22.04, Ubuntu 24.04, and macOS | PASS |
| Native package regression | Universal macOS package plus exact-DMG runtime on Apple Silicon and Intel | PASS - all thirteen PR checks pass |
| API/database/webhook/cross-repository integration | No API, database, webhook, or cross-repository contract changed | N/A |
| Protected Apple runtime | Corrected `desktop-trust` job | PENDING POST-MERGE - protected environment policy permits `main`, so the nonpublishing rehearsal must use the merged workflow |

## Failure reproduction and correction

Protected rehearsal run
[#33135027205](https://github.com/TrentBrown/gatereeve/actions/runs/33135027205)
proved that configuration validation, `.p12` import, key partition access, and
exact Developer ID identity discovery all passed. Electron then invoked
`codesign` with that identity's SHA-1 fingerprint and the explicit temporary
keychain, but macOS returned `The specified item could not be found in the
keychain`.

The corrected workflow captures `security list-keychains -d user`, prepends the
ephemeral keychain before package signing, and restores the captured list in
the unconditional cleanup step before deleting the keychain and credential
files. The explicit keychain path remains in Electron's signing command.

## Known failures

No product or hosted failure remains at the pinned head. The local container's
missing `unzip` executable affects one unrelated offline bundle test; the same
test passes in both hosted Ubuntu acceptance jobs and both container jobs.

## Pending operational verification

After PR #12 merges to `main`, dispatch a fresh nonpublishing coordinated
preparation with `apple_trust=true`, approve `release-publication`, and require
Developer ID signing, notarization, stapling, Gatekeeper assessment, trusted
ARM64/Intel runtime verification, and coordinated-record assembly to pass.
