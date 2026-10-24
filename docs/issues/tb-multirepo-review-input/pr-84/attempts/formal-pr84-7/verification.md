# Verification matrix

Outcome: PASS
Attempt: formal-pr84-7
Feature-final base: 643e3ea2b03f19b66595219c4f8df934596aa436
Evaluated source: b55399291d58475a5396ec94b1092a703749c149
Substantive source commit: 5a0083803c85578cb5e1a62ce229f0afe917967a

Actual local checks on the substantive source below precede only review metadata. Logs and structured receipts are retained alongside this report. This is mechanical verification, not independent code/spec acceptance or Judge passage.

| Category | Actual command or operation | Result and retained evidence |
| --- | --- | --- |
| Unit and integration | npm --prefix cli test | 310 PASS, one opt-in live evaluator SKIP (311 total); cli-tests.log. Includes parent/no-Git records, crash recovery, provenance, real fixture operations, multi-repository evidence, delta/history, authority, merge races and cutover. |
| Desktop consumers | npm --prefix apps/desktop test | 172 PASS; desktop-tests.log. Pretest stages canonical protocol and builds renderer. |
| Python helpers | python3 -m unittest discover -s tests | 58 PASS; python-tests.log. Run from plugin-src/shared/resources/scripts; Python source unchanged in this round. |
| Focused repairs | Targeted current-core and public provider tests | Persistence9, scope4, resume5, adapter3, publication8, concurrency5, isolation3 and closure-order1 PASS; persistence-regressions.log, scope-regressions.log, resume-regressions.log, adapter-regressions.log, publication-regressions.log, concurrency-regressions.log, isolation-regressions.log, closure-order-regression.log. Full CLI includes provider contract and retention tests. |
| Real OpenAI evaluator | GATEREEVE_LIVE_EVALUATOR=1 GATEREEVE_AGENT_MODEL=gpt-6.1-sol node --test --test-name-pattern='real local fresh evaluator' cli/test/current-core.test.js | 1 PASS, zero skips; live-evaluator.log/json. Actual fresh provider context and bound request/output receipts retained. Uses bundled Codex CLI 0.163.0-alpha.11.2; no global configuration changes. |
| Plugin portability/native contracts | node cli/bin/workflow.js plugin lint --json; plugin build --dist-root /tmp/gr-repair6-plugins-freeze --json; plugin validate-native --json | All exit0; plugin-lint.json, plugin-build.json, native-validation.json. No installation or activation. |
| Record validity | Installed validate_branch_docs.py, lint_issues.py, lint_tracker.py, gate_triage.py on canonical feature home | All four PASS; document-validation.log. |
| Universal desktop package | Actual packageMacos and verifyDmg with a disposable smoke fixture | PASS; package.log, package-result.json, package-verified.json. Both architectures assembled and mounted DMG checked; runtime exercised ARM64 only. |
| Application runtime | smokeApplication of the actual universal application | PASS; runtime-result.json, runtime.log, runtime.png. Setup, pane behavior, terminal spawn/termination and current view observed; screenshot inspected. |
| Source hygiene | git diff --check | Exit0 before source commit. |

Package: /tmp/gr-repair6-freeze-package.BO64gO/GateReeve-0.1.0-rc.16-macos-universal.dmg
Bytes: 253971940
SHA256: 739ef26c30b3ab7827cdc82b0e035c227440e8a69e149f284c965569b5a0713d
Trust: development ad-hoc. No notarization, publishing, release or installed-host activation claimed.

Earlier round-six runs exposed the desktop contract check, older corruption fixtures and unrelated-closure history regression; those failed outputs remain retained. Current checks cover the corrected consumer and stronger diagnostics. live-roundtrip.json validates the real retained output/receipt using the public 2.1.0 envelope. Journal/activation recovery uses current contract /3; two local copies are redundancy, not an external backup or proof against simultaneous loss of both terminal copies.

Host hook coverage is explicitly configured-hook-unverified-host: subprocess tests exercise handlers and manifests, not actual native host activation or interception. Protected adapters are tested; arbitrary shell interception is not claimed. Pattern scope is empty, so the pattern gate provides no substantive rule coverage. No production or public release action is needed for these pre-merge criteria. Exact-current hosted CI is unavailable while PR84 is closed; earlier hosted results do not substitute for these source-bound local checks. No native Intel runtime claim is made.
