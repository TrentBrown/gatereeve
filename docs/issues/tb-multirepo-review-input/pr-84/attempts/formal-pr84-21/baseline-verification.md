# Verification matrix — formal-pr84-17

Outcome: PASS
Base: 643e3ea2b03f19b66595219c4f8df934596aa436
Evaluated pin: d8be5959c8d7bb3925ee5f8991d295ae07bdef9e
Final product source: 02bb2eced01000783b2bb3d7357380a79bd4427e

This is a mechanical verification assessment, not an independent code/spec or Judge verdict. Coverage combines the completed broad run with focused final checks that resolve its sole failure and cover the two narrow changes made during execution. Original failing evidence is retained unchanged. Independent review must assess this applicability; no gate is waived.

| Category | Actual result and evidence |
| --- | --- |
| Broad CLI | npm --prefix cli test:368 total,366PASS,1FAIL,1intentional live-providerSKIP. broad-cli-completed.log retains the actual failure, canonical portability lint against the pre-fix literal parent-path expression. No other failures. |
| Resolved portability failure | Complete node --test test/portability.test.js:5PASS; portability-controls.log. Final plugin lint exit0. The equivalent path predicate was independently compared across5461 strings and actual path binding controls. |
| Final runtime closure | closure-controls.log:7PASS; focused-final.log:18PASS. Actual script/library/interpreter/preload drift invalidates proof, acceptance and direct/transitive exceptions. Postflight mutation, ignored/relative inputs, declared scope and retained diagnostic controls pass. |
| Final CLI consumer | node --test test/current-cli.test.js test/gatereeve-cli.test.js test/developer-documentation.test.js:9PASS; cli-controls.log. Missing scope rejects, explicit configuration executes, retired shortcut rejects alone and in both mixed-option orders. |
| Actual npm package | npm pack then unpacked executable integration/help:2PASS; cli-pack.json and packed-cli-controls.log. Dependencies resolved to this checkout's installed dependency tree. No package publication or installation claimed. |
| Desktop | npm --prefix apps/desktop test:173PASS on final unchanged desktop/core bytes; desktop-tests.log. |
| Trusted Python/helpers |58 helper and29 pattern tests PASS reused from repair13; unchanged source and built helper bytes verified. python-tests.log,pattern-python-tests.log. |
| Actual OpenAI | Actual opt-in fresh gpt-6.1-sol high-reasoning evaluator1PASS, no skips; live-evaluator.log/json and live-roundtrip.json. Receipt passes public2.1.0 validation. Fixture transport proof, not this PR's quality verdict. |
| Plugin/platform | Final lint/build/native validation exit0; plugin-lint.json,plugin-build.json,native-validation.json. Earlier portability failure remains separately retained. |
| Documents | Installed validate_branch_docs.py,lint_issues.py,lint_tracker.py,gate_triage.py allPASS on final source; document-validation.log. |
| Packaged application | Actual universal package and ARM64 established-run smoke PASS; package-result.json,package-verified.json,package.log,runtime-result.json,runtime.log,runtime.png. Established IMPLEMENTING workflow preserves native spec authorization and reconciliation/pattern applicability with unchanged journal; setup/panes/terminal tested. Screenshot inspected. Pattern smoke is synthetic transport evidence only. |
| Built content | final-build-binding.json:48 protocol/helper files across actual app.asar and both native plugin packages,144 exact matches to final product source. No included product byte changed after6187bc6; final CLI separately repacked/tested. |
| Hygiene | Changed product/test diff passes git diff --check. Original diagnostics retain original whitespace. |

## Source attribution

The broad run began on0ca123a. The only later product changes were the equivalent POSIX path predicate at6187bc6 and the CLI shortcut/docs repair at02bb2ec. The new CLI test was not part of that already-running broad suite; it ran separately. Final core7/18, portability5, CLI9/packed2 checks cover these differences. Desktop173 and package/runtime are on unchanged final desktop/native/core bytes. This is explicitly composite coverage, not a zero-failure exact-final-source broad rerun. The independent reviewer has examined the narrow applicability; formal code/spec and fresh native Judge remain separate required verdicts. See source-attribution.md.

Package:/tmp/gr-repair15-package.AP7NlS/GateReeve-0.1.0-rc.16-macos-universal.dmg
Bytes:253641009
SHA256:ae677dffb57fde208fa61984d524547a88523647a2ef370d470a628132481b89
Trust:development ad-hoc. No installed release, signing/notarization or publication claimed.

## Limits

External runtime declarations are explicit model-selected dependency-scope commitments. The core binds declared/discovered bytes and rejects unresolved supported paths; arbitrary opaque program dependencies, machine state and remote services are not automatically inferred. Reviewers assess conservative scope. Known loader values are retained only as hashes. Only the trusted feature's current evidence store is excluded from directory capture.

Host interception remains configured-hook-unverified-host; handler/subprocess/protected adapters are tested, arbitrary shell interception and installed-host activation are not claimed. The configured pattern list is empty, so there is no substantive pattern-rule coverage. No exact-current hostedCI, Intel runtime, installation or release claim. Local mirrors are redundancy rather than external backup. These limits do not add a deployment prerequisite to pre-merge acceptance.

## Governing coordinator

Installed rc.16 core/gate methods govern this feature. An independently tested process-local loader provides three advisory transport modules at original URLs: compact encoding under128KiB and bounded formal-view-audit reading/classification under12MiB. Exact bytes/hashes/containment and full bundle/receipt validation remain; all51 structured prior findings plus the retained formal16 CLI failure remain available for appropriate review. coordinator-transport.md records the change and tests. Optional advisory results are noncertifying. The mandatory Judge is a fresh native OpenAI execution, independent of the implementer and blind to earlier reviewer/advisory history under the installed policy.
