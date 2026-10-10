# Verification — PR #74 attempt 1

Pinned source: 604bf207c610cf5bc7703e84186fb6a282c69055; base: 174bcc60465fdd9494f8cfb9b5bdbf8e03b11b93. All source tests ran on this exact content before its source commit (only verification prose changed at commit).

# Provisional Verification - tb-closed-pr-workflow

## Local implementation checks

- CLI suite: 277 tests passed in final portable acceptance.
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
| CLI behavior | PASS | 277 tests |
| Workflow mechanics | PASS | 96 Python + 28 pattern tests |
| Desktop runtime | PASS | 206 tests including sandboxed Electron smoke |
| Packaging/parity | PASS | Codex/Claude deterministic builds and shared manifests; CLI/Desktop staging |
| Live closed PR | PASS | github-experiment.json; create/close/native snapshot/read/pending review creation and deletion |
| Authorized merge | PASS (mock provider) | 23 lifecycle tests include unauthorized use, head drift, failed checks/merge/reopen and cleanup |
| Hosted CI final head | PENDING MERGE WINDOW | Closed PR does not refresh native PR head/checks; initial CI is not final-head proof |
| Release/install/runtime activation | PENDING POST-MERGE | No publication/installation claimed |
