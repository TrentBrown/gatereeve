# Interview - tb-boundary-iteration-cost

**Feature start:** 2026-10-12
**Status:** concluded; design synthesized for review

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

## D1 - Deliver iteration-cost improvements before configurable ordering

**Question:** Should we first reduce iteration cost through advisory review, broader remediation, deferred presentation, and automated bookkeeping, then extend the module system with configurable scheduling?

**Answer:** Trent approved that direction and requested a design interview before implementation.

**Decision:** This feature addresses iteration-cost improvements. Configurable gate ordering follows as a separate design and implementation phase. Preserve the formal independent Judge, full applicable verification, CI on the reviewed head, and explicit merge authorization. Approval of direction authorizes design work; it does not approve an unwritten design or implementation plan.

**Source:** User approval in this chat on 2026-10-12; handoff at `/Users/trent.brown/Code/tb/gatereeve/docs/handoffs/boundary-efficiency.md`.

## Design synthesis status

The interview settled D1-D16. The user requested proceeding with packet compaction and incorporating the newly reported completion blocker. The design draft proposes a source-bound, auditable recovery operation; its concrete guards and overall synthesis are presented at the design gate before specification or implementation. Configurable gate ordering remains the subsequent feature.

## D2 - Automatic advisory review with a recorded bypass reason

**Question:** Should a clean advisory review be mandatory before opening a formal attempt, or should the implementer be allowed to proceed without one?

**Answer:** Trent chose the recommendation: run advisory review automatically for significant specced changes, but allow the implementer to proceed to the formal boundary with a recorded reason.

**Decision:** Advisory review is automatic for significant specced changes. A clean advisory result is not a new formal prerequisite. The implementer may proceed without a clean advisory result by recording the reason; this is not a waiver of the formal Judge or any other formal gate. The definition of significant changes, triggering and rerun rules, reason retention, and advisory-input isolation remain to be settled.

## D3 - Keep formal Judge blind to advisory review history

**Question:** Should the formal Judge remain blind to advisory review history?

**Answer:** Yes. The implementer can use advisory findings, but the formal Judge evaluates the resulting code independently.

**Decision:** The formal Judge must not receive advisory findings, verdicts, bypass reasons, or advisory conversation history. Treat blindness as an input-isolation requirement rather than relying only on a fresh conversation or prompt instruction. The implementer may use the findings to change code and tests. Preserve access to approved requirements and formal verification evidence. Packaging and read-only repository access must enforce the review-history separation.

## D4 - Trigger at slice readiness with formal Judge applicability

**Question:** Should the slice-readiness checkpoint trigger automatic advisory review?

**Answer:** Yes, use that slice-readiness checkpoint and the same applicability as the formal Judge.

**Decision:** Launch advisory review when the implementer declares the slice ready after fast checks and focused tests, before full boundary verification, wherever the formal Judge applies. Each run evaluates a pinned source snapshot. After remediation, another readiness declaration triggers review of the revised snapshot. Triggering is not per edit or per commit. Retain D2's ability to proceed to the formal boundary without a clean advisory result with a recorded reason. Exact applicability resolution, evidence inputs, and snapshot mechanics remain to be designed.

## D5 - Advisory evidence establishes readiness, with full verification pending

**Question:** Should advisory review use the approved spec, pinned code and tests, and fast/focused test results, explicitly marking the remaining verification pending, in a fresh read-only context with the same scope and capability standard as formal Judge?

**Answer:** Yes. A clean advisory result means ready for formal review, with full verification still pending.

**Decision:** Advisory inputs include approved requirements, pinned source and tests, and fast/focused test results. Explicitly mark full verification pending; a clean advisory result means `ready for formal review` and is not a formal Verification or Judge PASS. Use a fresh read-only context and the same review scope and capability standard as the formal Judge. Full formal verification and independent Judge remain required under existing policy. Review input schemas and prompts must distinguish advisory readiness from formal certification.

## D6 - Require defect-class review after advisory or formal Judge failures

**Question:** Should a defect-class review be required before the implementer declares the revised slice ready?

**Answer:** Yes. Require the review after advisory or formal Judge failures before declaring the revised slice ready.

**Decision:** After an advisory or formal Judge failure, remediation must identify the violated invariant, examine every path that can affect it, and add focused regression coverage for related failures found before a revised readiness declaration. Keep a brief record of the analysis and coverage. Reviewer instructions must request all supported findings identified, rather than stopping at the first example; do not claim exhaustive discovery. D2 still allows proceeding directly to a formal boundary with a recorded reason, but does not permit falsely declaring revised advisory readiness without this remediation review. Scope, applicability, record location, and handling of operational reviewer failures remain to be settled.

## D7 - Advisory reruns receive prior findings without narrowing review scope

**Question:** Should advisory reruns receive earlier advisory and formal Judge findings as a fix checklist while reviewing the full in-scope slice?

**Answer:** Yes. Give advisory reruns both sources of earlier findings as a fix checklist, still review the full in-scope slice, and keep the formal Judge blind to that history.

**Decision:** Supply advisory reruns a bounded checklist of earlier advisory and formal Judge findings relevant to this slice. Each rerun uses a fresh context, checks the fixes against the new pinned source, and reviews the complete in-scope slice for additional defects. Prior results do not prove correctness and do not limit criterion coverage. The formal Judge must receive none of this review history. Checklist binding, retention, and exclusion from formal input remain implementation design details to settle.

## D8 - Track compact advisory records and exclude them from formal Judge view

**Question:** Should compact advisory records be tracked with the feature rather than kept only on the local machine?

**Answer:** Yes. Track compact advisory records without full transcripts, and exclude them from the formal Judge's inputs, diff, and repository view.

**Decision:** Retain compact advisory records in the tracked feature folder, including source identity, findings, readiness result, remediation summary, and any reason for proceeding without a clean result. Do not retain full agent transcripts as these feature artifacts. Enforce exclusion of advisory records from formal Judge inputs, diff, and read-only repository view. Retention must support worktree changes and handoffs without making advisory output formal gate evidence. Detailed path/schema, immutable run identity, and source-content versus evidence-only currentness rules remain to be designed.

## D9 - Reuse clean advisory results across verified evidence-only changes

**Question:** Should a clean advisory result remain usable across evidence-only changes when a deterministic check confirms all reviewed inputs are unchanged?

**Answer:** Yes. Keep formal gate freshness rules intact.

**Decision:** A clean advisory result remains usable across evidence-only changes only when a deterministic check confirms the reviewed source, tests, build configuration, dependencies, approved requirements, and other declared review inputs are unchanged. Evidence-only classification must be validated rather than inferred from a commit message or broad directory allowlist. This rule applies to advisory readiness only; it does not copy or reuse formal gate outcomes or alter their attempt identity, dependencies, or freshness rules. The review-input manifest, bindings, and rejection behavior need implementation design.

## D10 - Defer presentation artifacts, preserve early defect-finding checks

**Question:** Should presentation artifacts be deferred until substantive checks are clean, while code review and spec assessment remain early defect-finding activities?

**Answer:** Yes.

**Decision:** Defer Explain Diff, final PR narrative, and consolidated review summaries until substantive checks are clean. Keep code review and spec assessment early enough to find defects, retaining their findings as they occur. Do not imply that required formal reports or gate outcomes are optional; they must be current before human review. Source changes still invalidate affected checks and reports. Exact distinction between compact working findings and final formal artifacts, and the existing-graph-compatible execution sequence, remain design details to settle.

## D11 - Bounded transient retry and unavailable advisory results

**Question:** Should advisory execution retry a transient error once, immediately mark persistent configuration or isolation problems unavailable, and permit proceeding to the formal boundary with a recorded reason while preserving formal Judge requirements?

**Answer:** Yes.

**Decision:** Allow one automatic retry for transient advisory execution errors. Persistent configuration or isolation failures are unavailable and do not receive futile advisory retries. An unavailable result is not a code failure and does not require defect-class review by itself. After unavailability or exhausted transient retry, the implementer may proceed to the formal boundary with a recorded reason under D2. Never substitute advisory output or an unavailable result for formal Judge execution or isolation. Error classification and retained run/error metadata remain implementation details.

## D12 - Retry helper owns formal orchestration without weakening protocol

**Question:** Should the retry helper orchestrate reuse of the PR, updated pinned context, a fresh formal attempt, gate recording, and packet bookkeeping, leaving fixes and revised readiness to the implementer?

**Answer:** Yes. Preserve protocol guards and formal gate freshness.

**Decision:** Provide a single orchestration entrypoint after fixes and the revised readiness declaration. Reuse the exact existing PR, resolve updated pinned context, start a fresh formal attempt when needed, and record gate results and packet bookkeeping through the protocol. Preserve PR closure preference, currentness guards, formal evidence freshness, explicit human review and merge authorization. The implementer owns remediation and readiness. Recovery must avoid duplicate attempts/events and must not relabel old formal PASS results as current. Exact entrypoint placement, idempotency keys, recoverable checkpoints, and failure reporting remain implementation design details.

## D13 - Repeated findings require a changed approach, not a default count-based halt

**Question:** Should there be no new default halt based on failure count, while the same finding recurring after a claimed fix requires analysis and a changed remediation approach, with explicit project stop rules and escalation preserved?

**Answer:** Yes.

**Decision:** Do not add a default consecutive-failure-count halt. Distinct defects under one rubric criterion are separate findings. A repeated finding after a claimed fix requires explanation of why the fix failed and a changed remediation approach before another readiness declaration. Preserve explicit project stop rules and escalate when the agent cannot make progress or needs a decision beyond its authority. Finding identity must reflect the underlying defect rather than only rubric ID or wording. This does not silently remove existing project-specific hard stops.

## D14 - Approved requirements replace raw decision journals in formal Judge view

**Question:** Should binding requirements be captured in approved spec/design, while raw decision journals and prior review reports are excluded from the formal Judge's view?

**Answer:** Yes. Make that separation part of the design.

**Decision:** Keep binding requirements in approved spec/design. Exclude raw decision journals and prior review reports, including previous formal Judge findings, from formal Judge inputs, diff, and read-only repository view. Preserve access to relevant code, tests, approved requirements, and current formal verification evidence. Do not manufacture or approve new requirements through an automatic journal summary; any missing binding requirement must be reconciled through the existing approved-document process. Exclusion must cover supplied documents as well as repository and patch access.

## D15 - Include review packet compaction in the first feature

**Question:** Should this first feature include packet compaction?

**Answer:** After requesting an explanation of the packet's purpose and reduction options, Trent said, "Okay, let's do this now. It's important."

**Decision:** Include packet compaction now: reduce duplicated patches, represent binary evidence through digest-bound accessible file references, recognize renames, and apply the already-approved review-history exclusions. Preserve the exact pinned source scope and relevant change inventory; do not silently discard production changes to fit size limits. Measure against the oversized MyLifeMap scenario.

## D16 - Include the feature-completion blocker from the updated handoff

**Question:** Should the updated handoff's feature-completion blocker be incorporated into this feature?

**Answer:** Trent explicitly requested incorporating the issue that prevented the other agent from marking a feature complete.

**Decision:** Expand this first feature to provide a sanctioned protocol recovery path for a feature whose final delivery merged at slice scope and whose whole-feature Judge obligation was explicitly waived. Preserve historical journals, verified merged-content identity, explicit waiver authority, and normal finalization obligations. Do not mutate the MyLifeMap feature's state merely because this plugin fix is authorized. Recovery authority, binding of historical waivers, migration/compatibility behavior, and handling of missing whole-feature evidence remain design questions.

**Updated source:** `/Users/trent.brown/Code/tb/gatereeve/docs/handoffs/boundary-efficiency.md`, item 8, read 2026-10-12. The supplied MyLifeMap handoff path does not exist.

## Interview closing summary - 2026-10-12

**Solid:** Advisory triggering, evidence and readiness semantics, formal Judge blindness, review-history retention, advisory-only reuse, defect-class remediation, failure handling, retry orchestration, presentation timing, repeated-finding policy, approved-requirements separation, and inclusion of packet compaction are ratified.

**Expanded scope:** The updated handoff adds the inability to enter Finalizing after a slice-scoped final delivery and an explicit whole-feature Judge waiver. Read-only replay reproduced `CONTRACT_INVALID: references unknown slice undefined` against the existing 352-event MyLifeMap journal. No event or feature state was modified.

**Proposed recovery shape for design approval:** Append a dedicated semantic recovery event, referencing accepted slice merges, the exact verified integrated source and an explicit human waiver of the missing whole-feature Judge. Require the other feature-wide evidence and retention obligations; enter Finalizing and retain all configured finalization modules. Preserve older model locks and require an explicit compatible migration or recovery adoption before applying new semantics. Historical waiver evidence may be referenced; never infer a waiver from a tooling failure.

**Open risks:** Correct review-history filtering without hiding production inputs; bounded construction for large text and binary changes; precise evidence-only identity; interrupted orchestration; preserving historical model replay; and source/scope binding of historical waiver evidence. These are technical risks to resolve through specification and implementation, rather than further broad interview questions.

**Next:** Present the complete `design.md` for the explicit design gate. No specification, implementation plan or product code was written during the interview.
