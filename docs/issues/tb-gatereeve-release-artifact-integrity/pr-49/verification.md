# Verification - PR #49

**Scope:** feature-final

**Feature range:** `0aac0e525bc59368301e22f305198ac70a09aef5..ceee50e46872530627833759ad5d4adf8da0bc89`

**Focused slice range:** `1c19304e67f34f12930b1c51c5e06621c05c6734..ceee50e46872530627833759ad5d4adf8da0bc89`

**Result:** PASS

## Matrix

| Category | Result | Evidence |
|---|---|---|
| Build / typecheck | PASS | Desktop pretest staged the canonical protocol and built the self-contained Markdown renderer bundle (421,335 bytes). Portable acceptance built both native Plugin packages twice and proved deterministic parity. |
| Lint / format | PASS | `git diff --check` passed for the full feature range. Plugin validation/lint and documented Bash syntax passed in portable acceptance. All lifecycle document validators passed. |
| Unit tests | PASS | `npm test --prefix cli`: 169/169. `npm test --prefix apps/desktop`: 158/158. Integrity failure classes, release state, hosted publication, Cask identity, Apple trust evidence, native evidence, and current Desktop behavior all pass. |
| Integration tests | PASS | Portable acceptance passed CLI, Plugin construction, marketplace round trip, publication recovery, workflow protocol, native packaging, cross-platform parity, and installation/doctor smoke coverage. |
| End-to-end / browser | N/A | The feature adds no browser or UI behavior. Real protected hosted release execution and installed-product Mac checks provide the applicable end-to-end evidence. |
| Application runtime | PASS | The exact public RC.6 DMG and the linked Homebrew RC.6 Cask both installed on the user's Mac. Gatekeeper accepted `/Applications/GateReeve.app` as `Notarized Developer ID`, and both launch commands completed. |
| Hosted Apple / native | PASS | Preparation run 33452103818 verified the first Plugin artifact round trip before Developer ID signing, accepted notarization request `9a632e61-0e6c-4bb6-85ba-ac71bef7925c`, stapling, Gatekeeper, and independent native ARM64 and Intel evidence. |
| Primary publication | PASS | Finalization 33455275343, rehearsal 33455470808, initial publication 33456095160, and bounded recovery 33458101816 preserve exact source `10a7264`, plan `9639bdfc...`, DMG `47121af4...`, and five complete ordered receipts. |
| Linked Cask | PASS | Finalization 33525598814, rehearsal 33525707781, pre-mutation configuration failure 33527077278, and same-plan recovery 33529901678 preserve exact plan `9e9e979a...`; tap PR #3 merged exact Cask SHA-256 `c0859208...`. |
| Homebrew user path | PASS | `brew reinstall` removed RC.2 and installed `gatereeve 0.1.0-rc.6` at `/opt/homebrew/Caskroom/gatereeve/0.1.0-rc.6`; Gatekeeper and launch passed at `2026-09-01T16:11:51Z`. |

## Commands and outcomes

- `git diff --check 0aac0e525bc59368301e22f305198ac70a09aef5..ceee50e46872530627833759ad5d4adf8da0bc89` — PASS.
- `npm test --prefix cli` — PASS, 169 tests, zero failures.
- `npm ci --prefix apps/desktop` — PASS, 149 lockfile-pinned packages installed, zero vulnerabilities.
- `npm test --prefix apps/desktop` — PASS, 158 tests, zero failures; protocol staging and renderer build passed first.
- `validate_branch_docs.py docs/issues/tb-gatereeve-release-artifact-integrity` — PASS.
- `lint_spec.py docs/issues/tb-gatereeve-release-artifact-integrity` — PASS.
- `lint_issues.py docs/issues/tb-gatereeve-release-artifact-integrity` — PASS.
- `lint_tracker.py --final docs/issues/tb-gatereeve-release-artifact-integrity` — PASS with zero `NOT YET` or `FAIL` rows.
- `bash ci/portable-acceptance.sh` — PASS on Linux x86_64 with Python 3.14.4 and Node 24.19.0:
  - 169/169 Node tests.
  - 28/28 pattern tests.
  - 64/64 shared script tests.
  - 2/2 smoke-template tests.
  - `npm audit --audit-level=high`: zero vulnerabilities.
  - Native validation, portability lint, deterministic dual-platform build, package parity, no-symlink checks, setup, and workflow-doctor smoke checks passed.

## External and manual evidence

- Exact public DMG SHA-256:
  `47121af4f246dbef0d6597c9361df346baacf128d3042fa122a2c8d83772e314`.
- Direct Mac install and launch: PASS at `2026-09-01T14:44:59Z`.
- Linked Cask plan SHA-256:
  `9e9e979a2b4760a5e459c62994a7c6320850e5e3c3858bb2e097a5389adfa0c1`.
- Homebrew tap PR: `https://github.com/TrentBrown/homebrew-gatereeve/pull/3`, merge `3b07cf6d740261298a6a596f25f3c456ed9bac35`.
- Homebrew RC.6 install, Gatekeeper assessment, and launch: PASS at `2026-09-01T16:11:51Z`.
- Feature-record retention: PASS (`tracked`), 29 tracked files and zero untracked record files.

## Non-product invocation corrections

- The first desktop test command found no `apps/desktop/node_modules` in this fresh worktree and stopped before tests with missing `esbuild`. `npm ci --prefix apps/desktop` installed the exact lockfile dependencies; the unchanged suite then passed 158/158.
- The first `lint_spec.py` invocation supplied `spec.md` rather than the expected feature directory and therefore looked for `spec.md/spec.md`. The corrected documented invocation passed. Neither event was a product assertion failure.

## Concurrent integration history

The configured original feature range necessarily includes unrelated work that
landed on `main` during sequential delivery, notably the separately governed
desktop-terminal feature. Release-artifact-integrity evidence and ownership are
limited to PRs #44, #46, #47, and #49 plus the hosted/public records cited
above. The focused PR #49 slice changes only its cumulative lifecycle journal,
issues, tracker, and RC.6 acceptance record.

## Known failures and pending manual checks

None.
