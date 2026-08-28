# Verification - PR #13

**Scope:** Apple trust boundary P6 / I-10 package-result follow-up

**Pinned base:** `f87c03b02acccf0cf54e6f6272a5597d5b6429de`

**Pinned head:** `1bc933e8d7fb7e283195b6921a295ae56cf27cb6`

## Verification matrix

| Category | Command or evidence | Result |
|---|---|---|
| Build/typecheck | Hosted `Universal macOS package` job | PASS - universal packaging passes at the pinned head |
| Changed-file syntax and format | YAML safe parse and `git diff --check` | PASS |
| Desktop unit/integration | `npm test --prefix apps/desktop` | PASS - 67/67, including dedicated result-file and legacy stdout behavior |
| Focused workflow contract | `node --test cli/test/coordinated-workflow.test.js` | PASS - protected packaging requires `--result-file` and forbids stdout redirection into the JSON file |
| Full Plugin acceptance | `PYTHONDONTWRITEBYTECODE=1 npm test --prefix cli` locally | ENVIRONMENT-LIMITED - 116/117; only the unrelated offline-bundle test cannot spawn this container's missing `unzip` executable |
| Hosted Plugin acceptance | Ubuntu 22.04/24.04 acceptance and container jobs | PASS - complete suite with archive tooling installed |
| Feature-document validation | `lint_issues.py`, `lint_tracker.py`, and `validate_branch_docs.py` | PASS |
| Native package regression | Universal macOS package and exact-DMG runtime on Apple Silicon and Intel | PASS at the pinned head |
| API/database/webhook/cross-repository integration | No such contract changed | N/A |
| Protected Apple runtime | Corrected `desktop-trust` job | PENDING POST-MERGE - the main-only protected environment requires the merged workflow |

## Live failure evidence

Protected run
[#33138565845](https://github.com/TrentBrown/gatereeve/actions/runs/33138565845)
passed configuration, credential import, exact identity discovery, and the
Developer ID-signed universal package command. Because the step uses Bash
`-e`, its subsequent parser could run only after packaging returned success.
The parser then rejected a file beginning with Electron Packager's progress
line rather than JSON.

The correction preserves human-readable progress and writes only the final
package result to the path supplied by `--result-file`. Existing direct callers
without that option retain the prior stdout JSON result.

## Known failures

No product or hosted failure remains at the pinned head. The local container's
missing `unzip` affects one unrelated bundle test covered by passing hosted
acceptance and container jobs.

## Pending operational verification

After merge, run a fresh nonpublishing protected preparation and require result
parsing, notarization, stapling, Gatekeeper, trusted ARM64/Intel runtime, and the
coordinated record to pass.
