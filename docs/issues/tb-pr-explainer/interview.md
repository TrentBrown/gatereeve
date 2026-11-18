# Interview - tb-pr-explainer

Status: concluded. The revised design was approved on 2026-11-18; specification drafting is authorized, implementation is not yet authorized.

Repository: `TrentBrown/gatereeve`.
Delivery branch: `tb-pr-explainer`.
Initial source base: `67871b00d6227c77257006176b51c5e231cabb44` (`origin/main`).
GateReeve run: `pr-explainer-start-full-20261118`.
Run rigor: full, explicitly human-selected. Autonomy: supervised, built-in default.
External tracker: none supplied; no external task was created.

## D1 - Feature purpose

**Question asked:** What capability is the user actually seeking from the survey?

**Answer given:** "What I'm looking for specifically is a skill that human reviewers can use to examine what's in a pull request." The user described design/plan/spec context, tests created and run, and appropriate before/after behavior as useful inputs.

**Decision reached:** Build a reviewer-facing PR explanation skill. Its HTML should help the reader understand intent, behavior, implementation, supporting evidence, and where to focus review. Existing verification evidence is explanatory input; the feature is not a new verification system.

## D2 - Metrics excluded from this version

**Question asked:** Should the proposed skill include the measurement ideas from the survey?

**Answer given:** "I'm not yet ready to add metrics to enhance the skill, but that's a good idea for later."

**Decision reached:** Exclude reviewer-performance metrics, scores, and dashboards from this skill's first version. Reporting existing test evidence is still in scope. GateReeve's own development-process observations are a separate concern.

## D3 - Tooling: run rigor

**Question asked:** "Full or light for this GateReeve run?" Full was recommended for the first version, with metrics excluded and workflow-integration scope to be decided during design.

**Answer given:** "Full rigor (recommended)".

**Decision reached:** Use full rigor. `run.start` recorded the actual human choice; autonomy remains supervised. This is not design approval, implementation authorization, or merge/release authority.

## D4 - Canonical location and skill name

**Question asked:** "Where should the canonical skill live?" Evolving the existing GateReeve skill, while supporting ordinary PR use, was recommended over starting a personal skills repository.

**Answer given:** "Let's keep the skill in the same place that explain-diff lives but give it a better name, probably: pr-explainer".

**Decision reached:** Own the skill in GateReeve's canonical shared skill tree, using `plugin-src/shared/skills/pr-explainer/` as the proposed new name and location. Evolve the existing `explain-diff` capability; do not create a separate personal repository. Ordinary PR use outside a governed run remains the working intent. Compatibility handling for the old name remains open.

## D5 - Deliver the skill before mandatory enforcement

**Question asked:** "Should the first delivery build pr-explainer alone, or also make its HTML artifact mandatory in GateReeve?" Skill first was recommended, defining the integration contract now and adding enforcement after trying it on real PRs.

**Answer given:** "Skill first; enforcement follows (recommended)".

**Decision reached:** The first delivery builds the skill and defines how a later GateReeve invocation supplies inputs and receives the artifact. Making HTML mandatory in the workflow is a follow-up, outside this delivery. Real PR examples should exercise the skill before enforcement is introduced.

## D6 - Primary reader

**Question asked:** "Who should pr-explainer primarily write for?" An experienced engineering reviewer unfamiliar with the changed area was recommended, using plain language and deeper code detail as needed.

**Answer given:** "Engineering reviewer unfamiliar with the area (recommended)".

**Decision reached:** Write primarily for an experienced engineering reviewer who lacks context for the changed subsystem. Explain the relevant domain, existing behavior, and mechanism without assuming prior familiarity. Use plain language and progressive depth; do not make beginner instruction or equal treatment of a non-code-reading audience the default.

## D7 - Inline code and diff coverage

**Question asked:** "How much code should the HTML include?" Selected annotated code or diff excerpts beside the explanation, with links to the full change, were recommended over a full diff viewer or links alone.

**Answer given:** "Selected annotated excerpts and source links (recommended)".

**Decision reached:** Include selected annotated code or diff excerpts that explain consequential mechanisms and changes. Link them to the full source/change. Organize around reviewer understanding rather than reproducing the entire PR. Selection must not hide consequential changes; the artifact should account for the overall scope and direct readers to material outside the excerpts.

## D8 - Existing evidence by default

**Question asked:** "When test results or runtime screenshots are missing, what should an ordinary pr-explainer invocation do?" Using existing evidence and identifying gaps was recommended, with fresh test runs or app/browser captures available when explicitly requested.

**Answer given:** "Use existing evidence; identify gaps (recommended)".

**Decision reached:** An ordinary invocation reads the change and available supporting records, then generates the explanation using existing evidence. It clearly distinguishes tests added or changed, checks actually run, observed runtime behavior, and missing evidence. It does not start new test runs, applications, or browser captures by default. Fresh evidence collection requires an explicit request and remains subject to the task's existing authorization boundaries.

## D9 - Concerns without a review verdict

**Question asked:** "If pr-explainer notices a possible defect or a mismatch with the spec, how should it respond?" Flagging reviewer concerns with source references, without an overall approval verdict or a separate code review, was recommended.

**Answer given:** "Flag reviewer concerns; leave the verdict to the reviewer (recommended)".

**Decision reached:** Surface supported concerns and possible intent/implementation mismatches for the reviewer, clearly distinguishing observations from hypotheses. Do not assign an approval verdict, expand into a separate code review, or fix product code as part of an ordinary explanation invocation.

## D10 - Replace explain-diff completely

**Question asked:** Approve the proposed design, which included a thin explain-diff compatibility entrypoint, or revise it first?

**Answer given:** "Revise the design first" and "Remove the requirement to keep Explain-Diff around. Our new skill is meant to fully replace that."

**Decision reached:** pr-explainer replaces the distributed explain-diff skill. Remove the old entrypoint instead of retaining an alias, update current callers and packaging references, and use pr-explainer.html as the new default. Existing retained historical artifacts remain untouched. This supersedes the compatibility proposal in the initial design and closing summary below; no design approval was given.

## D11 - Discover existing visual artifacts more deliberately

**Question asked:** The user raised whether enough useful visual evidence would be available for the explanation.

**Answer given:** "I think we'll have to rely upon screenshots generated as a side effect of our end-to-end Playwright tests to draw upon." They suggested test enhancements as "probably a second step" and said, "it might be useful to guide the skill towards digging more deeply for these screenshots in the appropriate places, but I'll leave that decision up to you."

**Decision reached:** Strengthen the proposed design with a focused search guided by actual test, reporting, and CI configuration, including existing screenshots and report/trace/video attachments. Qualify captures by test/run, revision, and scenario where available. Preserve D8's existing-evidence default. Use source-grounded explanatory diagrams when captures are absent; do not fabricate product screenshots. Improving tests or CI to produce richer captures remains follow-up work.

## D12 - Revised design approved

**Question asked:** Approve the revised design with full skill replacement, deliberate discovery and qualification of existing visual artifacts, source-grounded illustrations, and deferred capture improvements and enforcement?

**Answer given:** "Approve revised design; proceed to specification".

**Decision reached:** The human approved the revised design presented with fingerprint `sha256:384011ae55d173ba1a0fa77e22d3dae450cda98a1bc3f62c56a694409d09fe56`. Update its approval metadata, record approval against the resulting current bytes through GateReeve, and proceed to specification and implementation planning. This does not authorize implementation, merge, or release. After approval the design is frozen; substantive later changes need an explicit recorded amendment.

## Choices addressed in the approved design

- How should current invocations and artifact-name references be updated to the replacement without rewriting historical evidence?
- Which inputs and outputs are mandatory, and how does the skill handle missing design/spec/evidence?
- What explanatory discretion should the skill retain, including background depth, interaction, and quizzes?
- Which representative real changes will exercise the first version within authorized resources?

## Interview closing summary

The first version's audience, purpose, source location, name, excerpt policy, evidence boundary, concern handling, and separation from mandatory enforcement are settled in D1-D9. The skill prepares a human engineering reviewer to examine a change. Metrics are excluded. Test evidence is consumed rather than generated by default.

The initial synthesis proposed a thin explain-diff entrypoint and legacy workflow artifact paths; the user rejected that compatibility proposal in D10. The revised design proposes a full replacement, deliberate discovery of existing visual evidence, adaptable page structure, and optional quizzes. Missing supporting documents or evidence remain visible gaps. Unresolved source identity must be resolved before making revision-specific claims.

Evaluation will use permitted read-only change snapshots and generated local HTML. Exact examples and focused checks belong in the later spec/plan. Mandatory workflow enforcement remains a separate follow-up. No actual skill implementation, spec, or implementation plan was written during this interview.

This interview is now ready to inform a separate design synthesis.
