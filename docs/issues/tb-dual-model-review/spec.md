# Spec - tb-dual-model-review

**Feature:** `tb-dual-model-review`
**Created:** 2026-11-18
**Status:** Acceptance criteria and binary rubric approved by the human on 2026-11-18 ("Approved. I'm going to give you delegated autonomy for the rest of the work now. Please proceed.").

## Summary

Implement the approved design in design.md: two independently produced, complete, cross-provider PR-boundary reviews in either rigor; runtime model selection without new selection configuration; and an explicitly granted third autonomy level that can amend its approach, adjudicate residual risks and stop review iteration within the retained human mandate. Existing supervised/delegated constraints and separately authorized final release merges remain effective.

The main implementing thread retains the developer's chosen model. Runtime boundary-model selection does not determine planning-review models. Original assessment outcomes, dissent, failures and remaining limitations remain truthful and inspectable.

## Definition of Done

The global workflow Definition of Done applies. Required implementation evidence is evaluated before merge. Hosted release/deployment and post-merge integration evidence remain separate obligations; tests may simulate those boundaries without claiming a real release. Unavailable live adapter coverage is reported explicitly rather than fabricated. Obtain required scoped verification and independent review of implementation before presenting the final PR.

## Acceptance Criteria

- **AC1. Two complete reviews.** Full and light runs require two independent, cross-provider boundary reviews covering all five responsibilities against the same candidate.
- **AC2. Runtime selection.** Select available daily-driver models at high supported effort, honor developer instructions, record the selection, and reuse the pair. Add no model-selection configuration.
- **AC3. Parallel execution.** Initial reviews run independently in parallel. Both results survive concurrent completion; an unavailable or incomplete reviewer cannot count as approval.
- **AC4. Reconciliation and reuse.** Preserve both reviewers' findings and dispositions. Changed behavior requires qualifying review coverage from both perspectives, including affected interactions.
- **AC5. Three autonomy levels.** Preserve supervised/delegated behavior and add explicitly authorized autonomous mode. Supervised/delegated disputes require reviewer clearance or human resolution.
- **AC6. Mandate-bound amendments.** Autonomous mode may revise its approach within the retained human goal and constraints, refreshing affected authority and evidence. It cannot amend that mandate itself.
- **AC7. Autonomous convergence.** Autonomous mode may accept documented residual risks and stop for diminishing returns. Original verdicts remain visible; missing reviews, failed mandatory checks, and mandate violations remain blockers.
- **AC8. Delivery and visibility.** Protected delivery, CLI, desktop, and published summaries reflect both reviews and any adjudication. Autonomous work ends at a ready final PR; release merge remains separately authorized. Historical single-review records cannot silently satisfy the new requirement.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1: Two complete independent perspectives | Both qualifying reviews cover the candidate and all responsibilities | Either perspective, coverage, or provider diversity is missing | Acceptance and receipt-validation tests |
| R2 | AC2: Runtime reviewer selection | Selection follows runtime policy and records actual identities/settings | Selection ignores instructions, invents availability, or requires new configuration | Discovery/selection tests and retained selection records |
| R3 | AC3: Independent parallel execution | Reviews overlap independently and retain both outcomes | Execution is serial, initial results leak between reviewers, or outcomes are lost | Controlled concurrency and failure tests |
| R4 | AC4: Findings and current coverage | Findings remain traceable and reused proof covers current changes | Findings disappear or stale/incomplete proof permits acceptance | Finding-history and delta-applicability tests |
| R5 | AC5: Explicit autonomy and dispute authority | Authority and dispute handling follow the selected level | Autonomous authority is implicit or existing modes gain unauthorized powers | Dial, authority, and dispute tests |
| R6 | AC6: Amendments within the fixed mandate | Amendments remain within the mandate and refresh affected proof | The agent changes the mandate or retains invalidated authority | Amendment and mandate-boundary tests |
| R7 | AC7: Truthful autonomous convergence | Eligible risks receive explicit adjudication; prohibited gaps still block | Stopping fabricates approval or excuses mandatory failures | Adjudication, invalidation, and stopping tests |
| R8 | AC8: Protected delivery and honest visibility | Delivery and user-facing records accurately represent evidence and authority | Release merge bypasses authorization or summaries misrepresent approval | Delivery, publication, CLI/desktop, and compatibility tests |

## Contract interpretation

These details apply the approved design rather than adding independent acceptance criteria:

- A reviewer must use a fresh context with no inherited implementation conversation. Different harness names do not establish different model providers.
- Each reviewer independently covers code, requirements, evidence, scope and findings. Light uses the brief; full uses selected approved rubric criteria. Initial reviewers receive the same pinned candidate and applicable verification without one another's initial outputs.
- Runtime discovery is not an execution receipt. Preserve selection rationale, exact model IDs/effort, provider diversity and substitutions. Prefer standard/daily-driver models at high effort, respecting explicit developer instructions. Infer model class honestly where catalogs lack labels. Reuse the pair until relevant availability changes or explicit direction.
- Candidate changes invalidate affected proof. Retain qualifying results and request independent deltas for changed code, findings and interactions rather than discarding history or automatically redoing unchanged reviews. Preserve provenance when grouping duplicate findings.
- `supervised` remains the default. `delegated` retains existing planning and delivery authority and handback rules. `autonomous` requires an explicit named-run grant bound to the original human goal and explicit constraints. Full/light rigor is independent of autonomy.
- Autonomous in-mandate amendments retain old/new commitments and obtain refreshed independent planning evaluation. The agent may not redefine its mandate or remove a mandate requirement to evade a defect.
- Autonomous adjudication binds current candidate, both assessments, findings, mandate, evidence, accepted residual risk and rationale. Diminishing returns is a reasoned stopping decision, not an iteration-count approval. Missing/incomplete review or verification, failed mandatory checks, provider-diversity failure, integrity failures and demonstrated mandate violations are ineligible.
- Protected slice delivery may use eligible autonomous adjudication under the run's authority; final release-branch merge and deployment remain separately authorized. Readiness does not falsely imply post-merge integration or completed release obligations.
- Historical proof remains retained; a historical single review does not become two current reviews during resumption. Unsupported external capabilities remain explicit blockers.

## Changes

- Initial specification transcribes the approved eight acceptance criteria/rubric and supplies interpretation from the already approved design. No scope amendment.
