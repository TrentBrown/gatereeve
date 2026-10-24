# Independent authority and waiver-policy repair assessment

Reviewer: continuing independent nonimplementer agent `/root/formal_code_spec`. This is bounded repair evidence, not a formal gate passage or a fresh native Judge. Original Judge20 FAIL and all previous reports remain unchanged. No product/canonical-test/core-event changes were made by this reviewer.

## Assessment

Both Judge20 defects are independently established and repaired in the inspected working source. Seven current-source tests passed: three independent actual-operation probes and four existing standing/interrupted-amendment controls. No further supported blocker was found in these changed authority/policy interactions. Final packaging and formal assessment require their own source pin and bound verification.

Working-source SHA256 fingerprints at validation:

| File | SHA256 |
| --- | --- |
| current/contracts.js | 9c63444cc79a4a818b31e9236bd0e2848d77d25a74022591edf8b100ed395fe0 |
| current/core.js | 3e8855e31731538ff85977808c98c2cd06891272087cb8a91e573056c781dd9e |
| current/authorization.js | ca13ccb7d9311537640e9fe6121faba8ba70bf6b283bf95fd592c8b0f4ccff06 |
| cli/src/commands/current.js | 2b9cc1056caa824370e3ebc14b6c732befcd0d35f1579ab1e638b99f8eccdf34 |

The first three paths are under plugin-src/shared/resources/protocol/. The CLI basis option/documentation was inspected, not independently exercised through a new CLI subprocess in this repair review.

## Original actual-operation observations

Before probes import an isolated extraction of exact formal20 head3463e054dcbfa46833b7907f9f36ce3a8dd38e89 (product78327bd) at `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gr-judge20-before-jv3_owrr`. Later working edits cannot change their source.

F1: authorize/review/accept A; amend designB without implementation continuation; restore designA; spec.validate; candidate.prepare; ready. The old source accepts the historical design and implementation approvals and reproduces the identical candidate. A stronger probe first records exact merge.prepare/authorize-merge using real local Git/bare remote plus read-only fixture gh view. After rollback, actual milestone.check merge returns allowed:true, missing:[], although the latest commitment decision remains amendmentB. No gh merge/write or external contact occurs. See independent-authority-before.log and independent-direct-merge-before.log with their .txt probes.

F2: enable Whiteboard, commit a behavioral app.js change from export42 to43, prepare its candidate, issue ordinary explanation and Whiteboard waivers without policy-amend. Actual acceptance check reports both outcome UNAVAILABLE, satisfied:true, exceptionKind waive. Other obligations remain missing; this is proof of those bypasses, not full acceptance. See independent-waiver-before.log/probe.

The approved C1 preserves enabled obligations and forbids changing exception policy; C5 explicitly requires applicable policy amendment for a non-waivable gate. Base workflow-model.json1019–1022 makes explanation non-waivable;860–864 constrains Whiteboard to non-behavioral-only. Original boundary.js198–210/projection.js615+ require an explicit human NON_BEHAVIORAL classification and evidence, not an automated classifier. These are preserved policy requirements, not old scheduling choreography.

## Current actual-operation results

**Direct rollback, amendment restoration and renewed merge authority: PASS.** The current version of the original direct-merge probe rejects restored-A spec validation, implementation admission, candidate preparation and merge.execute. Merge check explicitly requires new acceptance and merge authority. An explicit restoring amendment with previousSubject=B and implementation continuation succeeds; the old retained candidate fails its authorization-event check and a newly prepared candidate has a new identity. After qualified review evidence, fresh direct acceptance and fresh exact merge authorization, merge check succeeds. No gh writes occur. See independent-direct-merge-fixed-rerun.log:1PASS,42.156s. The script's test title was retained from the original defect probe; its assertions now require the repaired behavior.

The first fixed run reached the renewal path but my borrowed reviewAll helper assumed every gate returns a fresh event. Legitimate proof reuse returns results directly, producing a probe TypeError. I corrected only the disposable helper to support both shapes and reran successfully. The initial failure log remains independent-direct-merge-fixed.log; it is not a product defect or hidden failed test.

**Separate explicit approvals and old-policy expiry: PASS.** A fresh approve-design for restoredA followed by spec validation still cannot authorize implementation. A new explicit implementation decision enables work. Its candidate identity differs; the old explanation policy/waiver no longer satisfies admission, and an ordinary new explanation waiver rejects. See independent-explicit-approval-fixed.log:1PASS,1.997s. This separately exercises direct approval recovery as well as the combined-amendment positive above.

**Constrained basis and explicit override: PASS.** Ordinary explanation/Whiteboard waivers reject. Unsupported classification and extra basis fields reject. A retained NON_BEHAVIORAL basis qualifies the human-scoped Whiteboard exception, while its verdict stays UNAVAILABLE. Deleting and corrupting the retained basis independently make that obligation unsatisfied; byte restoration recovers it. Separate explanation policy-amend then waiver succeeds, as does combined Whiteboard policy-amend+waive. Context/packet/retention policy overrides reject. See independent-waiver-fixed.log:1PASS,2.009s. This does not claim the system automatically proves the human's classification truth.

**Adjacent controls:4PASS.** Executed current canonical tests for amendment continuation/version retention, interrupted combined-amendment retry, explicit/run-scoped/revocable standing authority, and standing scope/commitment/remote/branch restrictions. See independent-adjacent-fixed.log:4PASS,5.558s. Standing behavior remains distinct from direct permission and requires actual gate PASS.

## Source interaction review

contracts.js104–111 selects the latest implementation-or-amendment and latest design approval-or-amendment; direct candidate decisions and policy exceptions are filtered to that authority period. core.js uses the same selection for planning/admission and the previous amendment lineage; its candidate authorization-event check prevents same-byte restoration from substituting an old approval. authorization.js applies the shared filter before standing-specific qualification. Proof reuse remains separate from human permission: the positive renewed path exercised legitimate reused results without reviving old acceptance/merge.

contracts.js restores explanation waivable:false and Whiteboard's constrained policy; explicitly allowed policy-amend overrides remain limited to named policy gates, excluding integrity/authority. core.js reads basis bytes at decision publication and again during qualification. Existing complete decision-closure validation also retains those evidence references. The CLI exposes a typed basis JSON input; no automatic behavior classifier or implicit merge/deployment permission was added.

Affected criteria are R1/R4/R9/R15/R16/R17, with R18 CLI and R22/R23 standing interactions inspected. The new authoritative policy barrier is not a new execution-order requirement. Interrupted combined instructions and explicit new approvals retain their supported recovery path.

## Reproduction and limits

Scripts are retained as non-executable .txt; copy to .mjs under /tmp to execute. Before scripts import the isolated original tree; fixed scripts import the working tree and therefore require the fingerprints above for exact reproduction. All probes use disposable local repositories, actual trusted validators/current core operations, and fixture reviewer/gh responses; no actual provider evaluation, hosted merge, network operation, installation, release or desktop/package run was performed here. The fixed direct probe checks actual merge.execute rejection and final merge eligibility, not successful external integration.

Current commands were node --test on the three fixed probe files and node --test --test-name-pattern='standing authority is explicit|standing scope rejects|combined amendment records a pending|amendment can authorize implementation once' cli/test/current-core.test.js. Prior broad suites, parent tests and future packaging are not counted as this reviewer's fresh execution. No claim is made that every historical finding was individually re-audited. Final formal verdict remains separate.
