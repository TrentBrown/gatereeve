# Verification - PR #9

**Scope:** Identity and universal DMG slice P4 / I-3

**Pinned base:** `9ccee2ae49de3d2cb03b702da05f6cdcea432495`

**Pinned head:** `0eebfb89b76355c9e49e1a41a32d3c6f8eacfd4b`

## Verification matrix

| Category | Command or evidence | Result |
|---|---|---|
| Build/typecheck | `node --check` for all four new macOS packaging scripts | PASS |
| Package build | GitHub job `Universal macOS package` on `macos-15` | PASS - generated `GateReeve-0.1.0-macos-universal.dmg`, 243,571,641 bytes, SHA-256 `fc3c007d679b70e0b6d9604e942bdcd0a6b3144283a7c1b526b98ca1d6c7fe4a` |
| Artifact continuity | GitHub Actions artifact `gatereeve-universal-dmg`, ID `9661075538` | PASS - both native jobs downloaded artifact digest `sha256:0f29101b22a844a5610937d1e7f5b346b1c51fbaa105a118422924fc1e21b6fb` |
| Lint/format | `git diff --check`; `npx --yes yaml-lint ../../.github/workflows/plugin-ci.yml` from `apps/desktop` | PASS |
| Desktop unit/integration | `npm test` in `apps/desktop` | PASS - 61/61 |
| Package contract | `macos-package.test.js` through the Desktop suite | PASS - pinned icon digest/dimensions, permanent identity, universal target, standard iconset, runtime-only staging, and Applications link |
| Package inspection | `verify-macos-package.mjs` on the mounted exact DMG | PASS - plist name/ID/version/icon, all main/framework/helper Mach-O slices, deep ad-hoc signature, required ASAR resources, prohibited runtime exclusions, and DMG link |
| Application runtime | `Packaged runtime on Apple Silicon` using `--native-architecture arm64` | PASS - exact mounted DMG observed a real governed fixture and rendered Setup, then exited cleanly |
| Application runtime | `Packaged runtime on Intel` using `--native-architecture x64` | PASS - the same artifact observed the same real governed-fixture contract and exited cleanly |
| Source runtime regression | GitHub Desktop runtime jobs on macOS, Ubuntu 22.04, and Ubuntu 24.04 | PASS at the pinned head |
| Supported Ubuntu behavior | GitHub acceptance, container, Desktop contract, and Desktop runtime jobs on Ubuntu 22.04 and 24.04 | PASS at the pinned head |
| Dependency audit | `npm install` / `npm ci` audit for Desktop dependencies | PASS - zero vulnerabilities |
| API/database/cross-repository integration | No API, database, webhook, or cross-repository contract changed | N/A |

## Packaged-runtime proof

The packaging stage copies only `main`, `preload`, `renderer`, the staged
canonical protocol resources, shared contracts, and the approved icon into an
ASAR with no runtime dependencies. Verification rejects Python files and
development `node_modules`, scripts, tests, and visual fixtures. Native smoke
launches `Contents/MacOS/GateReeve` with a Finder-like system PATH, no
`ELECTRON_RUN_AS_NODE` or `NODE_OPTIONS`, an isolated preference directory, and
the existing real governed fixture.

The ARM and Intel jobs download artifact ID `9661075538`; neither rebuilds or
repackages it. Each mounts the DMG read-only, verifies every inspected Mach-O
contains exactly `arm64` and `x86_64`, checks the conventional `/Applications`
shortcut, and runs the app on its native host architecture.

## Environment note

The NUC cannot build or run a macOS package. It also lacks the external
`unzip` executable used by one existing CLI release-bundle test, so a local
`ci/portable-acceptance.sh` run reached 108/109 CLI tests before that unrelated
spawn failed. The exact pinned head passed both complete hosted acceptance jobs
and both container jobs without accommodation. Hosted macOS is the
authoritative package and native-runtime evidence.

## Known failures

None at the pinned head. GitHub reports non-blocking deprecation warnings for
the repository's existing v4 JavaScript actions; the runner executes them with
Node 24.

## Pending verification

Developer ID signing, notarization, stapling, Gatekeeper acceptance, and public
download are explicitly P6-P8. This slice intentionally verifies an ad-hoc
development candidate and does not publish it to a release, website, update,
or Cask surface.
