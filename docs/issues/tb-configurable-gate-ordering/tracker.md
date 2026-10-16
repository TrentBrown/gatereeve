# Branch Tracker - tb-configurable-gate-ordering

**Spec:** [spec.md](spec.md)
**Plan:** [plan.md](plan.md)
**Issues:** [issues.md](issues.md)
**Created:** 2026-10-14

## Workflow Position

Implementation P1-P5 and all R1-R10 passed verification and actual independent formal review. Trent Brown accepted review and merge of exact head 7502477a8af43f24580b8d8e6955120919654b6c on 2026-10-16. PR #81 merged into main at bf9f656535bce04dca659d8f6a1e975d552b1d6d; the trusted ancestry provider verified integration, all ten gate inputs/evidence were rechecked, and the core recorded HUMAN_REVIEW_ACCEPTED and SLICE_MERGE_RECORDED. Slice MERGED; feature COMPLETE after required release PASS/CURRENT and actual FEATURE_FINALIZED sequence 66. rc.16 publication, public manifest and installed Desktop launch are verified. Advisory8 remains UNAVAILABLE with its retained assessed proceed reason.

## Rubric Status

| # | Criterion | Status | Review | Notes |
|---|-----------|--------|--------|-------|
| R1 | Policy and graph compatibility | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P1; scoped tests and current verification |
| R2 | Validation | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P1; scoped tests and current verification |
| R3 | Conditional and protected behavior | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P1; scoped tests and current verification |
| R4 | Eligibility and freshness | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P2; scoped tests and current verification |
| R5 | Isolation and migration | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P2; scoped tests and current verification |
| R6 | Owner controls | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P3; scoped tests and current verification |
| R7 | Apply/discard safety | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P3; scoped tests and current verification |
| R8 | Exact DAG | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P4; scoped tests and current verification |
| R9 | Accessibility and derived grouping | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P4; scoped tests and current verification |
| R10 | Portable integration and safeguards | PASS | [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md) | P5; scoped tests and current verification |

## Review Log

- 2026-10-14: Design direction approved: "Okay, I approve of this. Make it so." Spec validation PASS; routine implementation plan derived from approved scope. No PR yet.

- Native advisory ordering-s1-ready-2 confirmed the three frontend fixes and identified one host catalog/feature-baseline drift defect. Core returned through evt-ordering-a2-remediation before changes. Host-computed candidate/catalog/model/journal fingerprint and expected-baseline core guard now bind confirmation; publication rechecks and guarded own-byte rollback cover late conflicts. New actual-manager/IPC tests pass; full CLI410/Desktop212/Python132+template2 and portable checks PASS. Fresh readiness3 and full-scope advisory review follow; no formal Judge PASS is claimed.

- Fresh attempt a3 recorded Verification PASS, then formal R7 assessment FAIL for publication/rollback ownership. Returned through evt-ordering-a3-remediation before changes; added repository-exclusive mutation lock and cross-context confirmation binding, with saved-policy reload. Focused tests and full Desktop214 PASS. Earlier native advisory3 is UNAVAILABLE/CONTRACT_INVALID; no accepted clean advisory or formal Judge PASS is claimed. Fresh readiness/attempt required.

### PR #81

[Review packet](pr-81/boundary.json) — accepted and merged at the exact approved head; prior entries below retain the review history.

- Formal Judge a4: FAIL R4/R7/R10. F1 in-flight predecessor rebinding; F2 hidden retry presentation/packet barriers; F3 disabled review modules still mandatory to packet inventory; F4 journal-lock refusal saved policy without adoption. Actual findings and independent receipt retained under pr-81/attempts/retry-ordering-ready-4-pr81-a4/.
- Advisory4: UNAVAILABLE/CONTRACT_INVALID, with one actual provider attempt and no accepted advisory verdict. The retained proceed reason permitted formal entry; it did not waive formal checks.
- Revised class approach: preserve launch bindings through native/command/provider/finalization completion and check them in core recording; make explicit DAG dependencies authoritative instead of retry-wide barriers; validate modular packet inventory against the actual pinned attempt; restore only confirmed untouched core state after migration refusal and expose unchanged adoption after reload. Focused45/Desktop217/CLI413 PASS; final portable checks and fresh independent reviews are pending.

- Independent formal a5: PASS R1-R10, scope/gaps/contradictions PASS; actual report/receipt retained. Advisory5 subsequently returned FINDINGS (four supported R7/R8/R10 gaps, seven previous findings resolved and one partially present). Its recorded pending proceed reason did not make those findings ignorable. Core returned to IMPLEMENTING via evt-ordering-a5-remediation before further source edits; no human-review passage occurred and a5 PASS will not be reused for the changed implementation.
- Revision6 expands refusal handling from state equality to core-certified no-write provenance; tests valid recorded waivers and a real later advisory range containing an emitted modular packet; preserves public boundary/finalization graph edge origins. Focused38 PASS. Full portable/Desktop verification and fresh advisory/formal reviews are pending.

- Independent formal a6: FAIL R9 only; the other nine criteria PASS. Retained finalization edges/numbering could disagree with current-model card groups after owner ordering adoption. Core returned via evt-ordering-a6-remediation before fixes. Snapshot descriptors and card groups now use the selected attempt's pin, with current-attempt replacement and stale-model action guards. Actual core/DOM regressions cover reversal/removal/disablement, replacement and empty current completion. Focused41/CLI421/Desktop219/Python104+28/templates2/portable acceptance PASS. Fresh advisory7/formal7 remain pending; a5 PASS and a6 partial results will not be reused.
- Final packet inspection additionally corrected the missing exact FEATURE_FINAL completion-report.md evidence declaration; SLICE scope stays narrower and final source guards remain intact.

- Advisory7: FINDINGS, one public Mermaid identity defect; all thirteen prior findings resolved. Formal7 was not started. Valid punctuation variants collapsed to one identifier/self-loop. Revision8 uses one injective fixed-width encoding for all rendered node IDs/endpoints, preserving labels and JSON identities. Resolver-backed boundary/finalization model/current tests and standalone punctuation/Unicode cases PASS12; full suites follow. Fresh readiness8 and independent formal review remain required.

- Actual independent formal a8: PASS all R1-R10, with exact native receipt and source-bound report at [Judge](pr-81/attempts/retry-ordering-ready-8-pr81-a8/judge.md). Current full CLI422/Desktop219/Python104+28/templates2 and portable acceptance PASS. Pattern report warns that the existing rule scope is empty. Advisory8 UNAVAILABLE/PERSISTENT CONTRACT_INVALID with one actual provider attempt and no verdict; all fourteen earlier findings have retained class-wide fixes and current regressions. No old formal PASS is reused. Packet validation/retention and human review follow through the core.

- Packet validation: actual PASS through retry/core after trusted clean-checkout evidence-only synchronization. Retention inspection: tracked, 141 files, zero ignored/untracked. Human-review request and exact final-head synchronization follow; implementation approval is not merge authority.

- Actual HUMAN_REVIEW_REQUESTED passage recorded through the core for retry-ordering-ready-8-pr81-a8 after all configured gates are current and nonblocking. Final evidence-only synchronization will resolve the exact head for user acceptance. No merge is authorized or recorded.

- 2026-10-16: Explicit exact-head review/merge approval received for 7502477a8af43f24580b8d8e6955120919654b6c. Protected pr_lifecycle.py merge succeeded; GitHub mergedAt 2026-10-16T14:56:28Z, integration bf9f656535bce04dca659d8f6a1e975d552b1d6d. Trusted reviewed-content ancestry proof and actual protocol passages retained in [integration receipt](runtime/pr81-integration.json) and events.jsonl. I-1 closed; feature FINALIZING, required release module pending. No release/publish/install/activation was performed by this merge task.

- 2026-10-16: [rc.16 release closeout](release-closeout.md) completed. Start38920667836 succeeded; first resume38923169297 retained two Gatekeeper acceptance failures; documented recovery38923968321 passed all four Cask checks against unchanged bytes and reached terminal COMPLETE. Installed digest-verified provider PASS; actual core release PASS sequence65 and feature COMPLETE sequence66, with no waiver. Desktop rc.16 installed/launched, five installed reviewed protocol files match, public manifest matches sealed bytes. Retention tracked172 files; no external tracker configured. Feature record frozen after closeout; native plugin caches remain separately managed.
