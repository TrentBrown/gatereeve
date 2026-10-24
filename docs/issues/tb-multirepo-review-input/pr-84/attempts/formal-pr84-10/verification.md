# Verification matrix

Outcome: PASS
Attempt: formal-pr84-10
Feature-final base: 643e3ea2b03f19b66595219c4f8df934596aa436
Evaluated source: 257b22e65bd2ff7b70216b3b4985c91c54c88c16
Substantive source commit: 584537956322d74950cf093464769e083fb1486e

Evidence is deliberately composed: the full CLI suite ran on 2e024199def6a0687e09b28b9d64c1458688de3e; the final narrow public-error/pause delta is covered by 11 focused tests plus fresh desktop, real-provider and package/runtime checks. Python58 is reused because helper source is unchanged. source-attribution.md explains this scope for independent applicability assessment. The final substantive source precedes only review metadata. Logs and structured receipts are retained alongside this report. This is mechanical verification, not independent code/spec acceptance or Judge passage.

| Category | Actual command or operation | Result and retained evidence |
| --- | --- | --- |
| Unit and integration | npm --prefix cli test | 317 PASS on 2e024199def6a0687e09b28b9d64c1458688de3e, one opt-in live evaluator SKIP (318 total); cli-tests.log. Includes parent/no-Git records, crash recovery, provenance, real fixture operations, multi-repository evidence, delta/history, authority, merge races and cutover. |
| Desktop consumers | npm --prefix apps/desktop test | 172 PASS; desktop-tests.log. Pretest stages canonical protocol and builds renderer. |
| Python helpers | python3 -m unittest discover -s tests | 58 PASS; python-tests.log. Run from plugin-src/shared/resources/scripts; Python source unchanged in this round. |
| Focused repairs | Targeted current-core and public provider tests | Eleven final validation/race/amendment/retention controls PASS (focused-regressions.log). Includes six core/public races for replacement run, newer same-run success and pause, plus combined amendment retry and lost-proof blocking. The broad CLI suite covers capability/environment/usage controls. Independent probes confirm original-run and same-run late-failure isolation, and recursive waiver invalidation. Full CLI includes provider contract and retention tests. |
| Real OpenAI evaluator | GATEREEVE_LIVE_EVALUATOR=1 GATEREEVE_AGENT_MODEL=gpt-6.1-sol node --test --test-name-pattern='real local fresh evaluator' cli/test/current-core.test.js | 1 PASS, zero skips; live-evaluator.log/json. Actual fresh provider context and bound request/output receipts retained. Uses bundled Codex CLI 0.163.0-alpha.11.2; no global configuration changes. |
| Plugin portability/native contracts | node cli/bin/workflow.js plugin lint --json; plugin build --dist-root /tmp/gr-repair9-plugins-final --json; plugin validate-native --json | All exit0; plugin-lint.json, plugin-build.json, native-validation.json. No installation or activation. |
| Record validity | Installed validate_branch_docs.py, lint_issues.py, lint_tracker.py, gate_triage.py on canonical feature home | All four PASS; document-validation.log. |
| Universal desktop package | Actual packageMacos and verifyDmg with a disposable smoke fixture | PASS; package.log, package-result.json, package-verified.json. Both architectures assembled and mounted DMG checked; runtime exercised ARM64 only. |
| Application runtime | smokeApplication of the actual universal application | PASS; runtime-result.json, runtime.log, runtime.png. Setup, pane behavior, terminal spawn/termination and current view observed; screenshot inspected. |
| Source hygiene | git diff --check on changed source/test files | PASS. Raw prior failed logs retain original whitespace; those diagnostic artifacts are intentionally not rewritten. |

Package: /tmp/gr-repair9-final-package.jNRxeL/GateReeve-0.1.0-rc.16-macos-universal.dmg
Bytes: 253690808
SHA256: 579adeea32d5c5ddda7d1dc527fefc3e17f1f696eaf3b0a31197b0e912072687
Trust: development ad-hoc. No notarization, publishing, release or installed-host activation claimed.

Earlier seventh-repair checks exposed a missing Python import in the declared runtime closure and an older host-environment fixture that needed spec refresh. Both failed outputs remain retained. Corrected full and focused checks pass. The later independent source review also reproduced old-run and same-run late validator failure contamination. Product repair 2e02419 binds failure publication to original run/state; final source 5845379 adds public retained diagnostic references and safe failure publication across unrelated pause contention; actual-child tests and independent fixed probes pass. Package and desktop/runtime checks were rebuilt for final product source 5845379. The CLI broad suite was not rerun after that narrow delta; source-attribution.md and the eleven final focused regressions support targeted reuse, subject to independent assessment. Readiness commits add review metadata only. live-roundtrip.json validates the real retained output/receipt using the public 2.1.0 envelope. Journal/activation recovery uses current contract /3; two local copies are redundancy, not an external backup or proof against simultaneous loss of both terminal copies.

Host hook coverage is explicitly configured-hook-unverified-host: subprocess tests exercise handlers and manifests, not actual native host activation or interception. Protected adapters are tested; arbitrary shell interception is not claimed. Pattern scope is empty, so the pattern gate provides no substantive rule coverage. No production or public release action is needed for these pre-merge criteria. Exact-current hosted CI is unavailable while PR84 is closed; earlier hosted results do not substitute for these source-bound local checks. No native Intel runtime claim is made.
