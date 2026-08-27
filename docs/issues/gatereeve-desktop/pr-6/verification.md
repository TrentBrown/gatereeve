# Verification - PR #6

**Scope:** Slice 4, P8-P9 (`desktop-final-quality`), and assembled feature
**Feature diff:** `ecbf6fea460e220c91b846a91712217861ddb559..7b14fbe84796a9ad8d2701d5e4cf8c8bfa591f2f`
**Final-slice diff:** `ba4b22d26b1619206b7aae9d03b19df741eca71e..7b14fbe84796a9ad8d2701d5e4cf8c8bfa591f2f`
**Result:** PASS

## Verification matrix

| Category | Result | Exact command and evidence |
|---|---|---|
| Build/package and type checks | PASS | `npm run check --prefix apps/desktop` stages the canonical protocol, validates JavaScript contracts, and runs 36/36 Desktop tests. The package has no separate compile step. `npm pack --dry-run --json` was verified at the prior UI boundary and the runtime package allow-list remains unchanged by this slice. |
| Syntax/lint/format | PASS | `git diff --check ba4b22d26b1619206b7aae9d03b19df741eca71e..7b14fbe84796a9ad8d2701d5e4cf8c8bfa591f2f`; JavaScript syntax validation is part of the Desktop check. |
| Unit and DOM tests | PASS | `npm test --prefix apps/desktop`: 36/36 pass, including notification candidates, quiet baseline, transition deduplication, lifecycle integration, preference persistence, IPC/preload validation, keyboard/focus/name assertions, minimum-size rules, and complete renderer integration. |
| Shared contract and repository regressions | PASS | `npm test --prefix cli`: 104/105 locally; the sole local failure is unrelated `spawn unzip ENOENT` because this NUC lacks `unzip`. Exact-head Ubuntu 22.04/24.04 acceptance and container jobs run the portable suite with dependencies present and pass. |
| Python and plugin validation | PASS | `PYTHONDONTWRITEBYTECODE=1` runs: 28 pattern-review tests, 64 shared workflow-script tests, and 2 smoke-template tests, all passing. `plugin validate --json`, `validate-native --json`, and `plugin lint --json` all pass. |
| Document validation | PASS | `validate_branch_docs.py`, `lint_issues.py`, and `lint_tracker.py --final` pass after decision triage, with all R1-R8 `PASS`. |
| Integration | PASS | Desktop continues to consume the staged canonical observer directly, validates compact and named-read envelopes, and proves journal invariance. Notification evaluation is wired to complete local/Git/GitHub recomputation and the coordinator's watcher/polling lifecycle. |
| End-to-end/browser | PASS with environment note | The production renderer's DOM suite exercises selection, every principal view, artifacts, history, model, Session, commands, and the notification toggle. Prior feature evidence inspected the production visual fixture at 1280x800 and the 760x560 minimum. T3 preview is unavailable in this session and local Chromium/Electron cannot start because this NUC lacks `libatk-1.0.so.0`; no product failure is masked. |
| Supported application runtime | PASS | GitHub Actions run `33029406357` launches the exact head with `GATEREEVE_DESKTOP_SMOKE=1` on Ubuntu 22.04, Ubuntu 24.04 under Xvfb, and macOS 14. The runtime jobs install only `apps/desktop`, proving the optional CLI is absent. Chromium sandboxing remains enabled; Ubuntu configures Electron's SUID helper as root-owned mode `4755`. |

## Exact-head CI

All checks on source head `7b14fbe84796a9ad8d2701d5e4cf8c8bfa591f2f` pass:

- Ubuntu 22.04 and 24.04 portable acceptance.
- Ubuntu 22.04 and 24.04 container acceptance.
- Ubuntu 22.04 and 24.04 Desktop contracts.
- Ubuntu 22.04 and 24.04 Electron runtime smoke.
- macOS 14 Electron runtime smoke.
- Cloudflare Pages.

## Focused final-slice evidence

- Native notifications are opt-in and delivered only by Electron main. Opening a worktree or enabling notifications quietly baselines current conditions; later observations emit only newly entered attention, failed/stale gate, inconsistent/suspended, merged-PR, and feature-complete conditions.
- Process-lifetime event identities prevent duplicate one-shot notifications. A merged PR uses the same `merge:pr:<number>` identity whether GitHub or the journal observes it first.
- The preference crosses one exact validated IPC channel; no generic mutation or execution surface was added. Notification delivery failure is isolated from canonical observation.
- The accessible checkbox has a programmatic label and explanatory text. Native controls, visible focus, non-color text, semantic landmarks/live regions, a correctly labeled attempt selector, and responsive minimum-size behavior cover every named interaction.
- Runtime CI deliberately preserves Electron's sandbox. The first two boundary attempts exposed and corrected Ubuntu runner differences rather than weakening the application with `--no-sandbox`.

## Feature-final conclusion

The complete feature satisfies all eight acceptance criteria and all eight rubric criteria. The deterministic feature record is fully tracked in Git; retention status is `tracked`, with no human retention decision required.

## Known unrelated/local-environment limitation

This NUC cannot start Chromium or Electron because the host does not provide `libatk-1.0.so.0`, and its broad CLI test lacks the external `unzip` executable. Supported exact-head CI supplies both dependencies and passes. There is no pending product verification item.
