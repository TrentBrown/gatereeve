# Spec Evaluation - workflow-state-machine-cli

**Scope:** Complete feature implementation, outside a formal PR boundary
**Evaluated:** 2026-08-25
**Result:** PASS WITH MANUAL VERIFICATION

## Completion Report

### Definition of Done

- **Build status:** PASS - both native packages composed deterministically.
- **Lint status:** PASS - contracts, portability, native sources, docs, and
  changed-file whitespace checks passed.
- **Tests written:** JavaScript protocol/CLI suites, Python merge verifier,
  SessionStart mode discovery, Node doctor version checks, and package parity.
- **Test suite status:** PASS - 95 JavaScript, 64 Python helper, 28 pattern,
  and 2 plugin-smoke tests passed.
- **Integration verified:** Yes - plugin adapter, optional installed CLI,
  sequential feature-final lifecycle, and both native package layouts.
- **Application runs:** Yes with limits - installed CLI and static HTTP site
  ran; live Claude manager and visual browser inspection remain pending.
- **Pending manual verification:** Live Claude native-manager smoke and visual
  responsive inspection, with exact steps below.

## Verification Matrix

| Category | Result | Evidence |
|---|---|---|
| Build/package composition | PASS | `node cli/bin/workflow.js plugin build --source-commit <HEAD> --json`; both native packages contained 157 files and the identical canonical protocol hash |
| Contract validation | PASS | `plugin validate`, `plugin validate-native`, and `plugin lint`; 27 skills, both platforms, and 152 canonical files validated |
| JavaScript unit/integration | PASS | `PATH=<unzip-shim> npm test` in `cli/`; 95/95 tests passed |
| Python unit/integration | PASS | scripts suite 64 tests, pattern suite 28 tests, and plugin-smoke template suite 2 tests passed |
| Dependency audit | PASS | `npm audit --prefix cli --audit-level=high`; zero vulnerabilities |
| Documentation | PASS | Developer/install documentation contract tests passed; all documented Bash blocks parsed |
| Optional CLI distribution | PASS | `npm pack`, isolated `npm install`, and installed `gatereeve graph --model --format json` returned the `gatereeve/workflow` model with 30 nodes |
| Native packages | PASS WITH LIMIT | Deterministic structural smoke passed for Codex and Claude packages; real Codex native-manager install passed, but the host has no `claude` executable for the matching live-manager check |
| Static workflow site | PASS WITH LIMIT | Local HTTP runtime and structural checks found the feature and slice state-machine views with unique IDs and accessible labels; the collaborative browser client failed to navigate, so visual responsive inspection remains manual |
| Repository-wide portable acceptance | UNRELATED BASELINE FAILURE | All feature tests, audits, package builds, and simulated native doctor checks passed; the final historical-doc phase then failed because `docs/issues/tb-build-plugins/spec.md` is absent from the unchanged baseline |

The release-bundle test requires the external `unzip` program. The host lacks
it, so the complete JavaScript suite was also run with a temporary test-only
shim backed by Python `zipfile` and BusyBox extraction. No product source uses
that shim; `INSTALL.md` already lists `unzip` for supported Ubuntu installs.

## Acceptance Criteria

| # | Status | Evidence |
|---|---|---|
| AC1 | PASS | `feature-store.test.js` covers successful, failure-injected, legacy, and inconsistent initialization; `feature.js` creates model lock, journal, and interview atomically |
| AC2 | PASS | Contract, journal, corruption, compatibility, deterministic hash/replay, migration preview, confirmed migration, and interrupted recovery tests pass |
| AC3 | PASS | `lifecycle.test.js` covers declared feature/slice transitions, rejection without append, one active slice, sequential slices, suspension, review, merge, and closeout |
| AC4 | PASS | `boundary-protocol.test.js` covers DAG ordering, outcomes, N/A, waivers, fingerprints, staleness, reruns, remediation attempts, and review rejection |
| AC5 | PASS | Feature-final routing is asserted in sequential lifecycle tests; `test_merge_verified.py` covers ancestry and exact changed-path tree verification |
| AC6 | PASS | `changes.test.js` covers durable design/spec/plan/slice change authority, blockers, invalidation, application, validation, and renewed implementation authorization |
| AC7 | PASS | Observer and CLI tests cover stable JSON/human views, history, current/model graphs, read-only behavior, blockers, freshness input, next actions, and binary `check` exits |
| AC8 | PASS | Plugin-adapter parity, installed optional CLI, SessionStart mode discovery, native composition, maintainer namespace, no-force, and no-side-effect contracts pass |

## Rubric Evaluation

| # | Result | Scope | Notes |
|---|---|---|---|
| R1 | PASS | Complete | Atomic initialization and legacy coexistence covered |
| R2 | PASS | Complete | Validation and deterministic replay fail closed |
| R3 | PASS | Complete | Pinned model, previewed impact, human confirmation, and recovery covered |
| R4 | PASS | Complete | Feature and slice lifecycle, illegal passage, and one-active-slice invariant covered |
| R5 | PASS | Complete | Pause/resume and feature-scoped implementation authority covered |
| R6 | PASS | Complete | Boundary dependency, evidence, freshness, waiver, and attempt history covered |
| R7 | PASS | Complete | Feature-final scope routing and merge content proof covered |
| R8 | PASS | Complete | Discovered-change lifecycle and sparse human authority covered |
| R9 | PASS | Complete | Observer, Mermaid/JSON graph, envelope, no-mutation, and exit contracts covered |
| R10 | PASS | Complete | Plugin-local core, CLI parity/distribution, SessionStart, native package parity, and operational exclusions covered |

## Pending Manual Verification

1. On a machine with both native agents installed and authenticated, run
   `gatereeve plugin smoke-install --json` and confirm both live managers pass.
2. Open `workflow-site/index.html`, inspect `#protocol-state` at desktop and a
   narrow mobile width, and confirm the seven-state rows collapse cleanly.
