# Verification - PR #1

**Scope:** slice
**Base:** `d9127d89c55c667c83876854ccf0fef053aec585`
**Evaluated source:** `8f30769b6e3928735c786cbf64b48d09e949ec91`
**Result:** PASS WITH MANUAL VERIFICATION

## Verification Matrix

| Category | Result | Command or evidence |
|---|---|---|
| Build/package composition | PASS | `node cli/bin/workflow.js plugin build --source-commit 8f30769b6e3928735c786cbf64b48d09e949ec91 --json`; Codex and Claude packages each contain 157 files and share protocol hash `sha256:fb8898fed634dd6f5f406db44530a8851565ce666142fd54313412485d218509` |
| Contracts and lint | PASS | `node cli/bin/workflow.js plugin validate`; `node cli/bin/workflow.js plugin lint`; `node cli/bin/workflow.js plugin validate-native`; 27 skills, 152 canonical shared files, and both native platform packages validated |
| JavaScript unit/integration | PASS | `PATH="/tmp/gatereeve-unzip-shim:$PATH" npm test --prefix cli`; 95 passed, 0 failed |
| Python helper unit/integration | PASS | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s plugin-src/shared/resources/scripts/tests -p 'test_*.py'`; 64 passed |
| Pattern helper regression | PASS | From `plugin-src/shared/resources/scripts`: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s pattern/tests -p 'test_*.py'`; 28 passed |
| Plugin smoke template | PASS | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s plugin-src/shared/resources/templates/plugin-smoke -p 'test_*.py'`; 2 passed |
| Dependency audit | PASS | `npm audit --prefix cli --audit-level=high`; 0 vulnerabilities |
| Branch documents | PASS WITH PENDING TRIAGE | `validate_branch_docs.py`, `lint_issues.py`, and `lint_tracker.py` pass; decision [5] awaits promotion or dismissal before `gate_triage.py` can pass |
| Integration behavior | PASS | CLI/plugin parity, installed-CLI staging, deterministic replay, migration recovery, full lifecycle, boundary DAG, post-review freshness, change governance, merge-content verification, and native-package tests are included in the passing suites |
| Database/API/cross-repo | N/A | No database, network API, webhook, or cross-repository data contract changed |
| Browser/runtime | PASS WITH LIMIT | The static site loaded through a local HTTP server. At 1280x800 and iPhone 12 Pro 390x844 viewports, `#protocol-state` was visible, complete, and had no horizontal overflow. Collaborative snapshot image capture failed, so a visual screenshot review remains manual |
| Native agent runtime | PASS WITH LIMIT | Deterministic native package and doctor simulations pass for Codex and Claude. This host has no `claude` executable, so the live Claude fresh-session smoke remains manual |

The host does not provide the external `unzip` command required by the release
bundle test. The complete JavaScript suite therefore used a temporary,
test-only shim backed by Python `zipfile` and BusyBox extraction. Product code
does not use the shim, and supported Ubuntu installation documentation already
lists `unzip` as a prerequisite.

An initial pattern-test invocation from the repository root failed to import
its sibling `pattern` package. Rerunning the documented suite from the scripts
directory passed all 28 tests; this was a runner working-directory error, not a
product failure.

## Known Unrelated Baseline Failure

The repository-wide `ci/portable-acceptance.sh` reaches its historical-document
phase after the feature tests, audits, builds, and native simulations pass, then
fails because the unchanged baseline does not contain
`docs/issues/tb-build-plugins/spec.md`.

## Manual Verification

1. On a host with Claude Code installed and authenticated, run the documented
   fresh-session behavioral smoke in `docs/PLUGIN-SMOKE-TEST.md` against the
   composed Claude package.
2. Open `workflow-site/index.html#protocol-state` and visually inspect desktop
   and narrow mobile layouts; confirm the seven-state rows remain legible and
   collapse cleanly.
