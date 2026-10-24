# Verification matrix

Outcome: PASS
Attempt: formal-pr84-13
Feature-final base: 643e3ea2b03f19b66595219c4f8df934596aa436
Evaluated source: 6bb9263184aa3b9fd7bae09dc0e5df35abb7b05d
Substantive source: 26122e3cb959790e6a57e0905ff1bea04412546f

These actual local checks precede only review metadata. This is mechanical verification; independent code/spec and native Judge remain separate obligations. Logs and typed receipts are retained alongside this report.

| Category | Command/operation and result |
| --- | --- |
| Unit/integration | npm --prefix cli test: 350 PASS, one intentional live-provider SKIP, 351 total, zero FAIL; cli-tests.log. Covers canonical parent/no-Git records, retained evidence, authority, reuse/delta/history, recovery, scope and protected actions. |
| Focused final repairs | node --test selected current-core cases:2 PASS,zero skips; focused-final.log. Actual local integration and completion: earlier retention PASS rejects deleted/corrupt failed-validator diagnostics and unique input, exact restoration recovers applicable proof, later failed amendment requires fresh retention, and retained historical verdicts stay unchanged. Existing lost-before-execution control also passes. |
| Desktop consumers | npm --prefix apps/desktop test:172 PASS; desktop-tests.log. Pretest stages canonical protocol and builds renderer. |
| Python helpers | python3 -m unittest discover -s tests:58 PASS, reused from unchanged helper source; python-tests.log. No new Python implementation in this round. |
| Real OpenAI | GATEREEVE_LIVE_EVALUATOR=1 GATEREEVE_AGENT_MODEL=gpt-6.1-sol node --test --test-name-pattern='real local fresh evaluator' cli/test/current-core.test.js:1 PASS,zero skips; live-evaluator.log/json. Local Codex CLI0.162.1, high reasoning, actual fresh context. live-roundtrip.json validates actual retained output/receipt using public2.1.0 envelope. |
| Plugin portability/native contracts | node cli/bin/workflow.js plugin lint --json; plugin build --dist-root /tmp/gr-repair12-plugins --json; plugin validate-native --json:all exit0. plugin-lint.json,plugin-build.json,native-validation.json. |
| Record validators | Installed validate_branch_docs.py,lint_issues.py,lint_tracker.py,gate_triage.py:all four PASS; document-validation.log. |
| Package | Actual packageMacos and verifyDmg with disposable fixture:PASS; package.log,package-result.json,package-verified.json. Both architectures assembled; runtime exercised ARM64 only. |
| Runtime | Actual smokeApplication of built universal app:PASS; runtime-result.json,runtime.log,runtime.png; screenshot inspected. Setup, panes, terminal spawn/termination and workflow view observed. |
| Built source binding | final-build-binding.json:22 protocol JavaScript files across actual app.asar and built Codex/Claude packages match final committed source,66 comparisons. Build sourceCommit matches substantive source. |
| Source hygiene | git diff --check on modified source/tests:PASS. Original diagnostic logs are preserved without whitespace rewriting. |

Package: /tmp/gr-repair12-package.vSKSsA/GateReeve-0.1.0-rc.16-macos-universal.dmg
Bytes: 253971338
SHA256: 1252aa2ffb6ca860230b21a3b089f9b3aa507b2dc454da3673bae851182b4906
Trust: development ad-hoc. No signing/notarization, installation, publication or release claimed.

The completed full suite includes the actual beyond64-history case and existing scope, authority, recovery and concurrency interactions. No formal gate is waived.

Native host interception remains configured-hook-unverified-host. Handler/subprocess contracts and protected adapters are tested; arbitrary shell interception and actual installed-host activation are not claimed. Pattern configuration is empty and gives no substantive rule coverage. Exact-current hosted CI is unavailable while PR84 remains closed; old hosted results are not current proof. No native Intel runtime claim. Local mirrored records provide recovery redundancy, not external backup or protection against simultaneous loss of both terminal copies. These limits are explicit and do not add a deployment prerequisite to the approved pre-merge criteria.
