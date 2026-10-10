# Verification — PR #74 attempt 4

Pinned source: 7dbf4741bb69c726d4636ec316284d8de2f4bb77; base: 174bcc60465fdd9494f8cfb9b5bdbf8e03b11b93. All source tests ran on this exact content before its source commit (only verification prose changed at commit).

# Provisional Verification - tb-closed-pr-workflow

## Local implementation checks

- CLI suite: 278 tests passed in final portable acceptance.
- Desktop suite: 206 tests passed, including sandboxed Electron checks.
- Python lifecycle regression suite: 23 tests passed, including native Git fixtures, authorization, head drift, closure failure, re-closure and archive decoding.
- Gate-adapter suite: 9 tests passed.
- Plugin validate and lint passed; branch docs and decision-triage validators passed.
- Full portable acceptance passed (Darwin arm64, Python 3.11.11, Node v26.0.0), including 96 workflow Python tests, 28 pattern tests, plugin smoke tests, dual-platform builds and determinism checks.

## Scope

No dependency manifests changed. Desktop dependency install reported existing high-severity advisories; no dependency remediation was requested or introduced. CLI audit is clean. Release and installation have not occurred.

Closed-PR branch pinning was verified against PR #74: GitHub retained the original native head, while the provider resolved the current branch SHA and retained the reported SHA separately. Missing live refs are rejected.

## Required-check matrix

| Check | Result | Evidence |
|---|---|---|
| Build/typecheck/lint | PASS | Full portable build, validation, lint; Desktop suite/build |
| CLI behavior | PASS | 278 tests |
| Workflow mechanics | PASS | 96 Python + 28 pattern tests |
| Desktop runtime | PASS | 206 tests including sandboxed Electron smoke |
| Packaging/parity | PASS | Codex/Claude deterministic builds and shared manifests; CLI/Desktop staging |
| Live closed PR | PASS | github-experiment.json; create/close/native snapshot/read/pending review creation and deletion |
| Authorized merge | PASS (mock provider) | 23 lifecycle tests include unauthorized use, head drift, failed checks/merge/reopen and cleanup |
| Hosted CI final head | PENDING MERGE WINDOW | Closed PR does not refresh native PR head/checks; initial CI is not final-head proof |
| Release/install/runtime activation | PENDING POST-MERGE | No publication/installation claimed |

## Commands

The completed logs accompany this report:

```sh
# Repository root, Darwin arm64
PYTHONDONTWRITEBYTECODE=1 bash ci/portable-acceptance.sh
# Desktop directory; pretest stages protocol and builds renderer
PYTHONDONTWRITEBYTECODE=1 npm test
# Canonical resources/scripts directory
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p test_pr_lifecycle.py
```

Portable acceptance itself runs CLI `npm test`, `npm audit`, Python discovery, pattern smoke/integration, plugin validate/lint/build, Codex/Claude manifest comparison and deterministic rebuild, isolated workflow setup/doctor, and branch document validators. Log: portable-acceptance.log. Desktop: desktop-tests.log. Focused regression: lifecycle-tests.log.

The final pinned head includes evidence-only commit 7dbf474 after tested implementation commit 547f8d5. `git diff 547f8d5..7dbf474 --name-only` contains only docs/issues/tb-closed-pr-workflow paths. Source content is identical to the last passing test run.
