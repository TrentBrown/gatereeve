# Interview - tb-whiteboard-test-gate

**Feature start:** 2026-09-24
**Status:** complete (2026-09-24)

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

## D1 - Certify the agent-produced defense, not human understanding

**Question:** When the new gate reports PASS, should it certify that the agent
produced a defensible whiteboard-style explanation of the pinned change, that a
human demonstrated understanding, or merely that a study artifact exists?

**Answer:** GateReeve should neither infer human understanding nor grade a
reader's quiz performance. The gate should pass when the agent believes it has
produced a defensible whiteboard-style explanation. A human may use the result
to prepare for a colleague's challenge, but that use is not itself governed
evidence.

**Decision:** The module's claim is bounded to the quality and completeness of
the agent-produced defense artifact. Interactive questions, private spoken
answers, and revealed explanations are study affordances; they do not measure,
record, or certify the reader's knowledge.

## D2 - Use an open-ended mock defense with progressive reveal

**Question:** Should the artifact simulate a sequence of open-ended challenge
questions with revealable defenses, or retain the multiple-choice interaction
used by Explain Diff?

**Answer:** Multiple choice is too weak for the intended whiteboard test. The
model should use its full reasoning ability to construct and defend an answer.
Keep multiple-choice questions in Explain Diff and make the new gate
full-featured.

**Decision:** Present a linear mock technical defense. Each challenge gives the
reader an opportunity to pause and formulate or speak an answer before
revealing the model's explanation and defense. The interaction is progressive
disclosure, not answer selection, scoring, or grading. Appropriate challenges
may include follow-up pressure, diagrams, concrete examples, code references,
and debugging reasoning.

## D3 - Make the defense independent of Explain Diff

**Question:** Should the Whiteboard Defense stand on its own, or may it assume
that the reader has already studied the Explain Diff artifact?

**Answer:** It must be entirely independent. Explain Diff may not exist, so the
new artifact should not refer to it at all.

**Decision:** The Whiteboard Defense is a standalone artifact with enough
change context to support its challenges and revealed defenses. Its module has
no dependency on Explain Diff, does not use Explain Diff as input, and does not
refer readers to Explain Diff as prerequisite or companion material.

## D4 - Scope an ordinary PR defense to that PR's change

**Question:** Should every Whiteboard Defense explain the full product, or use
a stable defense structure while limiting its subject to the particular PR?

**Answer:** It does not make sense for every PR to cover the product's full
functionality. The defense for a particular PR should focus only on the changes
in that PR. A separate challenge may be appropriate when the complete feature
is ready to become visible to the wider team.

**Decision:** At an ordinary PR boundary, the module defends only the pinned PR
slice and the minimum surrounding context needed to explain that slice. It must
not expand into a defense of unrelated product behavior. Full-feature defense
is a distinct evaluation scope whose timing and content remain to be settled.

## D5 - Provide slice and assembled-feature defense modes

**Question:** Should the module produce a slice-scoped defense for ordinary PRs
and an assembled-feature defense at the feature-final PR boundary before merge?

**Answer:** Yes.

**Decision:** The module has two evaluation modes. For an ordinary PR, it
defends the exact pinned slice diff. For the feature-final PR, it defends the
assembled feature from the configured original feature base through the pinned
final head, while distinguishing the final PR's own delta where useful. The
assembled-feature defense is generated before merge so challenges can lead to
remediation. Post-merge finalization remains reserved for obligations that
genuinely require an integration commit or later evidence.

## D6 - Size the defense by coverage, with a bias toward depth

**Question:** Should every artifact contain a fixed number of challenges, or
should its length adapt to the complexity and risks of the evaluated change?

**Answer:** The number should definitely be adaptive, erring on the side of too
much rather than too little.

**Decision:** Do not impose a fixed question count. Every defense must cover
how the evaluated scope works, why it was designed that way, and how it can fail
and be debugged, then add challenges for its actual risks, integration seams,
and surprising decisions. Prefer an additional substantive challenge over
leaving a defensible concern unexplored; avoid padding that adds no meaningful
coverage.

## D7 - Layer each reveal and add bounded Push Harder challenges

**Question:** Should a revealed defense provide a concise answer plus deeper
material, and should Push Harder be independently revealable follow-up
challenges rather than merely more exposition?

**Answer:** Yes. There is no intended audio component; the concise answer is
written so a person could deliver it at a whiteboard. Include Push Harder and
see how the interaction performs with real examples.

**Decision:** Each primary challenge can reveal a layered response: Concise
Defense, Deep Defense, and Evidence. It may then offer change-specific Push
Harder questions probing counterfactuals, failure modes, rejected alternatives,
hidden assumptions, or debugging scenarios. Each Push Harder question has its
own pause-and-reveal interaction. Keep nesting to one level and validate the
shape against representative real PRs before finalizing it. Do not add audio,
recording, speech recognition, or grading.

## D8 - Require concrete evidence for every primary defense

**Question:** Should a defense be unable to PASS when a primary challenge lacks
concrete evidence from the pinned evaluation scope?

**Answer:** Yes. Mandatory evidence should reduce hallucinations and weak
inferences.

**Decision:** Every primary challenge must include an Evidence layer anchored
in the exact evaluated source, such as commit-pinned code paths and symbols,
diff sections, tests, recorded decisions, configuration, or schema definitions.
Diagrams explain those sources but do not replace them. Unsupported factual
claims, unresolved weak inferences, or evidence outside the pinned scope prevent
the agent from honestly reporting PASS.

## D9 - Name the plugin Whiteboard Test and its output Whiteboard Defense

**Question:** Should the implementation use Whiteboard Test or Whiteboard
Challenge, and should the plugin and generated artifact share one label?

**Answer:** Use Whiteboard Test for the plugin and Whiteboard Defense for the
gate and artifact.

**Decision:** The product/plugin name is **Whiteboard Test**. Its GateReeve
module and human-facing artifact are **Whiteboard Defense**, with the artifact
filename `whiteboard-defense.html`. Use the `whiteboard-test` namespace, with a
likely module identity of `whiteboard-test/defense`. This follows current AI
code-ownership usage while avoiding confusion with the traditional interview
meaning of "whiteboard challenge" and avoiding any implication that the human
reader is graded.

## D10 - Require explicit repository activation

**Question:** Should installing Whiteboard Test automatically add a required
gate to every GateReeve project, or should each repository explicitly opt in?

**Answer:** Activation should be explicit per repository.

**Decision:** The Whiteboard Test plugin makes its skill and supporting assets
available but does not silently mutate project policy. A repository opts in by
tracking the exact `whiteboard-test/defense` module definition and selecting its
version and digest in `.gatereeve/workflow.json`. GateReeve then pins that
resolved module graph into new or explicitly migrated governed features.

## D11 - Combine agent judgment with deterministic artifact validation

**Question:** Should PASS require both the agent's substantive judgment and a
mechanical validation of the generated artifact?

**Answer:** Yes.

**Decision:** The agent attests that the Whiteboard Defense is accurate, deep
enough, and defensible for the pinned scope. A bundled deterministic validator
separately verifies exact scope metadata, required interaction structure,
primary challenge layers, evidence anchors, self-contained output, and the
absence of unresolved generation warnings. Both must succeed before PASS can be
recorded. The validator does not grade explanation quality or human knowledge,
and structural success alone cannot establish PASS.

## D12 - Distinguish findings about the work from failures of the defense

**Question:** Should discovering an implementation or design deficiency make
Whiteboard Test fail, or may the gate pass when the defense exposes that
deficiency honestly?

**Answer:** Prefer allowing the gate to pass while highlighting deficiencies in
the work, provided the defense itself is complete and trustworthy.

**Decision:** Whiteboard Test certifies the integrity and completeness of the
defense artifact, not that the underlying implementation is flawless. A missing
rationale, questionable tradeoff, known limitation, weak observability, or
other work deficiency may coexist with PASS when the artifact clearly separates
proven facts, supported inference, and unknowns. Wrong scope, unsupported factual
assertions, missing required evidence, omitted core challenges, or incomplete
generation are deficiencies in the artifact itself and require FAIL. Findings
about the work inform other gates and human judgment but do not independently
become implementation blockers through Whiteboard Test.

## D13 - Present findings both inline and in a linked summary

**Question:** Should work deficiencies appear only in a consolidated Defense
Findings section or be highlighted within the challenge that revealed them?

**Answer:** Use both.

**Decision:** Mark each affected challenge inline with an explicit textual type,
such as Undocumented rationale, Evidence gap, Known limitation, Open risk,
Unresolved unknown, Supported inference, or Accepted tradeoff. Also provide a
linked Defense Findings summary for rapid review and navigation. Do not rely on
color alone or paint every affected challenge as a gate failure; reserve stronger
visual severity for genuinely severe findings while preserving the distinction
between a passing defense and findings about the defended work.

## D14 - Generate questions and defenses in separate contexts (revised)

**Question:** Should the implementation agent choose and answer its own
questions in one pass, or should Whiteboard Test require challenger and defender
separation?

**Answer:** The process should definitely be adversarial, preferably using a new
thread so the challenger does not inherit the implementation agent's context.

**Decision:** Whiteboard Test uses separate Challenger and Defender/Publisher
passes. The Challenger derives pedagogically difficult questions from the
pinned source and evidence before answers are drafted. The Defender/Publisher
receives those questions and the pinned evidence, answers with evidence, and
builds the manifest and presentation. It must preserve honest evidence gaps,
unknowns, limitations, and questionable tradeoffs rather than converting them
into a verdict on the work. The earlier Challenge Audit role is removed by the
concern-separation decision in D20. Conversation isolation remains required: do
not treat role-play inside the implementation conversation as equivalent to an
independent challenge.

## D15 - Require a fresh context and fail closed when unavailable

**Question:** Should Whiteboard Test require a new context that does not inherit
the implementation conversation, and what happens when the host cannot provide
one?

**Answer:** Yes; lack of the required isolation should block the module rather
than silently falling back to the implementation thread.

**Decision:** The Whiteboard Defense worker receives only its system/plugin
instructions, the bounded invocation prompt, repository instructions, and the
pinned evidence packet. It must not inherit implementation-thread conversation
turns or summaries. A fork of that conversation is not acceptable. When the
host cannot prove this isolation, the module remains UNSET and reports itself
Unavailable; it does not record FAIL against the defended work and cannot PASS.
Whether the isolated worker appears as a first-class task or a host-native
subagent is still to be settled.

## D16 - Define isolation by context, not user-interface visibility

**Question:** Must the isolated worker appear as a separate user-visible task,
or may a host-native subagent satisfy the requirement when it has a fresh
context?

**Answer:** A fresh isolated worker context is sufficient.

**Decision:** Codex subagents launched without inherited turns and Claude Code
custom subagents with independent context windows may satisfy Whiteboard Test.
The adapter must verify the host's isolation capability and pass only the
bounded evidence packet plus repository instructions. A separate sidebar task
is optional presentation, not part of the portable contract.

## D17 - Require an adaptive Visual Model

**Question:** Should every defense use a fixed diagram type or count, or should
the evaluated change determine its visual explanation?

**Answer:** Use the adaptive-but-required Visual Model approach.

**Decision:** Every nontrivial Whiteboard Defense includes at least one
meaningful Visual Model chosen for the evaluated scope, such as an architecture
map, data-flow sequence, state machine, before-and-after wireframe, schema
relationship, debugging decision tree, or failure-containment topology. Visuals
must explain material behavior, connect to evidence, remain in the self-contained
artifact, and include a text alternative. Do not add decorative diagrams or
impose a fixed count. A rare N/A requires a reasoned explanation that the
validator can verify is present.

## D18 - Combine a structured manifest with sandboxed free-form HTML

**Question:** Should Whiteboard Test use a fully controlled renderer, or should
the model retain broad freedom to create a clear, lively, interactive defense?

**Answer:** Prototype a hybrid: a structured manifest plus sandboxed free-form
HTML.

**Decision:** Each Whiteboard Defense consists of a strict, machine-readable
manifest and a self-contained presentation authored by the isolated model. The
manifest records the evaluated scope, challenges, layered defenses, evidence
anchors, findings, relationships, and Visual Model obligations so GateReeve can
validate the defense contract without inferring quality from page markup. The
model may use its own HTML, CSS, JavaScript, SVG, diagrams, animations, and
interactions to explain the change as effectively as it can, subject only to a
small semantic linkage contract between visible sections and manifest IDs.

GateReeve displays the presentation in a containment boundary with no network,
filesystem, parent-window, or navigation authority. Deterministic validation
checks the manifest, verifies that required manifest items are represented in
the presentation, confirms that all resources are embedded, and exercises the
page for load failures, script errors, and broken required controls. The
isolated agent remains responsible for attesting to substantive clarity and
defensibility. This prototype intentionally protects expressive freedom through
containment rather than forcing every defense through one fixed visual template.

## D19 - Use two independently isolated Whiteboard contexts (revised)

**Question:** May one fresh worker perform the Challenger, Defender, and Audit
passes sequentially, or must each role run in its own fresh context?

**Answer:** The initial answer required three contexts. It is superseded by the
later decision to keep validation and remediation in LLM-as-Judge.

**Decision:** Challenger and Defender/Publisher run as two separately isolated
model invocations. The Challenger receives the pinned evidence packet and
generates the challenge set. The Defender/Publisher receives the same evidence
plus the resulting challenges, but not the Challenger's private reasoning or
any implementation conversation. No Whiteboard Challenge Auditor or correction
loop follows. A single context choosing and answering its own questions does
not satisfy Whiteboard Test, and neither does any context inherited from the
implementation conversation.

## D20 - Keep Whiteboard Defense and LLM-as-Judge independent

**Question:** Should Whiteboard Test validate or remediate the implementation
when its challenge process reveals a deficiency?

**Answer:** No. Whiteboard Test and LLM-as-Judge should perform independent work
with different purposes.

**Decision:** Whiteboard Test is a knowledge-transfer and explanation gate. It
asks difficult questions, provides evidence-backed defenses, and exposes
unknowns or weaknesses so a human can understand and discuss the exact change.
It does not score specification compliance, decide whether the implementation
is acceptable, block on a weakness in the work, or run a correction loop.
Discovering and honestly presenting a deficiency in the work is successful
Whiteboard behavior. Only a deficiency in the Whiteboard artifact or execution
contract itself can prevent Whiteboard PASS.

LLM-as-Judge remains the validation gate. It independently evaluates the pinned
implementation against the approved specification and rubric, produces its own
verdict, and may block passage. Remediation occurs outside the Judge: its
findings return to the implementation workflow, the work is revised, and a new
independent Judge pass evaluates the new pinned state. Neither gate consumes or
depends on the other's artifact; both independently consume only their required
pinned source evidence.

## D21 - Deliver Judge isolation in the same feature pull request

**Question:** Should guaranteed fresh-context execution for LLM-as-Judge be a
later feature, or be delivered alongside Whiteboard Test?

**Answer:** Include it in the same pull request, while preserving the separation
between the two gate contracts.

**Decision:** This feature and its eventual pull request include two explicit
workstreams: the new Whiteboard Test plugin and an isolation correction to the
existing Judge plugin/runtime. They share delivery scope but not responsibilities,
artifacts, verdicts, or dependencies. The later plan and issue breakdown must
track them separately so either implementation can be reviewed and tested on
its own.

Every Judge attempt must run in a provably fresh context that receives the
pinned specification, rubric, evaluated source/diff, verification evidence,
repository instructions, and bounded Judge prompt, but no implementation
conversation, implementation rationale, prior self-evaluation, or Whiteboard
artifact. The existing same-thread fallback is removed. If a host cannot prove
the required isolation, Judge remains UNSET and reports Unavailable rather than
passing or silently evaluating in the implementation context. After remediation,
a rerun uses another fresh Judge context against the newly pinned state.

## D22 - Enforce agent isolation in the GateReeve runtime

**Question:** Should fresh-context isolation remain an instruction that skills
ask agents to follow, or should GateReeve itself enforce and launch isolated
agent execution?

**Answer:** Isolation must be a GateReeve-enforced runtime property.

**Decision:** The GateReeve protocol core is the reeve and may record passage
only after a host adapter returns verifiable evidence that the required agent
run occurred in a fresh context with the bounded inputs declared by the module.
Skill prose, implementation-agent self-attestation, a copied invocation, or an
ordinary terminal session cannot establish isolation or grant passage.

The runtime contract must support the two independent Whiteboard roles and the
independent Judge attempt, bind each run to the pinned boundary and declared
input packet, and retain an auditable execution receipt containing enough
provider and context metadata to validate isolation without importing hidden
conversation content. Unsupported or unverifiable isolation leaves the module
UNSET and reports Unavailable. This guarantee belongs below the individual
skills so Codex, Claude Code, and future host adapters must satisfy one common
contract rather than relying on provider-specific prompt discipline.

## D23 - Add a reusable agent-workflow module primitive

**Question:** Should GateReeve special-case isolated execution for Whiteboard
and Judge, or add a reusable module primitive for staged agent work?

**Answer:** Add a reusable agent-workflow module primitive.

**Decision:** Extend the declarative module protocol with a provider-neutral
agent-workflow run contract. A module declares one or more named stages, each
with its role instructions, bounded inputs, expected outputs, context-isolation
requirement, and dependencies on prior stage artifacts. GateReeve schedules the
stages through a compatible host adapter, validates each execution receipt, and
binds the resulting evidence to the pinned boundary before the module can
record passage.

Whiteboard Test uses the common primitive for a Challenger stage followed by a
Defender/Publisher stage. Judge uses the same primitive for one independent
Judge stage per attempt. The core primitive must not encode Whiteboard or Judge
semantics, and provider adapters must not change gate meaning. This design is
intended to support future isolated or multi-stage agent plugins without adding
another gate-specific execution path to GateReeve core.

## D24 - Keep agent-workflow stages observational and read-only

**Question:** May isolated Whiteboard or Judge stages modify the repository or
attempt to repair deficiencies they discover?

**Answer:** No. Read-only observation and reporting are sufficient; a Judge
failure ensures that the problem returns to someone responsible for the work.

**Decision:** Agent-workflow stages receive read-only access to the exact pinned
repository snapshot and declared evidence. They may use a disposable scratch
area for analysis, but cannot modify the implementation, governed feature
record, or repository artifacts. Network access is denied by default. Stages
return typed outputs to GateReeve, which validates and writes the governed
artifacts so their provenance remains attributable to the pinned run.

Whiteboard reports explanatory findings without attempting remediation. Judge
produces its verdict and evidence; a FAIL blocks the gate but does not authorize
the Judge to edit code. Remediation occurs in a separate implementation context.
GateReeve then pins the revised state and launches an entirely fresh Judge
attempt. There is no automatic fix-and-rejudge loop inside either plugin.

## D25 - Select models through portable capability profiles

**Question:** Should agent-workflow modules pin vendor-specific model names, or
declare a portable capability requirement that each host maps to an approved
model?

**Answer:** Use portable capability profiles.

**Decision:** Whiteboard and Judge declare a high-capability reasoning profile
rather than embedding Codex, Claude, or other provider model names in their
module contracts. Repository policy or the selected host adapter maps that
profile to an explicitly approved provider, model, and reasoning configuration.
An adapter may not silently downgrade the declared capability. If no configured
model satisfies the profile, the module remains UNSET and reports Unavailable.

Every execution receipt records the requested capability profile and the actual
provider, model identifier or versioned alias, reasoning level, adapter version,
and relevant execution timestamps. This makes a result auditable without making
the plugin contract dependent on one vendor's changing model catalog.

## D26 - Run Whiteboard after Judge when Judge is enabled (revised)

**Question:** Should Whiteboard wait for or consume the Judge result, or should
both gates independently evaluate the pinned state after Verification?

**Answer:** Use conditional ordering rather than making Judge an unconditional
requirement.

**Decision:** Whiteboard declares Judge in its conditional `after` ordering
list, not in its hard `dependsOn` list. When Judge is enabled, Whiteboard waits
until the current Judge outcome is nonblocking under normal GateReeve semantics
(`PASS`, an explicit `WAIVED`, or a permitted `NOT_APPLICABLE`). A Judge `FAIL`,
`UNSET`, stale result, or unavailable run keeps Whiteboard ineligible. This
avoids generating an expensive defense for work that Judge is sending back for
revision.

When Judge is disabled by repository policy, GateReeve omits the conditional
edge and Whiteboard proceeds after its other declared prerequisites. Whiteboard
therefore remains usable in a workflow that does not include Judge. Even when
the ordering edge is active, Whiteboard does not read, cite, or derive content
from the Judge artifact; the current Judge event ID is only an eligibility and
freshness input. Each module retains its own verdict and evidence contract. If
remediation or another governed change alters the pinned state, GateReeve
invalidates the applicable stale outcomes and requires fresh runs.

## D27 - Require Whiteboard at activated PR boundaries

**Question:** Once a repository explicitly activates Whiteboard Test, should
Whiteboard Defense be required by default at every PR boundary?

**Answer:** Yes, with explicit human waivers for genuinely non-behavioral
changes.

**Decision:** The activated Whiteboard module has required disposition for both
ordinary slice and feature-final PR boundaries. Adaptive depth keeps a small
change's defense proportionate, but the model cannot exempt its own run or
silently classify a change as not applicable. Documentation-only,
governed-record-only, or similarly non-behavioral changes may bypass the gate
only through GateReeve's explicit human waiver flow with a nonempty rationale.
The waiver is bound to the current attempt and becomes stale when the pinned
inputs change.

## D28 - Launch activated agent-workflow gates automatically

**Question:** Should each eligible agent-workflow gate require a separate user
launch action because it may consume model capacity?

**Answer:** No. Existing PR-gated skills do not require a separate explicit
launch, and model cost is not an immediate concern.

**Decision:** Enabling an agent-workflow module in tracked repository policy is
standing authorization for GateReeve and the active workflow harness to launch
that module automatically when its pinned gate becomes eligible. Whiteboard
automatically begins after its required prerequisites and any enabled Judge
ordering edge become current and nonblocking. One declared workflow run may
advance through all of its internal stages without per-stage confirmation.

This decision does not authorize unbounded retry loops. Provider errors,
unavailable capability, malformed outputs, or unverifiable isolation remain
visible execution states and do not silently consume repeated attempts. A later
design may add optional consent, budget, or auto-run policy without changing the
semantic contracts of Whiteboard or Judge.

## D29 - Ship Codex and Claude Code adapters together

**Question:** May the first release implement isolated agent workflows for
Codex only and defer Claude Code, or must both supported harnesses work before
the feature is complete?

**Answer:** Require both Codex and Claude Code in the initial implementation.

**Decision:** The feature is not complete until GateReeve can execute and
verify the common fresh-context agent-workflow contract through both a Codex
adapter and a Claude Code adapter. Codex execution must create a fresh subagent
context without inherited implementation turns or summaries. Claude Code must
use an independent custom-subagent context rather than continuing or forking
the implementation conversation. Neither adapter may weaken the bounded input,
read-only repository, capability-profile, typed-output, or execution-receipt
requirements.

Provider-specific user-interface details may differ, and neither adapter must
create a separately visible task, but they must present equivalent protocol
semantics and auditable isolation evidence. If either configured host cannot
satisfy the contract, that run remains UNSET and reports Unavailable rather
than falling back to same-context execution.

## D30 - Support both headless and Desktop execution

**Question:** May isolated agent-workflow execution be a GateReeve Desktop-only
capability, or must it also operate through the portable headless workflow?

**Answer:** Require both headless and Desktop operation in the initial
implementation.

**Decision:** The portable protocol and CLI-facing runtime own the authoritative
agent-workflow execution contract, scheduling rules, isolation receipts,
freshness checks, artifact validation, and gate recording. GateReeve Desktop
invokes and observes that same governed runtime rather than implementing a
second UI-specific execution path. A run started or observed through either
surface must produce equivalent inputs, evidence, outcomes, and invalidation
behavior.

No gate may depend on Desktop being open, and no Desktop-only state may grant
passage. Provider adapters may integrate differently with local Codex and
Claude Code installations, but both headless and Desktop surfaces must expose
the same availability and failure semantics.

## D31 - Use the Whiteboard manifest as the evidence root

**Question:** Should the generated HTML itself be the gate's authoritative
evidence reference, or should a machine-readable manifest bind the complete
artifact bundle?

**Answer:** Use the manifest as the authoritative evidence root.

**Decision:** The Whiteboard gate records `whiteboard-defense.json` as its
governed evidence reference. The manifest contains the pinned evaluation scope,
challenge and defense structure, evidence anchors, findings, Visual Model
declarations, substantive attestation, deterministic validation result, and
cryptographic bindings to all required stage receipts and outputs.

The human-facing `whiteboard-defense.html` remains a self-contained interactive
artifact and is the primary document opened by GateReeve Desktop, but its bytes
and semantic IDs are bound by the manifest. Challenger and Defender/Publisher
execution receipts are likewise retained and digest-bound. An HTML file alone,
an unbound receipt, or a manifest whose referenced bytes do not match cannot
grant passage.

## D32 - Give upgraded Judge runs a manifest evidence root

**Question:** Should the isolated Judge continue using `judge.md` alone as gate
evidence, or adopt the same manifest-root provenance pattern as Whiteboard?

**Answer:** Adopt the manifest-root pattern.

**Decision:** Version the Judge module and record `judge.json` as the
authoritative evidence reference for new isolated runs. The manifest binds the
pinned scope and inputs, requested and actual capability information, Judge
execution receipt, structured verdict and rubric results, and the digest of the
human-readable `judge.md` report. GateReeve Desktop continues to present the
Markdown report as the primary human artifact while validating the JSON root.

Historical Judge events and `judge.md` evidence remain valid under their
previously pinned module definitions and model locks. This feature does not
rewrite old feature records or reinterpret prior passage. A new Judge module
version and explicit workflow-model migration govern adoption for work already
in progress.

## D33 - Retain auditable receipts without model transcripts

**Question:** Should agent-stage receipts preserve complete provider
conversations, or retain only the metadata and cryptographic bindings needed to
audit execution?

**Answer:** Retain metadata and digests, not hidden reasoning or full
transcripts.

**Decision:** Each stage receipt records the requested capability profile,
actual provider, adapter and adapter version, model identifier or versioned
alias, reasoning setting, opaque provider run or context identifier, start and
completion timestamps, isolation method, explicit zero-inherited-turns
attestation, pinned repository snapshot, read-only and network policies, and
completion or execution-failure status. It also records digests for the
effective instructions, materialized bounded prompt, declared input packet, and
typed stage outputs.

Receipts do not retain hidden chain-of-thought, unrelated provider conversation,
or a full internal transcript. Human-reviewable stage products remain separate
digest-bound artifacts: the challenge set, Whiteboard manifest and HTML, or
Judge result and Markdown report. Provider identifiers that are not safe or
stable to expose may be represented by an opaque locally auditable token rather
than raw service metadata.

## D34 - Preserve the Challenger's complete question set

**Question:** May the Defender/Publisher remove or soften Challenger questions
while composing the final Whiteboard Defense?

**Answer:** No. Treat the Challenger's required question set as immutable.

**Decision:** The Challenger produces the complete required set of primary and
Push Harder questions before the Defender/Publisher stage begins. The second
stage may add clearly identified supplemental questions, but it cannot remove,
soften, merge away, reorder into obscurity, or silently omit a Challenger
question. Every required question must remain represented in the manifest and
HTML and receive either an evidence-backed defense or an explicit unknown,
evidence-gap, or limitation response. Honest inability to defend the underlying
work remains a Whiteboard finding rather than a work-validation failure.

## Interview conclusion

The design interview is complete. It establishes the product boundary,
interactive artifact, slice and feature-final scope, evidence and visual
requirements, independent Challenger and Defender/Publisher contexts,
manifest-root provenance, conditional ordering after an enabled Judge,
automatic governed execution, and the reusable agent-workflow runtime needed
to enforce fresh-context Judge and Whiteboard runs across Codex, Claude Code,
headless workflows, and GateReeve Desktop.
