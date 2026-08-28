# Verification - PR #14

**Scope:** Apple trust boundary P6 / I-11 artifact-layout follow-up

**Pinned base:** `9508c5ac0f523a046fc52bc250acd95a3882eabf`

**Pinned head:** `8c8337b1f435fc88fa4c4491e54ed11ae49b675a`

## Verification matrix

| Category | Command or evidence | Result |
|---|---|---|
| Changed-file syntax and format | `git diff --check` | PASS |
| Focused workflow contract | `node --test cli/test/coordinated-workflow.test.js` | PASS - staging, both exact copies, one-root upload, and removal of the multi-root upload contract are pinned |
| Full Plugin acceptance | `PYTHONDONTWRITEBYTECODE=1 npm test --prefix cli` locally | ENVIRONMENT-LIMITED - 116/117; only the unrelated offline-bundle test cannot spawn this container's missing `unzip` executable |
| Hosted Plugin acceptance | Ubuntu 22.04/24.04 acceptance and container jobs | PASS - complete suite with archive tooling installed |
| Feature-document validation | `validate_branch_docs.py` | PASS after decision triage |
| Hosted Desktop regression | Contract, runtime, and universal macOS package jobs | PASS at the pinned head |
| API/database/webhook/cross-repository integration | No such contract changed | N/A |
| Protected Apple runtime | Corrected `desktop-trust` plus ARM64/Intel trusted verification | PENDING POST-MERGE - the protected environment accepts only `main` |

## Live trust evidence

Protected run
[#33140536129](https://github.com/TrentBrown/gatereeve/actions/runs/33140536129)
used source `9508c5ac0f523a046fc52bc250acd95a3882eabf` and candidate
`v0.1.0-rc.3`. It passed protected configuration, ephemeral credential import,
Developer ID signing, Apple notarization (`Accepted`), stapling, Gatekeeper
assessment, artifact upload, and credential cleanup. The downloaded trust
record identifies a 246,131,160-byte DMG with SHA-256
`c7d0a772110748f98e9ccd5e6185bde12776be1c7fbd2f39e58f35292c2257d6`.

Both native jobs then failed before mounting the DMG because the artifact
contained `_temp/apple-trust.json` and
`gatereeve/gatereeve/apps/desktop/dist/macos/GateReeve-0.1.0-rc.3-macos-universal.dmg`,
while the consumers intentionally use flat paths. PR #14 stages those same
bytes under one root before upload.

## Mutation check

The workflow retained read-only repository permissions. Candidate tag and
GitHub release `v0.1.0-rc.3` are absent.

## Pending operational verification

After merge, repeat the nonpublishing protected preparation and require the
flat artifact, trusted native ARM64/Intel runtime evidence, and immutable
trusted coordinated record to pass.
