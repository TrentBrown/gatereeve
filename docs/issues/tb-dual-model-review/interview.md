# Interview - tb-dual-model-review

Status: Interview concluded; design approved by the human on 2026-11-18. Specification and implementation are not yet approved.

## D1 - Two required review perspectives

**Question:** Should GateReeve move from one required independent review to two?

**Answer:** The user wants to proceed with two reviews, one from the native model family and one from a different provider, and requested a new topic branch in this thread.

**Decision:** Explore two required independent reviews at the existing PR boundary. Parallel execution, reconciliation and re-review semantics are design topics to resolve. A council skill is outside this feature's requested approach.

## D2 - Initial model preferences

**Question:** Which models should be selected, and should the agent choose or should configuration express preferences?

**Answer:** "At the moment, I would want the two models selected to be Claude Opus 5.5 on the Anthropic side and GPT-6.1 Sol on the OpenAPI side."

**Decision:** Preserve the requested initial pairing: Anthropic Claude Opus 5.5 and OpenAI GPT-6.1 Sol. Configuration ownership, effort, fallback policy and capability verification remain open; the agent has recommended configurable preferences and no silent substitution.

## D3 - Run setup (meta/tooling)

**Question:** Full or light?

**Answer:** "Full"

**Decision:** Full rigor, supervised autonomy. Created `tb-dual-model-review` from `origin/main` at `67871b0`. The current adapter recorded the explicit human rigor choice at run.start for run `19bfd222-e20d-4ef4-ba8b-b6d55d1d83f3`. The prior lightweight-mode workspace configuration was retained by the run-start replacement operation; its feature records remain intact.

## D4 - Autonomy design diversion

**Question:** Should persistent reviewer disagreements return to the human or be settled by another authority?

**Answer:** The user redirected the interview to explore three autonomy levels. The proposed third level should let the agent exercise judgment on amendments and reviewer disagreements and continue to the final PR without routine human handbacks.

**Decision:** Explore this related autonomy extension in the current feature interview before settling the dual-review disagreement policy. The third level's exact authority, scope limits, naming and delivery endpoint are not yet agreed. This request does not change the current run's supervised autonomy or authorize implementation, merge or deployment.

**Observed current behavior:** Existing levels are `supervised` and `delegated`. Delegated mode can approve planning via qualifying independent review and accept/merge passing slices into a distinct integration branch. Amendments, agent handbacks, external merge blockers and observed loss of release protection return it to supervised. A reviewer disagreement is not itself a dedicated current handback trigger. Source: resources/PROTOCOL.md, Delegated autonomy, and current/delegation.js.

## D5 - Autonomous authority stays within the human mandate

**Question:** Should autonomous mode be allowed to change design, specification, and plan freely within the original goal and explicit constraints, while changes to that goal or those constraints remain outside its authority?

**Answer:** "Yes"

**Decision:** The proposed third autonomy level may revise design, specification, and plan within the human's original goal and explicit constraints. It cannot change that mandate on its own. Amendments must remain recorded and refresh affected evaluation and evidence; the exact amendment and adjudication mechanics remain to be designed. This is a feature design decision, not a change to this run's supervised autonomy.

## D6 - Autonomous adjudication and diminishing returns

**Question:** Should autonomous mode be allowed to accept a documented residual risk over a reviewer's objection, provided it preserves the finding, explains its reasoning, and stays within the human's goal and constraints?

**Answer:** "Yes. And alongside this is to allow the agent to judge whether the number of iterations has reached a point at which there are diminishing returns. This is to avoid endlessly iterating and never converging to a solution."

**Decision:** Autonomous mode may adjudicate judgment calls and accept documented, in-scope residual risk over reviewer objection. Both independent reviews remain required, but their unanimous approval is not a universal completion condition in this mode. The agent may judge that additional review/remediation iterations have diminishing returns and stop that loop. Record the remaining findings, reviewer positions, disposition rationale and reason for stopping; preserve original verdicts rather than relabeling them PASS. Failed mandatory checks and demonstrated violations of the fixed human goal or explicit constraints still block completion. Stopping iteration alone does not qualify a candidate for completion. Detailed qualification of autonomous risk acceptance remains to be designed. This decision changes the proposed feature, not this run's autonomy.

## D7 - Autonomous model substitution

**Question:** If Opus 5.5 or GPT-6.1 Sol is unavailable, may autonomous mode select a comparably capable replacement while preserving two different providers?

**Answer:** "This is reasonable, yes."

**Decision:** Autonomous mode may select a comparably capable available replacement, maintaining cross-provider diversity and recording the substitution and reason. Other autonomy levels' exact fallback behavior remains subject to the selection policy. This permission does not allow a missing second provider to count as two-provider review.

## D8 - Durable model selection intent

**Question:** Should concrete model names be hard-coded, configurable, or chosen automatically?

**Answer:** The user does not want particular model versions hard-coded into GateReeve. They want configuration where useful and intelligent agent selection without configuration, using low/medium/high model classes as durable defaults. Their intended default is the daily-driver middle class rather than the cheapest or most expensive class.

**Decision:** Concrete model IDs must not be compiled-in requirements for the feature. Capture the user's preference for a daily-driver model class and automatic environment-aware selection. Exact configuration location, precedence, classification evidence, fallback and reasoning-effort defaults remain design questions. Do not conflate model class with reasoning effort or assume provider catalogs expose standardized class labels. The earlier named pairing is the user's current preference, not a permanent product default.

## D9 - Selection preferences apply only to PR-boundary reviews

**Question:** Should the selection preferences apply to all independent GateReeve reviews, including planning reviews, or only the two PR-boundary reviewers?

**Answer:** "I think only to the pure boundary reviews. The main thread should use whatever the developer chose and just stick with it. How would we record repository preferences and user preferences?"

**Decision:** Scope the proposed model-class and model-preference selection policy to PR-boundary reviews only. The main implementing thread retains the developer-selected model. Planning reviews do not inherit this boundary-review policy. Interpret "pure boundary" in context as PR-boundary. User/repository configuration locations and merge semantics are being proposed, not yet implemented or approved.

## Configuration discussion - existing workspace file

The user asked whether repository review preferences could live in the existing `.agentic-workflow.json` instead of introducing `.gatereeve/config.json`.

Agent recommendation: use an optional `boundaryReview` section in the existing workspace configuration. Its repository/workspace lifetime is compatible with preferences if feature-start replacement explicitly preserves and records that section while updating feature-specific fields. Today `run.start` can replace the file with a minimal configuration when changing features; blindly using the existing replacement behavior would lose preferences. Multi-repository workspaces may eventually need repository-specific overrides. User-wide defaults still need a user-scoped configuration source; a workspace file alone cannot supply cross-workspace defaults. No configuration schema or replacement code has been changed, and exact scope/precedence remains under discussion.

## Configuration discussion - runtime selection alternative

The user is considering omitting model-selection configuration entirely and letting the agent select models at runtime. This is not yet a ratified replacement for the configuration proposal.

Agent recommendation: runtime selection is a reasonable simpler initial design. Discover available execution capabilities, select two different model providers targeting the standard/daily-driver class and high supported reasoning effort, record exact model IDs and rationale, and reuse the pair within the run. Reconsider only for relevant availability changes or explicit user instruction. Discovery is generally small relative to substantive code review, but no measured latency/token benchmark is available. Catalog metadata does not necessarily identify model class; uncertain classification must be treated honestly. A listed model is not proof of successful execution. The implementing thread's chosen model is unaffected.

## D10 - Runtime model selection, without new configuration

**Question:** Should the agent select boundary-review models at runtime rather than adding model-selection configuration?

**Answer:** "Approved" in response to the runtime-selection recommendation.

**Decision:** Adopt runtime model selection. Do not add user/repository model-selection configuration or extend `.agentic-workflow.json` for this feature. Discover available execution capabilities; choose two independent reviewers from different providers, preferring capable daily-driver/standard models and high supported reasoning effort. Honor explicit developer model instructions. Record the concrete model IDs, settings and selection rationale. Select the pair when boundary review is first needed and reuse it through subsequent iterations; reconsider for relevant availability changes or developer direction. A catalog listing does not establish successful execution, and an inferred model class must not be presented as verified metadata. The developer-selected model in the main thread remains unchanged. Earlier configuration proposals are superseded by this decision. This approval concerns model-selection design, not approval of a complete design/specification or implementation authority.

## D11 - Two boundary reviews in both rigors

**Question:** Should both reviews be required in light runs as well as full runs?

**Answer:** "Yes"

**Decision:** Both full and light runs require two independent PR-boundary reviews from different providers. Full reviews use approved requirements/rubric; light reviews use the approved brief. Rigor changes the requirement basis and planning obligations, not the number of required boundary-review perspectives. Autonomy determines decision and adjudication authority separately.

## D12 - Complete independent coverage by both reviewers

**Question:** Should each reviewer cover all five responsibilities—code, requirements, evidence, scope, and prior findings—rather than dividing those responsibilities between them?

**Answer:** "Yes"

**Decision:** Each required boundary reviewer independently assesses every consolidated review responsibility against the same pinned candidate and applicable requirements/verification. Neither reviewer is a specialist substitute for missing coverage by the other. Preserve each reviewer's own findings, responsibility conclusions and verdict. Autonomy-specific disposition rules remain separate from review coverage.

## D13 - Disagreement authority by autonomy level

**Question:** In supervised and delegated modes, should both reviewers have to clear material findings, with persistent disputes returning to the human, while autonomous mode has the agreed risk-acceptance and diminishing-returns authority?

**Answer:** "Agreed"

**Decision:** Supervised and delegated modes require both reviewers to clear material findings; persistent material disputes return to the human. Autonomous mode may use its recorded adjudication and residual-risk acceptance authority within the fixed human mandate, including a reasoned diminishing-returns stopping decision. All modes retain both reviews and their original evidence; a stopping decision cannot fabricate PASS, excuse a failed mandatory check, or authorize violating the fixed human goal or constraints.

## D14 - Bundle autonomous mode with dual boundary review

**Question:** Should the new autonomous level be included in this feature alongside dual reviews, with one design and separate implementation slices?

**Answer:** "Yes, let's add it."

**Decision:** Include the third autonomy level in this feature. Design the review evidence and autonomy-specific acceptance rules together, and deliver through separately reviewable implementation slices. This is scope approval for design, not implementation or merge authority.

## Interview closing summary

The human has settled the substantive policy: two full-coverage independent boundary reviews from distinct providers in either rigor; runtime daily-driver model selection without configuration; the main thread's model stays unchanged; existing supervised/delegated dispute handback; and a third autonomous level that may amend its approach within the fixed human mandate, adjudicate residual risks and stop iteration for diminishing returns. The third level belongs in this feature. Original reviewer verdicts and failed mandatory checks remain truthful. Autonomous progress ends at a ready final PR, with existing release-merge authority remaining separate.

The design synthesis proposes concrete mechanisms for mandate capture, per-review evidence, parallel execution, delta coverage, adjudication and availability recovery. These mechanisms are proposals for design approval rather than additional human-ratified interview answers. Remaining uncertainties are technical implementation risks; they must not weaken the agreed policy silently.

## Environment observations - not design decisions

- T3 capabilities advertise enabled cross-provider execution for Codex and Claude.
- Requested model IDs are advertised as `gpt-6.1-sol` and `claude-opus-5-5`.
- Both advertise high effort support. No reviewer has been launched and successful model execution through GateReeve's native adapters has not been verified.
- T3 discovery and GateReeve review execution use different provider identifiers and mechanisms; discovery alone does not qualify formal gate evidence.

## Technical questions carried into the design

- How is the fixed human mandate captured and independently checked when the agent amends planning commitments?
- How is autonomous residual-risk acceptance represented and qualified separately from reviewer verdicts, without erasing a FAIL or claiming an invented PASS?
- Which external blockers remain genuinely unresolvable without user input, and is final-PR readiness the terminal point in all three levels?
- How are material-finding clearance, persistent-dispute handback and autonomous adjudication represented in the current evidence/authority contract?
- How do runtime discovery and execution-availability checks work across supported environments, and how are unavailable models/providers handled under each autonomy level?
- Which changes require re-review by one or both reviewers, and how is parallel proof retained?
