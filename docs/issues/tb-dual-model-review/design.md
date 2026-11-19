# Design - tb-dual-model-review

**Status:** approved — human design approval received 2026-11-18.

## Problem

GateReeve currently requires one independent consolidated PR-boundary review. It enforces a fresh evaluator context but does not require a different provider from the implementer or a second review. One model family's blind spots can therefore affect both implementation and review.

The existing autonomy levels, `supervised` and `delegated`, cannot express the human's desired unattended execution through material amendments and persistent reviewer disagreements. Delegated mode returns control to the human on specified events. Adding a second required reviewer without a corresponding dispute-resolution policy could increase unproductive review loops.

## Intent

Require two independently produced, complete PR-boundary assessments from different model providers, normally executed in parallel. Select suitable available models at runtime rather than maintaining version lists or adding selection configuration.

Add `autonomous` as a third explicit per-run autonomy level. Within a retained human mandate, the agent can revise its approach, adjudicate judgment calls and stop review iteration when further work has diminishing returns. Preserve evidence and remaining risk so the final PR is inspectable. Do not claim that adjudication makes an original FAIL into a reviewer PASS.

This design synthesizes interview decisions D1–D14 in interview.md. Mechanisms below are proposed for approval; no application implementation has begun.

## Chosen shape

### 1. Two reviews at the existing boundary

Both full and light rigor require two completed independent PR-boundary assessments. Each covers code, requirements, evidence, scope and findings. Full reviews assess the approved specification/rubric; light reviews assess the approved brief. Existing verification and packet obligations continue to apply.

Use the existing review obligation as the acceptance point for a pair of retained assessments. Neither assessment alone satisfies it. Model the two review results and any adjudication explicitly rather than allowing the most recent result to replace the other perspective.

The review occurs after a coherent implementation slice and relevant verification are ready, before human acceptance or authorized slice delivery. Early discovery remains optional. The same rules apply to a final feature PR; reviewing slices alone does not supply whole-feature proof.

### 2. Runtime model selection

At the first required boundary review in a run, the coordinating agent discovers supported execution providers, available models and reasoning options. It selects two different model providers, preferring capable standard/daily-driver models with high reasoning effort. When the implementing provider supports suitable review execution, use that provider for one perspective and another provider for the second. The main thread retains the developer-selected implementation model.

Honor explicit developer instructions concerning reviewer models. Concrete versions are not built-in requirements; current Opus/Sol names are examples of the desired class. Keep model class distinct from reasoning effort. Catalogs may not expose class labels; distinguish documented capabilities from the agent's classification judgment.

Retain the discovered capabilities or relevant observations, exact provider/model IDs, effort, rationale and selection provenance. Reuse the selected pair through the run. Reconsider it for availability changes or developer direction, recording any replacement and its effect on proof.

Discovery is not successful execution. Both models must actually produce qualifying receipts through supported execution adapters. Two harnesses routing to the same model provider do not count as provider diversity. T3 model discovery is one environment mechanism, not a mandatory product dependency; distinguish orchestration provider IDs from GateReeve execution adapters and actual model providers.

With no usable second provider, report an explicit availability blocker. Do not replace cross-provider proof with two same-provider reviews. Autonomous mode may choose a comparably capable replacement within the agreed selection rules. A user-pinned model change in supervised/delegated mode requires the applicable human decision. Routine automatic selection without a user pin needs no model-choice interview.

No user/repository model-selection file, preference precedence system or boundary-review section in `.agentic-workflow.json` is added.

### 3. Parallel initial assessment

Launch both reviews against the same pinned source, requirements, verification and bounded relevant history. Each starts in a fresh context independent of the implementer and the other reviewer. Initial outputs are not supplied to the other reviewer while the initial pass runs.

Use isolated read-only views and per-review job/result identities. Concurrent completion must not overwrite or drop receipts, findings or status. A timeout, unavailable provider or malformed result leaves that required perspective unavailable. A successful peer result remains retained.

The implementer can inspect early findings and prepare proposed dispositions while another review runs, but must not mutate any checkout a reviewer is reading. Any changed candidate is identified explicitly and requires qualifying proof for both review perspectives before acceptance.

### 4. Reconciliation and re-review

Maintain stable references to both reviewers' findings and verdicts. Group duplicates without losing authorship or original severity. The implementer proposes evidence-backed fixes, rebuttals or residual-risk acceptance; a disposition claim is not itself proof.

Both reviewers retain full responsibility for the candidate. After fixes, obtain independent delta assessments covering changed behavior, affected findings and interactions. Reuse earlier proof only when its relevant inputs and coverage still qualify. A changed shared dependency or uncertain coverage requires wider review; document-only changes do not automatically require a complete restart.

Reviewers may see the bounded shared finding/disposition record during follow-up. Each evaluates the evidence independently; agreement is not established by the implementer summarizing that the reviewers agree. Persistent differences remain visible.

In supervised/delegated modes, material findings must be cleared by both review perspectives. Persistent disputes return to the human through explicit workflow state and retain their evidence. Existing scoped human-exception authority remains explicit and truthful; it is not an implementer-authored reviewer approval.

### 5. Three autonomy levels

Rigor and autonomy remain independent. Built-in defaults remain `full` rigor and `supervised` autonomy. No configuration silently enables a different level. Only an explicit human instruction may grant elevated authority for the named run.

| Autonomy | Planning and amendments | Material review disputes | Delivery endpoint |
| --- | --- | --- | --- |
| `supervised` | Existing human approval rules | Both reviewers clear material findings; persistent disputes return to human | Existing human acceptance/merge rules |
| `delegated` | Existing independently reviewed planning authority and amendment handbacks | Both reviewers clear material findings; persistent disputes return to human | Existing qualifying slice delivery; final release merge needs human |
| `autonomous` | Agent may amend its approach within the fixed mandate, with refreshed independent evaluation | Agent may record evidence-based adjudication and accept eligible residual risk | Continue to a ready final PR; release merge needs human |

For the third level, retain the original human goal and explicit constraints as a fixed mandate bound to the granting instruction. Use retained, identified content rather than allowing mutable design/specification files to redefine the mandate. If the mandate is unclear, establish it before granting autonomous execution; do not assume broader authority from an ambiguous request.

An autonomous amendment records the reason and old/new commitments, checks conformance to the mandate through independent planning evaluation, and invalidates affected approvals/candidate evidence. The agent can renew the derived planning authority without a routine human handback. Altering the fixed mandate itself requires new human authority. Do not remove a requirement merely to hide a violation of the mandate.

Changing plan details alone remains ordinary planning maintenance where the current protocol already permits it. Broader autonomous authority is recorded distinctly from human-confirmed decisions. Supporting light-to-full escalation preserves the fixed mandate and refreshes the appropriate full-rigor planning/evidence; it does not itself require a routine human handback when autonomous authority still applies.

### 6. Autonomous adjudication and convergence

Both complete independent perspectives are mandatory in autonomous mode; unanimous reviewer approval is not. The agent may resolve judgment calls or accept a documented in-scope residual risk over reviewer objection.

Record adjudication separately from reviewer verdicts. Bind it to the exact candidate, affected finding/result IDs, relevant mandate constraints, supporting evidence, considered reviewer positions and accepted residual risk. Validate that it uses an active autonomous grant and addresses all remaining material review objections eligible for adjudication. Preserve original FAIL/UNAVAILABLE records. Display the acceptance basis as autonomous adjudication when used, not as two reviewer approvals.

Missing/incomplete independent assessment, provider-diversity failure, missing verification, failed mandatory checks, evidence-integrity failures and demonstrated violations of the fixed human goal or explicit constraints are not eligible residual risks. Autonomous authority cannot invent evidence or make those obligations pass. If a proposed test/check is no longer applicable following a legitimate in-mandate amendment, revise the declared verification scope with fresh independent assessment and preserve the original failure and replacement rationale; do not silently discard a failed mandatory check.

There is no hard-coded remediation round count. The agent evaluates progress, recurring objections, new defects, severity and remaining uncertainty. It may end iteration when further review has diminishing returns, recording why further rounds are unlikely to change the decision and every outstanding material finding's disposition. Stopping alone does not establish acceptance. Changes after adjudication invalidate it unless the existing applicability rules demonstrate equivalence.

### 7. Blockers, delivery and visibility

Autonomous mode resolves discretionary decisions without routine human prompts. It may retry or choose authorized alternatives when providers, tools or hosting services fail. Missing credentials, unavailable second-provider execution, lost required branch protection or an unsatisfied fixed mandate can still block the work. Report a truthful blocked outcome when authorized recovery cannot proceed; do not bypass hosting protections, fabricate approval or expand authority.

Retain protected delivery behavior. Autonomous slice acceptance/merge into a distinct integration branch may use the named run's active authority and qualifying dual-review proof or eligible adjudication, with other mandatory gates satisfied. Release protection prerequisites and checks continue to apply. Autonomous mode does not automatically downgrade merely because it encounters an in-mandate amendment or review judgment call.

The unattended endpoint is a ready final PR with published current review results, adjudications, accepted risks and remaining limitations. Release-branch merge and deployment remain separately authorized. Ready-for-human action is not falsely reported as integrated or as completed post-merge obligations. Existing supervised/delegated delivery permissions are not broadened by adding the third level.

CLI, desktop, native skills and published summaries must agree on the two perspectives, chosen models, autonomy, adjudications, missing proof and next action. Historical single-review runs remain historical; do not fabricate a second review or silently rewrite old authority. Resumption must expose and satisfy the current contract's missing obligations.

### 8. Delivery approach

Prepare separately reviewable implementation slices for dual-review evidence/execution and runtime selection; the autonomous authority/mandate/adjudication contract; and delivery, CLI/desktop, native instructions and published-summary consistency. Exact ordering and slice boundaries belong in the implementation plan after design approval.

Validate the acceptance behavior with meaningful contract tests and real adapter execution where available. Cover independent pair completeness/diversity, concurrent result retention, per-review delta applicability, mode-specific disputes, mandate-bound amendments, residual-risk eligibility, stopping without fabricated PASS, capability failures and protected final delivery. Report actual unavailable integration coverage.

## Alternatives considered

- Three-model council: adds cost and reconciliation complexity beyond the requested two perspectives; not part of this feature.
- Sequential reviews: forfeits useful parallelism and can bias the second initial assessment with the first report.
- Specialist reviewers splitting responsibilities: loses two independent complete assessments.
- Hard-coded model versions or user/repository model-selection configuration: rejected in favor of runtime selection with recorded rationale and explicit instructions when desired.
- Unanimous approval in every mode: can prevent the requested autonomous convergence on judgment calls.
- Unrestricted implementer override or automatic approval at an iteration cap: loses evidence integrity and the fixed human mandate.
- Agent authority to change the original goal/constraints: rejected. The third level delegates approach and in-scope risk judgment, not a new goal.

## Constraints

- This run remains full/supervised until the human explicitly changes it; designing autonomous mode does not enable it for this work.
- Obtain explicit design approval before drafting the specification, and exact implementation authority after specification/plan preparation before application edits.
- Preserve existing branch-direction, release-merge and deployment authority rules.
- Both reviews are required in both rigors. Neither an accepted risk nor diminishing returns substitutes for a missing second independent assessment.
- Keep model selection scoped to boundary reviewers. Do not change the main thread's model or apply this policy to planning-review model selection.
- Maintain truth of original receipts, findings, failures, authority and integration state.

## Open risks

- Available model catalogs may not expose a standard model class or a reliable operational-availability signal. Selection needs recorded judgment and real execution outcomes without an expensive recurring model-comparison process.
- Existing proof selection and concurrency code assumes a consolidated evaluator in several places. Pair identity, transactions, reuse and publication need explicit treatment so one completion cannot hide the other.
- Classifying a reviewer objection as judgment versus a demonstrated mandate violation is semantic work. Evidence, visible dissent and bounded authority are required; this design does not claim a deterministic checker can prove every semantic disposition correct.
- Immutable mandate capture must be useful and specific without becoming another lengthy configuration or a duplicative per-task approval ritual.
- Autonomous residual-risk acceptance changes the authority contract. Old records, exports, CLI, desktop and summaries must not mislabel it as unanimous independent PASS.
- A ready final PR can remain blocked from merge by external rules. Autonomous execution cannot guarantee external availability or final integration.

## Changes

- Initial synthesis from the concluded interview; approved by the human on 2026-11-18 ("Approved"). Only approval metadata changed when recording this decision.
