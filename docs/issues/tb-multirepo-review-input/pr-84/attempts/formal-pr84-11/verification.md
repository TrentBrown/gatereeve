# Verification matrix

Outcome: PASS
Attempt: formal-pr84-11
Feature-final base: 643e3ea2b03f19b66595219c4f8df934596aa436
Evaluated source: 9fa285e2b42b092bbd0220e05161c9ed3bce7b0e
Substantive source: f2a2041059272c0b0ba648c2e1bdc92899ed4370

These actual local checks precede only review metadata. This is mechanical verification; independent code/spec and native Judge remain separate obligations. Logs and typed receipts are retained alongside this report.

| Category | Command/operation and result |
| --- | --- |
| Unit/integration | npm --prefix cli test: 332 PASS, one intentional live-provider SKIP, 333 total, zero FAIL; cli-tests.log. Covers canonical parent/no-Git records, retained evidence, authority, reuse/delta/history, recovery, scope and protected actions. |
| Focused final repairs | node --test selected current-core cases:11 PASS,zero skips; focused-regressions.log. Root/subdirectory/linked-worktree capture and enclosing delta; all four unsupported activation-copy cases through public resume; criterion-only/coverage-only/cross-gate negatives; gate-qualified closure IDs; transport and unrelated criterion controls. |
| Desktop consumers | npm --prefix apps/desktop test:172 PASS; desktop-tests.log. Pretest stages canonical protocol and builds renderer. |
| Python helpers | python3 -m unittest discover -s tests:58 PASS, reused from unchanged helper source; python-tests.log. No new Python implementation in this round. |
| Real OpenAI | GATEREEVE_LIVE_EVALUATOR=1 GATEREEVE_AGENT_MODEL=gpt-6.1-sol node --test --test-name-pattern='real local fresh evaluator' cli/test/current-core.test.js:1 PASS,zero skips; live-evaluator.log/json. Bundled Codex CLI0.163.0-alpha.11.2, high reasoning, actual fresh context. live-roundtrip.json validates actual retained output/receipt using public2.1.0 envelope. |
| Plugin portability/native contracts | node cli/bin/workflow.js plugin lint --json; plugin build --dist-root /tmp/gr-repair10-plugins --json; plugin validate-native --json:all exit0. plugin-lint.json,plugin-build.json,native-validation.json. |
| Record validators | Installed validate_branch_docs.py,lint_issues.py,lint_tracker.py,gate_triage.py:all four PASS; document-validation.log. |
| Package | Actual packageMacos and verifyDmg with disposable fixture:PASS; package.log,package-result.json,package-verified.json. Both architectures assembled; runtime exercised ARM64 only. |
| Runtime | Actual smokeApplication of built universal app:PASS; runtime-result.json,runtime.log,runtime.png; screenshot inspected. Setup, panes, terminal spawn/termination and workflow view observed. |
| Built source binding | final-build-binding.json:22 protocol JavaScript files across actual app.asar and built Codex/Claude packages match final committed source,66 comparisons. Build sourceCommit matches substantive source. |
| Source hygiene | git diff --check on modified source/tests:PASS. Original diagnostic logs are preserved without whitespace rewriting. |

Package: /tmp/gr-repair10-package.RvtfQk/GateReeve-0.1.0-rc.16-macos-universal.dmg
Bytes: 253970974
SHA256: 32078fa40e3ebb2a679b530e8741be69cfeeb11317a6c7fd5ca0ff83565a3910
Trust: development ad-hoc. No signing/notarization, installation, publication or release claimed.

The tenth formal Judge's failures remain unchanged. Repairs address complete repository capture/proof admission, complete relevant reviewer context and negative-proof barriers, and opaque unsupported-copy resume. Independent before/after probes corroborate them, without hosted merge writes. The superseded partial long-history run is not a passing result; the final full suite includes the actual beyond64-history case and all existing interactions. No formal gate has been waived.

Native host interception remains configured-hook-unverified-host. Handler/subprocess contracts and protected adapters are tested; arbitrary shell interception and actual installed-host activation are not claimed. Pattern configuration is empty and gives no substantive rule coverage. Exact-current hosted CI is unavailable while PR84 remains closed; old hosted results are not current proof. No native Intel runtime claim. Local mirrored records provide recovery redundancy, not external backup or protection against simultaneous loss of both terminal copies. These limits are explicit and do not add a deployment prerequisite to the approved pre-merge criteria.
