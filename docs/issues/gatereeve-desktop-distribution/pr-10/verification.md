# Verification - PR #10

**Scope:** Coordinated release and recovery slice P5 / I-4

**Pinned base:** `3a340e3e33791d08934c783ca0d0ac2fe1c97a0b`

**Pinned head:** `fd9eddd37b6b7a0bfebf9936b6685c080a2a777f`

## Verification matrix

| Category | Command or evidence | Result |
|---|---|---|
| Full Plugin acceptance | `PATH="/tmp/gatereeve-unzip-wrapper:$PATH" bash ci/portable-acceptance.sh` | PASS - 116/116 Node tests, 94/94 Python tests, package validation, deterministic builds, native-manager lifecycle, Codex and Claude disposable smoke, and documentation lint |
| Desktop regression | `npm test --prefix apps/desktop` | PASS - 62/62 |
| Coordinated model | `node --test cli/test/coordinated-release.test.js cli/test/coordinated-workflow.test.js` | PASS - immutable candidates, evidence hashes, exact stable lineage, state invariants, unsafe-path rejection, and every fault boundary |
| Dependency audit | Plugin acceptance `npm audit`; existing Desktop install audit | PASS - zero known vulnerabilities |
| Syntax and format | Node syntax checks, Python YAML parse, and `git diff --check` | PASS |
| Hosted Ubuntu acceptance | GitHub Ubuntu 22.04 and 24.04 acceptance plus container jobs | PASS at the pinned head |
| Hosted Desktop regression | GitHub source runtime, contract, universal package, and native packaged-runtime jobs | PASS at the pinned head |
| API/database/cross-repository integration | No API, database, webhook, or cross-repository contract changed | N/A |

## Release-boundary proof

Preparation resolves one source commit before either candidate job runs. The
Plugin tree, universal DMG, and native ARM64/Intel evidence are copied into a
fresh workspace and checksummed. The resulting publication plan has one stable
digest and one fixed order. The existing public Plugin command now requires
that exact workspace, complete Apple trust, and an approval matching the plan;
`--yes` cannot bypass these checks.

Fault injection covers interruption after each remote mutation but before the
local completion receipt is written. On retry, each adapter converges the
already-created identity, the record advances in order, and every remote
surface has exactly one mutation. Stable preparation rejects a different
commit and record validation rechecks the RC lineage on every read.

## Environment note

The NUC does not have Docker or macOS packaging tools. Local full acceptance
uses a temporary Info-ZIP-compatible `unzip` wrapper because this host lacks
the external executable. The exact pinned head is therefore also required to
pass the repository's hosted Ubuntu container and macOS package matrices. The
new manual preparation workflow cannot be dispatched until it exists on the
default branch; its components and no-publication policy are covered here, and
the first protected candidate run belongs to the subsequent Apple-trust work.

## Known failures

None at the pinned head. The first hosted attempt exposed that the acceptance
image omitted the new workflow fixture; commit `4c451be` added it. Review then
strengthened stable-lineage and state validation in `fd9eddd` before this
boundary was pinned.

## Pending verification

Developer ID enrollment, signing, notarization, stapling, Gatekeeper, protected
approval, and live public convergence are P6 and P8. Update behavior and Cask
distribution remain P7 and P9-P10 respectively.
