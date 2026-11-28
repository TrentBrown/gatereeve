# Decision Scratchpad - tb-code-health-step

**Feature start:** 2026-11-27

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1 — Integration branch

- **Answered by:** agent (mandated autonomy, 2026-11-27)
- **Decision:** `integrationBranch: tb-code-health-step`, `releaseBranch: main`, `featureBaseSha: a9ce8b78…`. Slice PRs come from `tb-code-health-step-NN-<desc>` branches into `tb-code-health-step`. The final PR runs `tb-code-health-step` → `main` and needs Trent's per-PR merge instruction.
- **Alternatives:** integration equal to release (`main`), which would make every slice PR wait for a per-PR human merge.
- **Reversibility:** high; local workspace config only, set before the first slice.
- **Why:** this matches earlier features (`tb-convergence-and-retirement`, `tb-lightweight-mode`).

## S2 — Design refinements C1.1–C1.5

- **Answered by:** agent (mandated autonomy)
- **Decision:** see `design.md` `## Changes` C1. Covers the core-built command, neutralized suppressions (revised after planning review F1), a scope-keyed base cache (F2), rule-ID smell names with a vendored plugin, the base overlay with an explicit file list, and per-run opt-out.
- **Alternatives:** per item, in `design.md`.
- **Reversibility:** medium; these are mechanism choices and the intent is unchanged.

## S3 — `.cjs` parse failures resolved

- **Answered by:** agent (mandated autonomy)
- **Decision:** the spike's three `.cjs` parse errors came from the spike tsconfig not including `.cjs` ("not found by the project service"). Including `**/*.cjs` fixes them (re-run verified). The init tsconfig template covers `.js`, `.mjs`, `.cjs`, `.ts` and `.tsx`; recorded in spec AC6 and R9.
- **Alternatives:** excluding `.cjs` from the scan (loses coverage); `allowDefaultProject` globs (slower, and capped by typescript-eslint).
- **Reversibility:** high.

## S4 — Slice 1 delivery: round 6 continue and 13 rounds

- **Answered by:** human (Trent, "Proceed") for the round 6 hand-back; agent for the remaining rounds (mandated autonomy, 2026-11-28)
- **Decision:** slice 1 continued past round 6 under the narrowed band and converged at round 13 (Codex PASS, Claude PASS). The rounds after 6 closed edge cases: cache identity for package-local and custom analysers, governed `tsconfig*.json` names, custom plugins' declared tools (asked of Habit Hooks), malformed sensor output (empty smell, `..` and absolute paths, content-keyed issues), and a sensor timeout test. The fixes are in commits 811dcdea through f23909a2. Merged as PR #179 (integration c64f15bf).
- **Alternatives:** split the slice at round 6; waive the remaining findings.
- **Reversibility:** n/a (delivered).

## S5 — Base cache keyed by the wrapper's own source

- **Answered by:** agent (mandated autonomy)
- **Decision:** the tool identity carries `wrapperSource`, a hash of every `.js` file in `code-health/`, so a change to normalization or comparison retires earlier cached baselines without a manual `WRAPPER_VERSION` bump (round 12 codex/F23). Plugins GateReeve cannot fully describe (no sensor table, or a vendored sensor outside it) never reuse a cached base (round 8 F16, CH-R9-01).
- **Alternatives:** manual version bumps (missed twice in review), or no cache.
- **Reversibility:** high.

## S6 — A probe file's parse error is UNAVAILABLE

- **Answered by:** agent (mandated autonomy)
- **Decision:** the round 2 exemption for a probe file's own parse error was removed in round 10 (codex/F21), because design §3 and AC2 make any parse error UNAVAILABLE. A repository with an unparseable file in a language the change doesn't touch is now UNAVAILABLE until the file is fixed or a human waives code health. The message says the file was probed.
- **Alternatives:** keep the exemption through a spec amendment; choose another probe file.
- **Reversibility:** high; an amendment could restore the exemption.

## S7 — Host libuv abort and `UV_USE_IO_URING=0`

- **Answered by:** agent (mandated autonomy)
- **Decision:** `current-core.test.js` (and sometimes `current-delivery-targets`, `current-delegation`) intermittently die with SIGABRT. Two core dumps show `abort()` in libuv `uv__epoll_ctl_flush` (linux.c:1304) with io_uring rings mapped. The same SIGABRT appears on hosted CI, including `main` runs 46036502197 and 46041899403 from before this feature. Local Verification sets `UV_USE_IO_URING=0`, which cut the local failure rate from 3 of 3 to roughly 1 in 6 (libuv's epoll-batching ring stays on), and retries once. Review runs only after a passing Verification, so a crash does not spend a round. Hosted CI reruns the failed job.
- **Alternatives:** `sudo sysctl kernel.io_uring_disabled=2` on the host (needs Trent); a Node/libuv upgrade; fixing the abort upstream.
- **Reversibility:** high; test-environment only.
- **Follow-up:** worth its own issue: the abort is pre-existing and affects `main`.

## S8 — Init writes the full preset; dot-paths and minified files are out of scope

- **Answered by:** agent (mandated autonomy, 2026-11-28)
- **Decision:** `code-health init --preset moderate` writes every starting file (all four plugins, JS/TS and Python scan globs, ESLint, `tsconfig.json`, Ruff and the S110 sensor) whatever the repository already tracks, an empty repository included, because AC6/R9 require it and files added later must be covered (S2 round 1, R9-INIT-1 and CH-S2-01). Each language's sensors keep their own `files` globs, so Ruff never parses JavaScript. Detected languages only shape the report. The scan excludes dot-files, dot-directories and `*.min.js` (`!**/.*`, `!**/.*/**`, `!**/*.min.js`), because TypeScript's `include` wildcards skip them, and a scanned file outside the TypeScript program is a parse error that blocks the check (CH-S2-02, CH-S3-01).
- **Alternatives:** per-language init (the round 1 behaviour, which leaves later files unchecked); listing dot-paths explicitly in the `tsconfig.json` `include` (keeps CI and config scripts in scope, but `**/.*` patterns are fragile across TypeScript versions and pull in unrelated tool configs).
- **Consequence:** a JavaScript-only project also needs `ruff` and `deptry` for the configured python plugin, or the check is UNAVAILABLE. Init's follow-up message and the doctor name the installs.
- **Reversibility:** high; the scope is governed configuration a project can widen with an approval.
