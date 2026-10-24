# Verification matrix

Outcome: PASS
Attempt: formal-pr84-6
Feature-final base: 643e3ea2b03f19b66595219c4f8df934596aa436
Evaluated source: dc9732c821dc3363c69f4de0115c7ccd80b8bc30
Substantive source commit: e0221667e25481000d0694a8af7ecc14555e0718

Actual local checks on the substantive source below precede only review metadata. Logs and structured receipts are retained alongside this report. This is mechanical verification, not independent code/spec acceptance or Judge passage.

| Category | Actual command or operation | Result and retained evidence |
| --- | --- | --- |
| Unit and integration | npm --prefix cli test | 288 PASS, one opt-in live evaluator SKIP (289 total); cli-tests.log. Includes parent/no-Git records, crash recovery, provenance, real fixture operations, multi-repository evidence, delta/history, authority, merge races and cutover. |
| Desktop consumers | npm --prefix apps/desktop test | 172 PASS; desktop-tests.log. Pretest stages canonical protocol and builds renderer. |
| Python helpers | python3 -m unittest discover -s tests | 58 PASS; python-tests.log. Python source unchanged in this round. |
| Focused repairs | Targeted current-core and public provider tests | Provenance/mode/retention9, authority7, missing-policy2 and provider12 PASS; focused-regressions.log, authority-regressions.log, missing-policy-regressions.log, provider-contract-tests.log. |
| Real OpenAI evaluator | GATEREEVE_LIVE_EVALUATOR=1 GATEREEVE_AGENT_MODEL=gpt-6.1-sol node --test --test-name-pattern='real local fresh evaluator' cli/test/current-core.test.js | 1 PASS, zero skips; live-evaluator.log/json. Actual fresh provider context and bound request/output receipts retained. Uses bundled Codex CLI 0.163.0-alpha.11.2; no global configuration changes. |
| Plugin portability/native contracts | node cli/bin/workflow.js plugin lint --json; plugin build --dist-root /tmp/gr-repair5-plugins-final --json; plugin validate-native --json | All exit0; plugin-lint.json, plugin-build.json, native-validation.json. No installation or activation. |
| Record validity | Installed validate_branch_docs.py, lint_issues.py, lint_tracker.py, gate_triage.py on canonical feature home | All four PASS; document-validation.log. |
| Universal desktop package | Actual packageMacos and verifyDmg with a disposable smoke fixture | PASS; package.log, package-result.json, package-verified.json. Both architectures assembled and mounted DMG checked; runtime exercised ARM64 only. |
| Application runtime | smokeApplication of the actual universal application | PASS; runtime-result.json, runtime.log, runtime.png. Setup, pane behavior, terminal spawn/termination and current view observed; screenshot inspected. |
| Source hygiene | git diff --check | Exit0 before source commit. |

Package: /tmp/gr-repair5-package.LQXtMA/GateReeve-0.1.0-rc.16-macos-universal.dmg
Bytes: 254506244
SHA256: 9d016170bc104087cf5b307bd3d4ba1c9e59b08495811108c4087812bc3e0b06
Trust: development ad-hoc. No notarization, publishing, release or installed-host activation claimed.

The prior real evaluator smoke failed because adapters omitted the public stage envelope. It is preserved in before-envelope-fix.log/json; current full-envelope validation and the fresh live rerun pass. The intermediate pending-decision regression is preserved in before-pending-retry-fix.log; current retry and scope tests pass.

Host hook coverage is explicitly configured-hook-unverified-host: subprocess tests exercise handlers and manifests, not actual native host activation or interception. Protected adapters are tested; arbitrary shell interception is not claimed. Pattern scope is empty, so the pattern gate provides no substantive rule coverage. No production or public release action is needed for these pre-merge criteria. Exact-current hosted CI is unavailable while PR84 is closed; earlier hosted results do not substitute for these source-bound local checks. No native Intel runtime claim is made.
