# Verification - PR #8

**Scope:** Setup and compatibility slice P3 / I-2

**Pinned base:** `dae5c536fc1d90b17a5d7397f34a6a9fc0d8cb4f`

**Pinned head:** `a5a8e93ad16d206861c1f8845823bd9ca309b52f`

## Verification matrix

| Category | Command or evidence | Result |
|---|---|---|
| Build/typecheck | `node --check main/index.js && node --check main/setup-observer.js && node --check renderer/renderer.js` in `apps/desktop` | PASS |
| Package composition | `npm pack --dry-run --json` in `apps/desktop` | PASS — 49 files; Setup observer, compatibility code/metadata, preload, renderer, and staged protocol are present |
| Lint/format | `git diff --check`; portable Plugin `validate`, `validate-native`, and `lint` inside `ci/portable-acceptance.sh` | PASS |
| Desktop unit/integration | `npm test` in `apps/desktop` | PASS — 56/56 |
| Repository integration | `PATH=<temporary-unzip-shim> PYTHONDONTWRITEBYTECODE=1 bash ci/portable-acceptance.sh` | PASS — CLI 109/109, pattern Python 28/28, workflow Python 64/64, smoke-template Python 2/2, zero audit vulnerabilities, deterministic native composition |
| Setup adapter matrix | `setup-observer.test.js`, `setup-compatibility.test.js`, `executable-discovery.test.js`, and `coordinator.test.js` through the Desktop suite | PASS — selected-only probes; matched, compatible, incompatible, missing, disabled, unavailable, unknown-version, one-of-two-ready, and selection-change cases |
| End-to-end/browser | `setup-renderer.test.js` plus governed renderer integration in the Desktop suite | PASS — first launch, recheck, copy-only remediation, historical/offline access, and mixed selected-agent presentation |
| Live local detection | `createSetupObserver({ metadata })(['codex'])` against the installed native manager | PASS — Codex 0.150.1 authenticated; Plugin 0.1.0-rc.2 enabled and explicitly compatible; Git, Python, Node, and authenticated `gh` present |
| Application runtime | GitHub `Desktop runtime` jobs on Ubuntu 22.04, Ubuntu 24.04, and macOS | PASS at the exact pinned head |
| Supported Ubuntu behavior | GitHub acceptance, container, and Desktop contract jobs on Ubuntu 22.04 and 24.04 | PASS at the exact pinned head |
| API/database/cross-repository integration | No API, database, webhook, or cross-repository contract changed | N/A |

## Read-only proof

The adapter tests capture every executed argument and reject installation,
enablement, disablement, removal, upgrade, or GateReeve CLI invocation. Native
manager commands exposed by Setup are inert text copied only after an explicit
button press. The IPC allow-list contains no general process-execution or
workflow-mutation channel.

## Environment note

The NUC image does not provide the external `unzip` executable used by one
existing release-bundle test. Portable acceptance used a temporary, untracked
shim implementing the exercised `-Z1`, `-p`, and extraction behavior with
Python's standard `zipfile` module. The shim and the artifact left by its first
incomplete version were deleted. Supported GitHub runners passed without that
local accommodation.

The NUC also lacks the libraries and virtual display needed for a local
Electron launch. Exact-head Electron runtime checks on macOS and both supported
Ubuntu releases are the authoritative application-runtime evidence.

## Known failures

None.

## Pending verification

Universal packaged-byte execution is P4 / I-3 and is intentionally outside this
source-level Setup slice.
