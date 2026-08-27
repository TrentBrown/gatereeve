# Verification - PR #7

**Scope:** Runtime foundation slice P1-P2 / I-1

**Pinned base:** `7f18ba15e9d2d224557fde454e432ab9f44d7606`

**Pinned head:** `26e86a4ee9f63a958fae6b8026b540cf17939470`

## Verification matrix

| Category | Command or evidence | Result |
|---|---|---|
| Build/typecheck | No production build or typecheck command exists before the planned packaging slice; `node --check apps/desktop/main/index.js` and `node --check apps/desktop/scripts/create-smoke-fixture.mjs` | PASS for applicable syntax checks; packaged build N/A in this slice |
| Lint/format | `git diff --check`; YAML parse of `.github/workflows/plugin-ci.yml`; portable `plugin lint --json` inside `ci/portable-acceptance.sh` | PASS |
| Unit tests | `npm test` in `apps/desktop` | PASS — 39/39 |
| Unit and integration tests | `PATH=<temporary-unzip-shim> bash ci/portable-acceptance.sh` | PASS — CLI 109/109, pattern Python 28/28, workflow Python 64/64, smoke-template Python 2/2, audit clean, package validation/build reproducible |
| Resolver migration | `node --test test/context-parity.test.js test/stage-protocol.test.js` in `cli` | PASS — configured, explicit multi-repository, legacy, symlinked-config, invalid-config, and staging cases |
| Optional dependencies | Desktop observer tests with `gitExecutable: null` and `ghExecutable: null` | PASS — no bare command execution; local state remains readable |
| Integration | Canonical protocol packaging and identical Codex/Claude protocol inventory in portable acceptance | PASS |
| End-to-end/browser | Renderer integration consumes a real canonical governed feature without journal mutation | PASS in Desktop suite |
| Application runtime | GitHub checks `Desktop runtime on Ubuntu 22.04`, `Ubuntu 24.04`, and `macOS` launch Electron against a generated governed fixture with no Python context subprocess or optional CLI | PASS at the exact PR head |
| Supported Ubuntu behavior | GitHub portable and container acceptance on Ubuntu 22.04 and 24.04 | PASS at the exact PR head |

## Environment note

The NUC image lacks the external `unzip` program expected by one existing
release-bundle test. Local portable acceptance used an untracked temporary shim
that implements `unzip -Z1` through Python's standard `zipfile` module and
delegates extraction to the installed BusyBox. The shim was deleted afterward.
GitHub's exact-head acceptance jobs provide the authoritative supported-runner
result.

## Known failures

None.

## Pending verification

Exact packaged-byte execution without a separate Node runtime remains P4 / I-3,
because this slice does not yet create an application bundle or DMG. R2
therefore advances but does not move to `PASS`.
