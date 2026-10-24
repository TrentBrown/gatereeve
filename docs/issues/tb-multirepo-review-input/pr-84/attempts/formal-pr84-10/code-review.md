# Formal code review — PR84 attempt formal-pr84-10

**Verdict: PASS. No material actionable findings.**

Base: `643e3ea2b03f19b66595219c4f8df934596aa436`. Head: `257b22e65bd2ff7b70216b3b4985c91c54c88c16`. Substantive source: `584537956322d74950cf093464769e083fb1486e`.

Reviewed immutable source: `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-4ufT7e/repository`. Supplemented view digest: `sha256:6f26f3f0b7462fc1b60ca910732048ef89300e20a2cec82448f3a1201e450ace`. Its source is byte-identical to the original final view (`sha256:0380e6a1a7d6520a1ba16412491dbdeae51a393ecd29e506d1cf4737502c3779`); the supplement adds verification artifacts. Authoritative contexts are `/tmp/gr-context10-codeReview.json` and `/tmp/gr-context10-specEvaluation.json`. Assessment covers the complete cumulative feature despite the code context's narrower `evaluationScope` label.

Requirements: `docs/issues/tb-multirepo-review-input/spec.md` (SHA256 `2b2f80e655e4a038ddfa77f88dd764a32a2ce8a41ae8678822a3d2f346e5446e`) and approved `design.md` (SHA256 `7639b18419a60766a19aad4b3b90b5c92aa21120a03ea1518d8d3a7232698fd2`). Paths and line numbers below refer to this immutable source. `P/` abbreviates `plugin-src/shared/resources/protocol/`.

## Review assessment

I independently assessed the cumulative current-protocol implementation, source isolation and retained evidence, evaluator execution/admission, reuse and delta history, scoped human authority, persistence/recovery, protected actions, distributed consumers and packaging. All 21 rubric areas and all eight acceptance criteria were considered; the separate spec evaluation records each outcome. I found no supported current defect requiring a priority/file/line finding. This is not a claim that the implementation is defect-free beyond the exercised and inspected scope.

The high-risk interactions were inspected directly:

- `P/current/core.js:132`: failed specification validation retains the actual proof with original run/operation identity. Publication uses the originally checked state. The contention retry requires the same run, unchanged validation identity, no intervening successful validation event, unchanged spec/design bytes and a forward journal position. Replacement/newer validation is protected; pause can coexist with a recorded failure. Typed `ContractError.details.retainedArtifacts` survives the public adapter. Final actual-child tests exercise all six core/public race cases.
- `P/current/core.js:299`, `:311`, `:410`, `:448`: current results require recorded execution provenance and intact applicable inputs. Substantive newer negative findings/criteria and relevant pending outcomes prevent stale PASS admission. Historical delta ancestry/closure relevance is distinct from current consumed-proof authority. Waiver scope recursively binds consumed proof, live environment/configuration/rules, support bytes, validity and named findings; it does not rewrite the original outcome.
- `P/current/execution.js:248`, `P/current/core.js:554`, `P/current/store.js:233`: durable outcome-ready publication precedes job-cache completion, reconciliation retains original outcomes, and run/state guards prevent late jobs from approving a replacement run. Mirrored event/activation storage rejects conflict or loss and supports exact-copy restoration rather than invented events. Regression evidence covers delayed outcome, cache loss/conflict, concurrent completion, lost negative records and replacement races.
- `P/current/evidence.js:24`, `:140`, `P/current/execution.js:68`: source capture accounts for original Git modes and all relevant endpoints. Narrow reserved-history classification removes reports without hiding arbitrary executable/configuration/application files. Original feature review base and current merge target are separately bound. Declared multi-repository scope excludes arbitrary siblings.
- `P/python-guards.js:67`, `:80`, `:86`: trusted validation binds executed helper closure, interpreter/runtime dependencies, bootstrap and environment; pre/post checks preserve actual diagnostics on drift. `P/agent-workflow.js:46`, `:56`, `:150` and `P/local-agent-adapters.js:100` enforce capability/envelope qualification and keep incomplete metric contributions unknown.
- `P/current/actions.js:21`, `:51`, `:107`, `P/current/adapter.js:88`, `P/current/pre-tool-use.js:6`: protected actions revalidate source, action and authority; actual integration remains separate from authorization. CLI/plugin/desktop consumers use the current core and expose exceptions/coverage rather than old scheduling controls.

The review also checked amendment interruption, current resume, local finalization, executed-command coverage, automatic bounded history and unaffected closure carry-forward. Supplied broad regressions include the actual more-than-64-record history exercise, without a remediation-round cap.

## Actual verification and applicability

The retained evidence is under `.gatereeve-agent-evidence/`. Counts are execution evidence, not substitutes for source assessment.

| Evidence | Actual scope and assessment |
| --- | --- |
| `cli-tests.log` | 317 PASS, 1 intentional opt-in SKIP, 318 total on `2e024199def6a0687e09b28b9d64c1458688de3e`. This is earlier-source coverage, not a full final-source rerun. |
| `focused-regressions.log` and independent rerun | 11 PASS on final source. I independently ran the same selected core tests against the final pin: 11 PASS, 0 FAIL, 0 SKIP. Includes six actual-child late-validator races across core/public entry points (replacement, same-run newer validation, pause), combined amendment retry, failed proof retention/loss, and trusted validator drift/refresh. |
| Desktop tests | 172 PASS, fresh final build/test execution. |
| Python tests | 58 PASS from the earlier unchanged helper source; reused, not freshly executed on final head. |
| Live OpenAI | Fresh actual evaluator fixture: 1 PASS, 0 SKIP. Bundled Codex `0.163.0-alpha.11.2`, model `gpt-6.1-sol`, high reasoning, fresh context `01a16c1d-cb27-7103-b23c-86330705e164`, inherited turns 0. I independently validated the returned public envelope and the retained output/receipt hashes and lengths. This proves the native adapter execution and receipt round-trip on the fixture, not substantive acceptance of PR84. |
| Plugins and records | Successful retained plugin lint/build/native validation and four document checks. No plugin installation or host activation claimed. |
| Universal desktop package | Retained package verification and ARM64 runtime smoke, with screenshot inspected. `package-result.json` and `final-build-binding.json` identify DMG SHA256 `579adeea32d5c5ddda7d1dc527fefc3e17f1f696eaf3b0a31197b0e912072687`. All 66 recorded comparisons (22 protocol files across app.asar, Codex plugin and Claude plugin) match final pinned source hashes. Build metadata names pre-commit HEAD `2e02419`; the build used the final uncommitted bytes, separately established by those comparisons. |

I checked the change inventory: all 150 surviving changed files match their recorded Git blob IDs; the 22 canonical protocol files match the desktop distributed copies. The supplemented and original final snapshots have no source differences. The product delta from the broad-suite source is confined to `current/core.js` and its distributed copy: typed retained-proof references on failed validation and a narrowly guarded retry when only unrelated journal contention intervenes. The other changes are test coverage and desktop projection metadata. No Python helper, provider contract or successful-validation logic changed in that final delta.

Reuse is applicable under C4: the broad suite covers unchanged behavior, while the 11 final tests exercise the changed logic and its amendment, retention, phase and public-error interactions. Fresh desktop/provider/package checks cover current consumers. This assessment does not relabel the 317 earlier-source passes as final-source execution. No additional broad rerun is necessary to close a specific unresolved coverage gap identified in this review.

Independent rerun command, from the final pinned repository:

```sh
node --test --test-name-pattern='amendment can authorize|failed specification and reconciliation|combined amendment records|lost failed-spec evidence|trusted validator drift|late failed spec validation' cli/test/current-core.test.js
```

## Limits and scope

Native host activation/interception is explicitly `configured-hook-unverified-host`; handler/subprocess behavior and protected adapters are tested. Arbitrary shell execution remains cooperative. This is the honest coverage allowed by C6/R17, not evidence of installed interception. Actual live provider coverage is OpenAI/Codex; no live Claude execution is claimed. The package is universal, but runtime execution is ARM64 only. It is a development ad-hoc build; public release, signing/notarization, installation, deployment, external branch protection and Intel runtime are not established or required for this pre-merge assessment. No current hosted CI success is inferred from a closed PR or an older reported head.

The actual empty pattern scope establishes no substantive project-rule coverage; nonempty fixtures exercise rule enforcement. Local mirrored records are loss-detection/recovery redundancy, not external backup, and cannot establish integrity after simultaneous loss of both identical terminal suffixes. Hosted merge APIs do not provide an atomic target-branch compare-and-swap; exact target/head and local authority checks constrain, but do not eliminate, the documented remote race. Semantic adequacy of evaluator findings/delta coverage remains an independent evaluator responsibility.

Prior failures were leads, not acceptance authority. Raw prior journals/advisory reports were excluded from the pinned review input. No implementation edits, network access, release actions or protocol passage records were made by this reviewer. The separately running independent Judge remains a separate required gate.

