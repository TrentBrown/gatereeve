# Independent code review — formal-pr84-19

Verdict: **PASS**. No material actionable code finding is supported. Product is unchanged from the qualified formal18 assessment; the retained execution-evidence export gap has been independently rechecked in the current Verification body. Separate native Judge passage is not implied.

## Identity and qualification

Base: `643e3ea2b03f19b66595219c4f8df934596aa436`. Evaluated head: `39c5fa3c657cb2caa2e7c343b4d80e0cab6130e8`. Product remains `d924492cc4f1ec825eaebcd5897c08208532cc38`.

Reviewer: `/root/formal_code_spec`, continuing independent nonimplementer context, not a new history-blind provider session. No source edits, protocol events or remote mutations. Native Judge19 is separate and its passage is not claimed.

I independently compared formal18 head `7e2e252613ca4c48b2f4c4bf9693e1754f5ce539` with this exact head: all 82 changed paths are feature records under `docs/issues/tb-multirepo-review-input/`; there is no product/test/distribution change outside that feature home. Approved spec and design bytes are also unchanged. Consequently formal18's qualified whole-feature and D11 assessment applies to unchanged code; the fresh delta assessment concerns inspectable evaluator evidence. Formal18 reports and its failed native Judge remain untouched. This is a new independent verdict, not a claim that the old Judge passed.

For code, I use the immutable formal18 source view `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-q7Ni5k/repository`, digest `sha256:3d21047201248533f820cfbc713c9748119ed47c783d67f7be40f3171a1be41d`, qualified by the exact Git comparison above. This is not represented as a new formal19 snapshot. Source line references remain valid. `P/` means `plugin-src/shared/resources/protocol/`; `S/` means `plugin-src/shared/resources/scripts/`; `E/` means the current formal19 attempt evidence directory. Approved requirement SHA256 remains spec `6605689bcaa20491d046c5ac89bc27c1f800486218512491edc0708cf7b039e5`, design `1929d6d96da2374645ca8833adb3c1c6b229890de89815c4dfa74dacce19ae4c`.
## Fresh evidence qualification

Formal18 native Judge failed R8 because its installed export did not include the actual retained evaluator execution evidence cited by Verification. That is an evidence-availability gap; this report does not rewrite it as a code defect or a past PASS.

The authoritative current report is **`E/verification-with-receipt.md`**, SHA256 `fc3f02030e846c828c653d19236ab18693aa10d4eafe8100c801a508a1f62302`, associated with the supplied superseding verification event `evt-pr84-19-verification-receipt-complete`. `E/verification.md` is the retained initial version. Because the installed export permits only image/PDF side attachments, the current Markdown body embeds the actual four retained records; my conclusion does not rely on inaccessible JSON side attachments. I independently compared each fenced record with its original file bytes (only Markdown fence-separator whitespace follows the exact bytes) and checked the printed SHA256:

| Embedded original | Bytes | SHA256 |
| --- | ---: | --- |
| `live-evaluator.json` | 5763 | `ca51e91a408ad1c03ff8b3bfaa98408f2d96406f4ca8b37111f557b456463279` |
| `live-evaluator.log` | 199 | `6e88577b8fe73e5dffd126b9a2f37dc977efba9f88d959ee65bba3352adc153d` |
| `live-roundtrip.json` | 433 | `06979bb6a931cac814ec715cbe872258662db19622811f96d2f305e3ef9e94a2` |
| `retained-evaluator-validation.json` | 475 | `f0ab7935580903282dbf819c8a168ccafd425b03f11519e16798dfc639064de6` |

I executed the unchanged current public `validateAgentWorkflowReceipt` and `validateAgentWorkflowStageResult` against the embedded receipt/output. Both passed. I independently recomputed the three retained canonical object references and their byte sizes (current execution receipt plus provider receipt/output), checked run/input/attempt/context linkage and the single code PASS outcome, and matched the output digest against both validation summaries. A changed-output negative control was rejected for output-digest mismatch. The retained input/snapshot digest linkage is checked; the original full provider request is not separately reconstructed or rerun here.

Actual retained provider context: `01a16cc8-7243-7180-91b2-9329b2bccd42`, `gpt-6.1-sol`, high reasoning, high-capability-v1, protocol2.1.0, fresh context/zero inherited turns, read-only/no-network/isolated-scratch policy. Output digest: `sha256:ebc8c5acd8501e78729ba56caf46e4378e3a76b5666fb0f2dc81c2bf812c41dd`. The original opt-in execution log records one PASS in 18.46 seconds. This is retained actual execution/transport evidence, **not a newly executed formal19 provider run or this PR's quality verdict**. The current public validation recheck is fresh. Provider/execution/validation source is unchanged, so the scoped reuse is supported.

## Carried verification applicability

The unchanged product retains formal18's explicit composite coverage: source-evolving broad **172 PASS, 2 FAIL, 1 intentional SKIP**, frozen **15 permission/runtime controls PASS**, **66-record/33-closure history PASS**, and **corrected transitive scope assertion PASS**. Both original broad failures remain disclosed. The older broad feature baseline remains **366 PASS, 1 resolved portability FAIL, 1 intentional SKIP** out of368, with its qualified domain controls. Neither broad run is relabeled an all-green exact-final suite.

Current bound records retain **Desktop173**, **actual unpacked CLI2**, **surface18**, **merge-helper3**, universal ad-hoc package/actual ARM64 smoke and **147 build comparisons across49 protocol/helper files**. Formal18 independently checked all147 comparison hashes and170 present changed-file blobs; unchanged product bytes preserve that result. DMG SHA256: `38279468e5d9a98087f7a41ac923798412f14295ec391506ca1c49ba95132d96`. Python58/pattern29 are applicable unchanged-domain evidence, with changed merge-helper behavior separately covered.

My earlier D11 delta assessment retained six actual before/after findings and12 passing repaired/positive/consumer checks. Formal18 additionally ran three pinned scope/Git/Python controls PASS. Its renderer rerun could not load omitted `linkedom`; that remains a disclosed snapshot rerun limitation, supported by the passing same-byte pre-pin renderer and supplied final Desktop173. No unrelated tests were repeated for formal19's evidence-only change. Historical explanation/packet-validation copies are not formal19 gate results. The fresh receipt check above is the new executed validation.
## Changed-path review and dispositions

- **Target scope:** `P/current/authorization.js:82–100` checks each selected repository/source prefix and live authorized target against the candidate. The same-candidate retained integration exception applies only when qualifying an existing acceptance (`:138–145`), preserving completion after legitimate target advancement; new applications cannot use it. The original acceptance-only wrong-target reproduction is now rejected.
- **Revocation and expiry races:** `P/current/actions.js:96–102` rechecks the original journal state after all asynchronous authorization qualification and checks expiry synchronously before merge. `authorization.js:109`, `:129–133` rechecks validity/expiry around application publication, with original-state CAS. Both original actual-operation late-revocation/late-expiry reproductions now prevent the merge write.
- **Permission separation:** `P/current/contracts.js:71–99`, `authorization.js:24–41`, `:113–136`, and `core.js:523–540` preserve explicit actions, candidate scope, every-required-gate PASS and separate direct exceptions. No deployment action is accepted. Exact prepared action/method/source/target remains required. Latest amendment/implementation binding prevents reverting document bytes from reviving old standing authority.
- **Abort recovery:** `P/current/actions.js:116–126` restores only the same unmerged open PR that this invocation promoted from draft, and verifies restoration. The realistic draft-state probe now prepares again after revocation, without merging. Closed-policy preparation does not require draft and retains its existing reclose behavior.
- **Consumer runtimes:** `authorization.js:12–16` and action callers honor configured Git. `actions.js:144–149` forwards supplied Python options and selected Git; `S/merge_verified.py:30,53` uses it in both subprocess paths. Actual integration with unavailable process/helper PATH succeeds using explicit discovered runtimes. This repairs the adjacent observation failure after an otherwise successful merge.
- **Surfaces and distribution:** `core.js:580–596`, `P/current/adapter.js:65`, CLI standing commands/status, and `apps/desktop/renderer/current-view.js:12` expose scope, provenance and inactive reasons through the shared core. Inventory/build comparisons include the new authorization module and changed helper. Guidance retains open-draft default and independent deployment permission.

In the qualified formal18/D11 assessment I also checked interaction with current proof qualification, recursive exception risk, retained decision closure, readiness/milestone checks and original-run publication. D11 adds no alternate evidence acceptance path: applications use the existing current PASS inventory; protected merge and factual integration still execute through the core.

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
