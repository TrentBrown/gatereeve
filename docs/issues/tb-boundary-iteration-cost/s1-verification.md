# S1 provisional verification

Source changes: P1/P2 compact inputs, filtered exact snapshots, Judge3 contract and staged host packaging. Formal pinned-source review is still pending. No fixture receipt is a live-provider verdict.

| Category | Command | Result |
|---|---|---|
| Build and package integrity | `PYTHONDONTWRITEBYTECODE=1 bash ci/portable-acceptance.sh` | PASS: Codex/Claude validation, native validation, lint, repeatable builds and portable setup/doctor smoke. |
| CLI unit/integration | above: `npm test --prefix cli` | PASS: 291 tests, including 905 changed files and at least 24 MiB, binary/rename fidelity, history aliases/symlinks, legacy contracts and protocol guards. |
| Python unit/integration | above: three unittest discovery commands | PASS: 28 pattern, 97 scripts, 2 smoke tests. |
| Dependency audit | above: `npm audit --prefix cli --audit-level=high` | PASS: zero vulnerabilities. |
| Desktop build/unit/integration | `PYTHONDONTWRITEBYTECODE=1 npm run check --prefix apps/desktop` | PASS: staged shared protocol, renderer build, 206 tests. |
| Changed-file whitespace | `git diff --check` | PASS. |
| Runtime service contract | compact-review integration test in full CLI suite | PASS: production service prepares isolated filtered snapshot, retains full Verification and bound image evidence, rejects absent/corrupt evidence, validates/publishes audit. Provider is a fixture; real independent review pending. |
| Browser/UI journey | N/A | Shared review backend contracts only; no changed user-facing screen. Desktop renderer build and host contract tests apply. |

Corrected provisional failures: default selector/policy digest, CWD-dependent fixture resource loader, portability scanner path syntax, and generated Python cache files accidentally created by helper execution. No test was waived. Follow-up Ruby/TOML source-retention fix passes all 291 CLI and 206 Desktop tests; bounded preparation of GateReeve’s own pinned tree succeeds. Final portable and Desktop runs pass. Use PYTHONDONTWRITEBYTECODE=1 to keep transient files out of source packages.

Read-only MyLifeMap rehearsal is retained in s1-historical-packet-metrics.json. Its original pinned range is unchanged; referenced text and manifest sizes do not include retained binary blobs or the full repository snapshot. No MyLifeMap source or journal was altered.
