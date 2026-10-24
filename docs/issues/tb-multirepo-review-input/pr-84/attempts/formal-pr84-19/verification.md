# Verification — formal-pr84-19

Outcome: PASS
Base: 643e3ea2b03f19b66595219c4f8df934596aa436
Evaluated source: 39c5fa3c657cb2caa2e7c343b4d80e0cab6130e8
Final product: d924492cc4f1ec825eaebcd5897c08208532cc38

Mechanical composite assessment only; independent code/spec and native Judge verdicts are separate. No gate waived.

| Coverage | Actual result |
| --- | --- |
| D11 frozen product controls | final-runtime.log:15PASS. Scope, acceptance-only, slice/final merge, target drift, revocation/expiry races, draft restoration, configured Git/Python and existing direct merge controls. |
| Long history | history-final.log:1PASS,66 retained records/33 closures. Exact frozen product. |
| Transitive exception | exception-fixed.log:1PASS; precise rejection message assertion corrected, product unchanged. |
| Current broad run | source-evolving-broad.log:172PASS,2FAIL,1SKIP. Started before final changes. Both failures reconciled in regression-reconciliation.md; not relabeled all-green or exact-final. |
| Prior broad feature coverage | baseline-verification.md and broad-cli-completed.log disclose previous368 tests:366PASS,1resolved portabilityFAIL,1intentionalSKIP. Prior unchanged-domain focused checks remain usable; affected D11 domains supplemented above. |
| Desktop | desktop-tests.log:173PASS on final product. |
| Actual unpacked CLI | packed-cli.log:2PASS on final product, packaged CLI executable. |
| Surface/portability/docs | surface-tests.log:18PASS; final runtime helper change supplemented by merge-helper.log:3PASS and final-runtime.log. |
| Native plugin | Final plugin-lint.json/plugin-build.json PASS. New authorization.js included in inventory and both staged surfaces. |
| Packaged application | package-result.json/package-verified.json/runtime-result.json/runtime.png: universal ad-hoc dev package built, actual ARM64 runtime smoke PASS. Screenshot inspected. No Intel runtime/install/release claim. |
| Build binding | final-build-binding.json:49 protocol/helper files across actual app.asar and two native packages,147 byte comparisons match final product. Later changes are tests and retained evidence only. |
| Earlier unchanged transport/helper domains | Baseline logs retain actual OpenAI fixture/public receipt validation, prior trusted Python58 and pattern29, tested process-local coordinator transport. New merge helper/runtime paths separately tested. |

The six original D11 defect probes and independent delta findings are retained outside the native Judge evidence bundle, preserving its fresh review policy. Formal reviewers must assess current code and all23 rubric rows; prior code/spec verdicts are historical context, not current passage.

Limits: no installed-host interception, arbitrary shell enforcement, exact-current hosted CI, deployment, publication, installation, signing/notarization or Intel runtime established. Human authorization provenance is cooperative. Empty pattern scope supplies no substantive pattern-rule coverage. Local mirror is not external backup. Remote target rechecks are not atomic target CAS. Runtime dependency declarations remain explicit reviewable commitments rather than universal dependency inference.

Installed rc.16 governs. Existing tested coordinator loader provides compact advisory transport and bounded audit reading without changing core guards, receipt validation or evidence hashes. See baseline coordinator-transport.md. Pending/unavailable optional advisory uses recorded reasoned proceed; mandatory independent gates remain required.

## Inspectable evaluator execution evidence

Verification attachments include live-evaluator.json (actual current-contract result/receipt and public2.1.0 provider receipt plus output), live-evaluator.log (actual opt-in execution PASS), live-roundtrip.json and retained-evaluator-validation.json (current public-validator recheck). These provide R8 fixture execution/transport evidence, not this PR’s independent quality verdict. Provider context01a16cc8-7243-7180-91b2-9329b2bccd42 is fresh, high-reasoning gpt-6.1-sol,zero inherited turns; exact output digest is retained. The current execution/public-validation paths are unchanged from that real run; D11 affects authority and integration paths separately covered by current controls. All source/test changes since formal18 are evidence-only. Final runtime, Desktop, CLI, history, scope assertion, package/build bindings and reconciliation are also direct inspectable attachments.
