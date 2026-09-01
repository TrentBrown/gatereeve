# Verification - PR 43

**Feature-final range:** `1220138bf4248a72c1717955c4f62e3f1cda0599..5565716cf0eb623dc91fc3f3c357f35f43c130de`
**Focused slice:** `0aac0e525bc59368301e22f305198ac70a09aef5..5565716cf0eb623dc91fc3f3c357f35f43c130de`
**Result:** PASS

## Matrix

| Category | Command or check | Result | Evidence |
|---|---|---|---|
| Desktop build, unit, and integration | `cd apps/desktop && npm test` | PASS | Renderer assets built deterministically; 158 tests passed with zero failures, skips, or todos. |
| Workflow-plugin regression | `cd cli && npm test` | PASS | 158 tests passed after installing the exact lockfile dependencies; zero failures, skips, or todos. |
| Canonical plugin contracts | `npm start --prefix cli -- plugin validate` | PASS | 27 shared skills validate across Codex and Claude packages. |
| Portable-source lint | `npm start --prefix cli -- plugin lint` | PASS | 153 canonical source files pass portability and inventory checks. |
| Native package contracts | `npm start --prefix cli -- plugin validate-native` | PASS | Codex and Claude native sources validate at plugin version 0.1.0. |
| Dependency audit | `npm ci` in Desktop and CLI | PASS | Both lockfile installs reported zero vulnerabilities. |
| Diff hygiene | `git diff --check 0aac0e5..5565716` | PASS | No whitespace errors. |
| Workflow documents | `lint_spec.py`, `validate_branch_docs.py`, `lint_issues.py`, `lint_tracker.py`, and `gate_triage.py` | PASS | All deterministic validators exited zero. |
| Ubuntu PTY integration | Desktop real-PTY tests and hosted Desktop runtime on Ubuntu 22.04/24.04 | PASS | Cwd, login shell, input/output, resize, exit, restart, and descendant cleanup passed. |
| Desktop application runtime | Hosted source runtime on Ubuntu 22.04/24.04 and macOS | PASS | Electron opened a governed fixture, revealed a real project terminal, observed it running, terminated it, and retained exited/Restart UI. |
| Universal macOS package | [Universal package job](https://github.com/TrentBrown/gatereeve/actions/runs/33451627219/job/99682597975) | PASS | The exact ad-hoc-signed development DMG was built from the pinned head with both architecture paths and unpacked `node-pty` assets. |
| Packaged Apple Silicon runtime | [Native arm64 job](https://github.com/TrentBrown/gatereeve/actions/runs/33451627219/job/99682844812) | PASS | Exact DMG inspected, mounted, and terminal-smoked natively on arm64. |
| Packaged Intel runtime | [Native x64 job](https://github.com/TrentBrown/gatereeve/actions/runs/33451627219/job/99682844725) | PASS | Exact DMG inspected, mounted, and terminal-smoked on a hosted native Intel Mac; no Rosetta substitution was used. |
| Full hosted matrix | [Plugin CI run 33451627219](https://github.com/TrentBrown/gatereeve/actions/runs/33451627219) | PASS | All 12 jobs passed on pinned source `5565716`. |

The complete-feature range includes independently governed Desktop file-action,
phase-context, and Markdown work that entered `main` after the terminal
feature began. Those files are covered by the broad regression run but are not
attributed to this terminal slice.

The macOS PR artifact is deliberately ad-hoc signed. Developer ID signing,
notarization, stapling, Gatekeeper assessment, and native smoke of the exact
trusted bytes remain mandatory in the protected post-merge release workflow;
this report does not claim that release evidence.
