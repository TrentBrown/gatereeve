# Independent workspace-configuration repair investigation

Status: **formal22 defect independently confirmed; current repair verified with no remaining supported blocker in this delta**. This is repair evidence, not a formal gate verdict. Continuing independent reviewer `/root/formal_code_spec`; no product/canonical test/gate changes. Formal22's code/spec PASS reports and native Judge FAIL remain untouched.

## Exact before source and operation

Evaluated source `6d36117b1ad007141647b2739b4b6a1af9f45269`, product `7afb6feeadedb858091633f7a2c9e0463a94bc51`. A disposable exact `git archive` of plugin-src/shared/resources was used; the probe imports that archive, not the concurrently repaired checkout. Script `independent-config-before.txt` and raw `independent-config-before.log` are retained verbatim. Original runnable script: `/tmp/gr-judge22-config-before.mjs`; archived source path is recorded in that script.

The fixture creates a real parent `.agentic-workflow.json`, real Git working tree and local bare remote, approved documents, trusted specification/reconciliation checks, real executed Verification and qualified fixture evaluator results. It resolves the context using the public `resolveWorkflowContext`, records an actual standing acceptance+merge grant, prepares the candidate/action and derives acceptance+merge authority. Each merge executes through public `executeCurrentRequest`, which performs its own real context resolution at request entry. Only reviewer answers and GitHub transport are fixtures. Git operations remain local with insteadOf routing; no network or hosted write occurs.

At the `gh pr checks --watch` boundary, the fixture performs a real filesystem edit. A later `gh pr merge` call sets the writer-reached flag and throws a sentinel; it never merges anything. This establishes action reachability, not a completed hosted merge. The core restores draft status after the sentinel. All seven variants reached that writer despite no intervening journal event:

| Actual edit during checks | Stale in-flight operation | Newly resolved public status |
| --- | --- | --- |
| integration/release target changed from main to elsewhere | Merge writer reached; cached standing allowed | Candidate invalid |
| keepPullRequestsClosed false to true | Merge writer reached; cached standing allowed | Candidate invalid |
| selected repository path reassigned to real second clone | Merge writer reached; cached standing allowed | Candidate invalid |
| selected app alias removed, other alias remains | Merge writer reached; cached standing allowed | Unknown repository alias error |
| parent configuration deleted | Merge writer reached; cached standing allowed | Falls to legacy current-entry context |
| configuration replaced with malformed JSON | Merge writer reached; cached standing allowed | WORKFLOW_CONTEXT_ERROR |
| closer repository-local configuration inserted selecting another feature home | Merge writer reached; cached standing allowed | Different current-entry context |

Actual result: **1 test PASS asserting seven defective scenarios**, 74.409 seconds test time (74.466 seconds total). Each mutation was confirmed executed, each writer reached, event count unchanged, and final fixture draft status true. Exact original configuration is restored between variants. Fresh request behavior establishes that the parser can detect/reinterpret the edits; the in-flight core never asks it again.

## Supported finding

**P1 — Bind protected operations to live resolver configuration.** `current/adapter.js:92` resolves once; `current/core.js:70–77` retains and returns copies of that context. `current/evidence.js:203` compares candidate identity to cached repository configuration, and `current/authorization.js:43–59` binds configured policy through the same cached context. The post-check qualifications in `current/actions.js:83–104` can consequently reach the merge writer with obsolete scope/policy. Root configuration is excluded from source capture, and a parent configuration need not be application Git content. Relevant criteria: R1/R11/R16/R17/R22; C2/C4 and D11 require current input and scope applicability.

## Minimal repair and regression considerations

Re-resolve from the original request's cwd and explicit/implicit repository selection using the selected Git runtime. Compare against an immutable normalized original resolution, including mode, canonical feature/home/workspace/config selection and authority-relevant repository identity. Reject changed/unavailable resolution; never switch the active store/core silently. Re-resolution from only the old workspaceRoot misses nearer insertion; retaining only the selected alias misses implicit selection changes. Capture the baseline rather than comparing two views of a mutable shared context object.

Use the same check at core entry, current qualification/final admission, standing validity, merge preparation and final protected writer. Keep journal-state checks after asynchronous validation and preserve synchronous deadline checks at the final writer. Configuration loss/malformed data and selected repository removal must fail closed, while a new explicit operation after repair may re-resolve normally. Existing cleanup should safely restore the draft/closed posture it changed.

Required adjacent controls: closer config insertion/removal and legacy-to-configured transition; selected alias/path/base/remote/target/closed-policy drift; configured Git with unavailable PATH; equivalent formatting/key order/default expansion and externalTask metadata remain allowed after normalization. A change to an unrelated repository can conservatively interrupt one in-flight observation but must not permanently invalidate unrelated retained proof on a new resolution. Check status/read-only desktop paths as well as mutation entry points.

## Limits

The original before result is retained above; fixed-source results and their qualification follow below. This probe deliberately covers a standing-derived action and public protected merge with a writer sentinel; it does not execute actual hosting, integration, deployment or release. The negative paths preserve state because the sentinel stops before publication. Synthetic evaluator answers do not assess product quality. These bounded operations do not replace the next independent formal code/spec/native Judge gates.

## Fixed-source qualification

Final product commit: `4cc0fab1dab6833e66a36a4e427168a2967052e5`. Four affected canonical source fingerprints were captured before the final rerun, remained unchanged through it and the standalone follow-up, and were checked against this commit and byte-identical staged Desktop copies:

| Source under plugin-src/shared/resources/protocol | SHA256 |
| --- | --- |
| context.js | `6a591d342d4d9ed53cbe4b4ad1c6d87a0958fd0a9a65f729f36499a652cd8d2f` |
| current/core.js | `ca653ece1f3d86e7eafc140280426aa72de9d6345c97f7be5ac5b2b606e8d3c3` |
| current/authorization.js | `84ba2f89bee57e3b58f94b37ddc2191b379d926cc7165d49f0caabba33c25bb7` |
| current/actions.js | `56f5c37db689eda2928ac8d3fea8a872ddab384ae9669d7a576de4991625ff79` |

The repair retains resolver discovery inputs privately in a WeakMap and stores an immutable normalized context identity at resolution time (`context.js:314–355`). Re-resolution uses the original requested path and explicit/implicit selection, plus the selected Git executable. It compares mode/workspace/config selection/feature/home/selected alias and sorted normalized repository identities; it excludes externalTask and formatting. It also detects mutation of the original context rather than allowing that mutation to redefine its baseline. Resolved context clones cannot silently fall back to unbound contexts. Explicit direct in-memory embedder contexts remain supported; public native/CLI/Desktop contexts use the real resolver.

Core checks run before mutations and during qualification/final admission. Standing validity checks at both ends, and merge preparation checks at both ends. The final admission guard includes context verification before its synchronous evidence-deadline check. Decision final qualification now follows candidate/document reads, uses the proposed waiver/acceptance view with original-state publication CAS, and synchronously checks standing grant expiry. Additional append context checks are limited to candidate/readiness publication; pass/application already have their final guard, avoiding an extra context await after deadline qualification. Protected merge retains its final state and synchronous deadline checks.

### Actual independent fixed operations

1. **Seven public merge negatives PASS.** `independent-config-fixed.txt` repeats the exact before operations with fixed expectations. All seven real edits at hosted-check wait block before the merge writer, preserve event count, restore the open draft and report cached standing authority inactive. Initial run1PASS in67.518s; final-byte aggregate rerun's same test PASS in74.141s. Fresh public status continues reporting changed candidate/selection/error/current-entry honestly. No same-run passage is synthesized.
2. **Normalization and cached Desktop positive/negative test PASS on standalone final-source rerun.** The actual `createProtocolAdapter` resolves once and repeatedly observes its cached context. Formatting, externalTask metadata, reversed repository-map insertion order and explicit equivalent defaults all preserve canonical core and cached Desktop implementation eligibility. A changed feature invalidates cached Desktop eligibility and core mutation; restoring the original config recovers. Cloned resolved contexts and mutated original context objects reject. Exact script is `independent-normalized-final.txt`.
3. **Resolver transition and selected-Git control PASS.** Actual configuration deletion rejects the old guard; a legacy resolved context detects subsequent configured-mode insertion; deleting a closer config to expose its parent rejects the old closer resolution. Legacy re-resolution using `/usr/bin/git` succeeds with process PATH empty and is restored afterward. This checks discovery/selection rather than mocking resolver output.
4. **Prior final-write expiry interaction PASS on final source.** The retained actual merge probe advances the clock during the final state read; external proof expiry rejects before the writer. Its test title was inherited from an older probe, but the script and emitted JSON explicitly assert `externalProofExpiredDuringFinalStateRead:true` and `mergeWriteReached:false`. Final aggregate test time28.885s.

### Failed aggregate and successful focused rerun

The final aggregate command ran the seven-case merge test, normalization/Desktop test, resolver-transition test and deadline test together. Actual outcome: **3PASS/1FAIL**,74.215s total. The one failure was the normalization/Desktop test's initial baseline snapshot, before any config edit: canonical core allowed implementation, but cached Desktop reported false. The original assertion recorded only false-versus-true and the disposable fixture was cleaned up, so its exact blocker is unavailable. This failed log is preserved as `independent-final-aggregate.log`; it is not relabeled a green run.

A standalone rerun on the same four source fingerprints added only a diagnostic assertion message containing the milestone object; no behavioral expectation or product code changed. It passed both tests, including all four normalization positives and Desktop/guard negatives: **2PASS/0FAIL**,2.331s total. The earlier initial standalone run also passed2tests. The coordinator confirmed concurrent Desktop/CLI/package staging around the aggregate, which could transiently alter staged helper resources, but this is a plausible explanation rather than an established root cause. The coordinator subsequently stated that no further staging is planned; the exact overlap of the earlier staging with this transient was not established. The actual source identity checks above and targeted rerun qualify the covered behaviors while preserving the unresolved transient's evidence.

### Assessment and remaining limits

The supported formal22 defect is repaired in the tested public execution and cached-consumer paths. R1/R11/R16/R17/R22 affected behavior now rejects actual file drift, while R10/R18 normalization and consumer controls avoid an observed persistent false block. No remaining actionable defect was established by this focused repair inspection. The historical native failure and formal22 reports remain untouched. This is a qualified composite of the final aggregate's three passing tests and the exact-source two-test standalone rerun, not a claim of one all-green aggregate or a new full-feature suite.

No new packaged application, full Desktop suite, real evaluator run, hosted merge, integration, installation or release was executed by this independent probe. Existing runtime/package evidence is the coordinator's separate responsibility. The configuration guard provides repeated observation, not atomic locking against arbitrary external file writers. New requests can deliberately resolve the changed configuration; an old core never silently switches its feature/store. The unproven transient Desktop baseline failure remains disclosed for later reproduction if it recurs.
