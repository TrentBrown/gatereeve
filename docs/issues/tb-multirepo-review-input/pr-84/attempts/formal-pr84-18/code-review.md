# Independent code review — formal-pr84-18

Verdict: **PASS**. **No material actionable finding remains supported on this pin** after the scoped delta review and qualified carry-forward. This is a code-review verdict, separate from spec evaluation and native Judge.

## Identity and review scope

Base: `643e3ea2b03f19b66595219c4f8df934596aa436`. Evaluated head: `7e2e252613ca4c48b2f4c4bf9693e1754f5ce539`. Final product: `d924492cc4f1ec825eaebcd5897c08208532cc38`.

Immutable source: `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-q7Ni5k/repository`. Installed view digest: `sha256:3d21047201248533f820cfbc713c9748119ed47c783d67f7be40f3171a1be41d`.

Reviewer: `/root/formal_code_spec`, continuing independent nonimplementer context. This is not a fresh history-blind provider session. I made no product edits, core events, gate declarations or remote mutations. The native Judge is separate. The review uses qualified formal17 coverage of unchanged implementation, fresh D11/interacting-source assessment, my disclosed actual before/after probes, and the current bound verification. Earlier verdicts do not themselves authorize present passage.

`P/` means `plugin-src/shared/resources/protocol/`; `S/` means `plugin-src/shared/resources/scripts/`; `E/` means `.gatereeve-agent-evidence/`. Source references identify this pin. Independently checked requirement SHA256: spec `6605689bcaa20491d046c5ac89bc27c1f800486218512491edc0708cf7b039e5`; design `1929d6d96da2374645ca8833adb3c1c6b229890de89815c4dfa74dacce19ae4c`.
## Evidence applicability and independent work

I compared the formal17 immutable view with this pin. The canonical implementation delta is `P/current/{authorization,actions,adapter,contracts,core}.js`, `S/merge_verified.py`, `cli/src/commands/current.js`, and `apps/desktop/renderer/current-view.js`; accompanying tests, inventory, policy/command guidance and README changed. The other canonical source domains examined remain byte-identical. I rechecked the new authority path against existing candidate, proof, exception, integration, persistence and consumer behavior. Earlier class-based findings remain context; I do not claim an itemized re-audit of every historical finding.

All **170 present changed-file Git blobs** match the **327-entry inventory**. All **147 retained build-comparison rows** match **49 pinned canonical protocol/helper files**. The package records identify final product `d924492…` and DMG SHA256 `38279468e5d9a98087f7a41ac923798412f14295ec391506ca1c49ba95132d96`. These are independently checked retained comparison records, not a new package build by this reviewer.

The current broad run reports **172 PASS, 2 FAIL, 1 intentional opt-in SKIP** and began while source was changing. It is not an exact-final all-green suite. Its failures are retained: the long-history operation lost current implementation authorization during evolution, and the transitive exception negative correctly rejected unsupported scope but expected the old error text. Frozen product evidence supplies **15 permission/runtime controls PASS**, **66-history-record/33-closure test PASS**, and **corrected transitive exception test PASS**. The correction changes only the expected message, not acceptance or product behavior. Inspection of the failure, corrected assertion and actual final reruns supports this reconciliation; the reason for the original history failure is the coordinator's attribution, while the frozen rerun independently establishes the required long-history behavior.

Prior broad feature coverage remains explicitly composite: **366 PASS, 1 resolved portability FAIL, 1 intentional SKIP** out of 368, with its qualified final domain controls. Current D11 source, its interacting authority/runtime paths, and changed trusted helper have fresh targeted evidence instead of an unsupported assertion that all earlier tests ran this final tree. Current **Desktop173**, **actual unpacked CLI2**, **surface/portability/docs18**, and **merge-helper3** pass. Python58/pattern29 and the actual provider transport fixture are carried only for applicable unchanged domains; merge helper/runtime changes are separately covered.

Before this pin I independently reproduced six D11/adjacent defects, then ran **12 repaired/positive/consumer checks**, as retained in `verification/standing-authorization/independent-review.md` and its probe evidence. The last probe ran committed `d924492…`; final file fingerprints match this snapshot. Those probes use real core/Git/journal/runner/helper/CLI operations with simulated GitHub and evaluator transport, not actual hosted PR mutation. They cover wrong target, final-await revocation/expiry, draft retry, discovered Git, discovered Python/Git integration, positive nonempty SLICE/FEATURE merges and consumer surfaces.

On the immutable formal18 view I additionally ran **3 tests PASS**: `node --test --test-name-pattern='standing status uses|integration observation uses|independent-gate exception binds' cli/test/current-core.test.js`. Attempted renderer rerun fails before application loading because this isolated view omits the `linkedom` dependency. That is an independent rerun limitation, not a renderer PASS or demonstrated product defect. The prior independently passing same-byte renderer test and supplied final Desktop173 remain applicable.

I inspected the retained actual ARM64 package runtime report and screenshot: established IMPLEMENTING state, implementation authority and reconciliation/pattern qualification, read-only observation, current shell/renderer. It is not merely a DESIGNING launch. It does not establish an actual standing hosted merge or native Intel runtime. The carried actual OpenAI fixture/public 2.1.0 roundtrip has context `01a16cc8-7243-7180-91b2-9329b2bccd42`, high reasoning, fresh context/zero inherited turns and output digest `sha256:ebc8c5acd8501e78729ba56caf46e4378e3a76b5666fb0f2dc81c2bf812c41dd`; transport code is unchanged. It is not a newly executed formal18 provider run or this PR's quality judgment.

Historical `explain-smoke.json` and `packet-validation-clean.json` copies in the immutable evidence view are baseline artifacts, not current formal18 explanation/packet validation. Neither supports this verdict as a current gate result. The current matrix and regression reconciliation control evidence attribution.
## Changed-path review and dispositions

- **Target scope:** `P/current/authorization.js:82–100` checks each selected repository/source prefix and live authorized target against the candidate. The same-candidate retained integration exception applies only when qualifying an existing acceptance (`:138–145`), preserving completion after legitimate target advancement; new applications cannot use it. The original acceptance-only wrong-target reproduction is now rejected.
- **Revocation and expiry races:** `P/current/actions.js:96–102` rechecks the original journal state after all asynchronous authorization qualification and checks expiry synchronously before merge. `authorization.js:109`, `:129–133` rechecks validity/expiry around application publication, with original-state CAS. Both original actual-operation late-revocation/late-expiry reproductions now prevent the merge write.
- **Permission separation:** `P/current/contracts.js:71–99`, `authorization.js:24–41`, `:113–136`, and `core.js:523–540` preserve explicit actions, candidate scope, every-required-gate PASS and separate direct exceptions. No deployment action is accepted. Exact prepared action/method/source/target remains required. Latest amendment/implementation binding prevents reverting document bytes from reviving old standing authority.
- **Abort recovery:** `P/current/actions.js:116–126` restores only the same unmerged open PR that this invocation promoted from draft, and verifies restoration. The realistic draft-state probe now prepares again after revocation, without merging. Closed-policy preparation does not require draft and retains its existing reclose behavior.
- **Consumer runtimes:** `authorization.js:12–16` and action callers honor configured Git. `actions.js:144–149` forwards supplied Python options and selected Git; `S/merge_verified.py:30,53` uses it in both subprocess paths. Actual integration with unavailable process/helper PATH succeeds using explicit discovered runtimes. This repairs the adjacent observation failure after an otherwise successful merge.
- **Surfaces and distribution:** `core.js:580–596`, `P/current/adapter.js:65`, CLI standing commands/status, and `apps/desktop/renderer/current-view.js:12` expose scope, provenance and inactive reasons through the shared core. Inventory/build comparisons include the new authorization module and changed helper. Guidance retains open-draft default and independent deployment permission.

I also checked interaction with current proof qualification, recursive exception risk, retained decision closure, readiness/milestone checks and original-run publication. D11 adds no alternate evidence acceptance path: applications use the existing current PASS inventory; protected merge and factual integration still execute through the core.

## Whole-feature criterion coverage

| Rows | Assessment basis |
| --- | --- |
| R1–R7 | Qualified unchanged planning/source/containment/persistence/local-finalization coverage, with current authority/target/decision-closure interactions rechecked. |
| R8–R14 | Unchanged evaluator/runtime/delta/history machinery compared byte-for-byte; retained actual transport evidence and frozen long-history/exception controls reviewed. |
| R15–R18 | Fresh standing/direct-decision, permission, race, cleanup, discovered-runtime, CLI/renderer and packaged-consumer assessment described above. |
| R19–R21 | Unchanged current cutover/resume/metrics coverage, current adapter additions inspected and current package observation reviewed. |
| R22–R23 | New scoped standing authority and consumer/default-PR requirements assessed directly, including all six reproduced/fixed issues and positive operations. |

The separate spec report supplies individual PASS/FAIL/NOT YET decisions for all 23 rows and all 8 ACs. No older PASS was substituted for a newly changed authority requirement.

## Scope and residual limits

Approved D11 adds standing authority; it does not remove planning, actual gate evidence, integration, completion or deployment boundaries. Acceptance-only grants never imply merge. Direct human candidate decisions/exceptions remain separately available. Existing PR84 is closed; open drafts are the default for repositories without explicit closed policy. This assessment grants no authority to merge, install, publish or deploy.

No supported current scope expansion, requirement gap or contradiction was established. No claim is made of installed-host interception, arbitrary-shell enforcement, exact-current hosted CI, signing/notarization, production publication or Intel runtime. Empty rules and the synthetic smoke evaluator do not prove substantive pattern-rule coverage. Human instruction provenance is cooperative, local mirrors are recovery redundancy rather than external backup, and remote rechecks do not create atomic GitHub target CAS. Runtime declarations are conservative dependency-scope commitments; unknown opaque dependencies require declared wider scope/fresh proof, not inferred equivalence. The disclosed old-coordinator transport compatibility changes grant no product verdict and are not counted as D11 runtime proof. Original failures and prior reports remain unchanged.
