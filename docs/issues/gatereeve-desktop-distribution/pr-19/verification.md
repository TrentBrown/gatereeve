# Verification - PR #19

**Scope:** P10 / I-8 public Cask proof and assembled feature
**Feature diff:** `7f18ba15e9d2d224557fde454e432ab9f44d7606..e65b044e99aa17c2d7127126aba7c539fcbf99f7`
**Final-slice diff:** `26fb22f341303ff9b4e9340029058ced0285aa9a..e65b044e99aa17c2d7127126aba7c539fcbf99f7`
**Result:** PASS

## Verification matrix

| Category | Result | Exact command and evidence |
|---|---|---|
| Build/package and type checks | PASS | `npm run check --prefix apps/desktop` stages the canonical protocol and passes 82/82 tests. Exact-head run [33195776246](https://github.com/TrentBrown/gatereeve/actions/runs/33195776246) packages one universal macOS application and launches the packaged bytes on Apple Silicon and Intel. |
| Syntax/lint/format | PASS | `node --check apps/desktop/scripts/smoke-homebrew-cask.mjs`; `git diff --check 7f18ba15e9d2d224557fde454e432ab9f44d7606..e65b044e99aa17c2d7127126aba7c539fcbf99f7`; canonical Plugin lint and source-purity checks pass in hosted acceptance. |
| Desktop unit and integration tests | PASS | `npm run check --prefix apps/desktop`: 82/82 pass across packaging, Apple trust, Cask host guards, setup/compatibility, packaged observation, updates, notifications, renderer, accessibility, and runtime policy. |
| CLI and Plugin regression | PASS with one local environment limitation | `PYTHONDONTWRITEBYTECODE=1 npm test --prefix cli`: 132/133 pass locally. The only failure is unchanged `spawn unzip ENOENT` because this NUC lacks `unzip`; both Ubuntu acceptance and container jobs in run 33195776246 supply it and pass the complete suite. |
| Website regression | PASS | `npm test --prefix workflow-site`: 4/4 pass, including exact trusted RC metadata, visible Plugin prerequisite and RC behavior, trust gating, and identifier-free same-origin fetching. |
| Public release and checksum integration | PASS | `gh release view v0.1.0-rc.1` returns prerelease source `117a585`, DMG size `246098110`, and SHA-256 `9cbe51065692857ba929e153863fa92c8fe2dc4d275eb29453014a04e1f1ea92`; production `desktop.json` matches; the public Cask file hashes to `963fb25d3b800aa1be596a0f57766d276499fecc1527b9958bc20a5f613febb2`. |
| Public Cask end-to-end | PASS | Exact-head run [33195776257](https://github.com/TrentBrown/gatereeve/actions/runs/33195776257) executes both local install/upgrade and literal `brew install --cask TrentBrown/gatereeve/gatereeve` proofs on `macos-15` ARM and Intel. The public jobs clone the tap, compare exact Cask bytes before installation, then verify bundle ID, Developer ID, Gatekeeper, and universal architecture. |
| Application runtime | PASS | Direct DMG installation and launch passed on the maintainer's Mac. Exact package/runtime jobs run the same approved universal application on ARM and Intel, and public Homebrew jobs validate the installed application from the published Cask. |
| Setup and UI behavior | PASS | Complete Desktop DOM/runtime suites verify selected-agent setup, compatibility states, historical access, notification-only updates, accessibility, and read-only observation without CLI installation or workflow mutation. |
| Branch-document validation | PASS | `validate_branch_docs.py`, `lint_issues.py`, `lint_tracker.py --final`, and `gate_triage.py` pass with all R1-R8 `PASS`. |
| Hosted exact-head CI | PASS | All 17 checks pass: four Homebrew jobs, two packaged runtimes, universal packaging, macOS runtime, both Ubuntu versions across acceptance/container/Desktop contract/Desktop runtime, and Cloudflare Pages. |

## Public identities

- GateReeve release: [v0.1.0-rc.1](https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.1)
- Source commit: `117a58511ef20957426d3fc5e801f6d5b1173b32`
- Universal DMG SHA-256: `9cbe51065692857ba929e153863fa92c8fe2dc4d275eb29453014a04e1f1ea92`
- Apple identity: `Developer ID Application: Trent Brown (PMWYD5A82A)`
- Notarization: `575a7de0-0e6c-4b42-a6af-fca52d709eb8` (`Accepted`)
- Public tap: [TrentBrown/homebrew-gatereeve](https://github.com/TrentBrown/homebrew-gatereeve)
- Tap publication: [PR #1](https://github.com/TrentBrown/homebrew-gatereeve/pull/1), merge `c78575fb07f285a3632b35d371aacca5e3a999aa`
- Cask SHA-256: `963fb25d3b800aa1be596a0f57766d276499fecc1527b9958bc20a5f613febb2`
- Durable runner evidence: [Apple Silicon](../evidence/public-cask-arm64.json) and [Intel](../evidence/public-cask-x64.json)

## Feature-final conclusion

All eight acceptance criteria and rubric criteria pass. The complete feature
record is tracked in Git: 74 current files, zero untracked files, and no
retention decision required. There is no pending manual verification.

## Known local-environment limitation

This NUC lacks the external `unzip` executable used by one unchanged offline
bundle inventory test. Hosted Ubuntu acceptance and container jobs pass that
test and every other CLI/Plugin check; no product failure is masked.
