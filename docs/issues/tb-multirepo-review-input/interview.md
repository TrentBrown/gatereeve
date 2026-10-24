# Interview - tb-multirepo-review-input

**Status:** complete
**Updated:** 2026-10-23

## Original handoff context

These notes came from the originating CareNav handoff. They describe historical
investigation and authority, not approval of this revised GateReeve design or
the current application release state.

- User authorized a separately scoped GateReeve adapter repair with “Proceed” after the concrete request to repair the multi-repository review failure, and authorized publication of actual CareNav implementation branches as closed PRs after required reviews.
- CareNav9212 source changes are already committed and locally verified. Do not mix workflow-tool changes into any CareNav repository.
- Reproduce the documented workspace shape: one canonical feature record outside three nested Git roots. Preserve its single authority; do not duplicate journals or copy workflow tracking into each product repository.
- Preserve strict safe paths, pinned source, clean isolated read-only provider execution, network denial, compact review input, approved requirements and exclusion of prior review/history.
- Installation doctor passes. Current GateReeve main643e3ea and installed rc16 share the failing assumption in review-input.js; no update already fixes it.
- Existing single-repository review behavior must remain supported. Never edit the installed cache or generated distribution as source.
- No hosted migration, deployment, caregiver activation, production AWS write, public GateReeve release or main merge is authorized by this repair request.

## Original proposed direction

Use the existing trusted workspace resolver to identify the canonical central feature record for a selected nested repository. Capture only approved spec/design as immutable, hash-bound review evidence at safe virtual paths in the isolated snapshot. Keep application source pinned to the selected Git base/head. Bind requirement identity to the review fingerprint and existing approval/authorization checks so requirement drift cannot reuse an old result. Preserve the current Git-backed requirement path for ordinary single-repository features.

## D1 - Preserve the parent-folder layout; Git tracking is optional

**Question:** Must shared requirements and evidence have a separate Git owner,
or may the canonical record remain outside the application repositories?

**Answer:** Trent explained that he keeps GateReeve documents in the parent
folder and does not require source control unless that parent already happens
to be a repository. He then confirmed: “Yes, let's proceed with that approach.
Update the design to preserve the parent-folder layout with Git tracking
optional, and work through the local snapshot and evidence contract.”

**Decision:** Preserve the canonical parent-folder layout. A parent Git
repository, a new records repository, evidence commits and remote publication
are not prerequisites for the shared-record review path. The mandatory Git
owner/remote-retention proposal was a maintainer recommendation, never a
ratified requirement, and is superseded by this choice.

## D2 - Use locally retained snapshots and bound evidence

**Question:** What replaces application-repository tracking while preserving
exact review inputs and evidence?

**Answer:** Trent accepted the approach of capturing approved requirements into
immutable local review snapshots, hashing the bindings, retaining evidence in
the shared folder, preserving application Git pins, and making an explicit
keep/archive/discard decision before removing an untracked workspace.

**Decision:** Develop a local retention proof validated by the protocol core.
Hashes identify bytes; snapshots retain bytes; journal events remain passage
authority. Local retention is not a backup or an archive.

## Contract worked through for revised design synthesis

These are concrete proposals derived from D1/D2, not separately observed human
approvals or implemented behavior:

- Resolve canonical authority and capture only approved spec/design plus the
  precise input evidence required by a readiness declaration or formal gate.
- Publish frozen input bundles under `review-inputs/<captureId>/`. Keep future
  outputs under existing readiness/attempt identities so manifests do not
  refer to their own future results.
- Bind requirement hashes and authority references through advisory identity,
  canonical formal preparation, core fingerprints and acceptance/currentness.
  Adding them only to a prompt or snapshot digest is insufficient.
- Replace the shared-record tracking check with typed local reference-closure
  validation. Preserve the existing repository-local Git-backed path.
- Derive shared packet inventory/evidence deltas from core-validated manifests
  and events, not application Git diffs or caller-supplied changed-path lists.
- Revalidate required retained and canonical bytes at lifecycle boundaries.
  New unrelated reports do not stale reviews; requirement/source/dependency
  changes do. Missing snapshots cannot be silently reconstructed from new bytes.
- Preserve formal history exclusion even when captures happen to be tracked.
- Publish before passage; reconcile incomplete operations without fabricating
  PASS or overwriting conflicting artifacts. Require compatible model adoption
  for changed admission semantics; preserve historical replay.
- Keep local evidence by default, with explicit cleanup decisions. Do not add
  a Git/remote requirement, automatic archive, garbage collection or retry cap.
- Cover the ordinary review boundary end to end; report already-merged
  completion-recovery limitations separately.

## Interview conclusion

The user's storage preference and high-level approach are settled sufficiently
to synthesize the requested revision. Engineering risks and failure cases are
identified in `design.md`; no further storage-policy question is being imposed.
The revised document remains a review candidate. Authorization to update it
does not silently record its design gate or begin specification/implementation.

## Historical read-only verification

At investigation baseline `643e3ea`, compact-review and advisory-input suites
passed 20 tests on Node 24.18; they did not cover the parent-folder layout.
`advisory.assertTracked` checks application HEAD and must be deliberately
replaced for the versioned shared-record path, not skipped. No specification
or implementation source changes have begun. Those tests were not rerun for
this document edit.

## D3 - Broaden the iteration to model-led orchestration

**Question:** Should the iteration prescribe a leaner fixed validation sequence,
or allow models to choose an efficient strategy within explicit obligations?

**Answer:** Trent accepted the latter direction: “I like that direction. Let's
rework the design around model-led orchestration while preserving our planning
backbone and required validation gates. Walk me through the remaining decisions
before we implement.”

**Decision:** Reopen design before implementation. Keep the same feature record
and journal; do not initialize another authority. The previous storage design
becomes an input to a broader iteration rather than the implementation target.
Retain D1/D2 (parent folder, Git optional, exact retained inputs). Do not impose
one discovery/fix/judge sequence as a new universal choreography. The model may
adapt execution strategy within the approved scope and gate contracts.

## D4 - Preserve the planning backbone and hard validation obligations

**Question:** Which structure is valuable and should survive orchestration
simplification?

**Answer:** Trent explicitly values interview, design, spec, plan and issues as
conceptual orientation. He also said: “What I like about the gate concept is
that it's a hard requirement that can even be enforced by hooks in the model.
The fulfillment of the gate, to some extent, must be left up to the model”. He
wants current/proposed architecture diagrams at useful levels and aspects.

**Decision:** Preserve planning artifacts/approval boundaries and required,
potentially numerous validations. Separate a gate's obligation, accepted proof
and authority from scheduling and remediation strategy. Do not interpret the
efficiency objective as permission to remove required validators, weaken their
criteria, self-certify independent review or skip human approval.

## Current discussion material and remaining decisions

[architecture-options.md](architecture-options.md) is an interim architecture
discussion with current/proposed diagrams, observed hook limitations, a gate
responsibility model and an ordered decision agenda. Proposed choices there are
not yet ratified. The prior interview conclusion applied only to the narrower
storage proposal; this broader interview is active. Final `design.md` synthesis,
specification and implementation wait for the remaining decisions and design
gate. No passage or model migration is recorded by these document edits.

## D5 - Enforce milestone boundaries, not individual commits

**Question:** Should hard checks apply at authorization/acceptance/merge/
completion milestones, or also to intermediate commits?

**Answer:** Trent confirmed: “Yes, enforce the gates at those milestone
boundaries, not on individual commits. Let the model work freely within the
authorized phase.”

**Decision:** Enforce beginning implementation, entering human acceptance,
merging and declaring completion against their applicable gate/authority
contracts. Do not impose gate checks on individual commits. Authorized models
choose intermediate work, scheduling, diagnostics and remediation. Actual host
interception coverage remains a platform implementation question; this decision
does not assert currently installed hooks block these actions.

## Discussion in progress - guidance, dependencies and evaluator independence

Trent asked whether the state machine itself firmly guides the model and
whether plugin dependency/before/after machinery can be removed. He asked to
proceed to the evaluator-independence decision. These questions do not ratify
removing every dependency or combining specific validators.

Proposed answer: state makes obligations visible and the core refuses invalid
recorded passage; model compliance outside those operations is cooperative,
not guaranteed by reluctance or memory. Remove incidental scheduling constraints
and the need for a general scheduler graph where possible. Retain explicit
required evidence inputs in gate contracts; a model chooses when to assemble
them, while the core/evaluator verifies their availability, identity and
applicability. This can replace explicit inter-gate dependencies with artifact
input contracts without pretending the underlying data requirements disappear.

Proposed next choice: require semantic code/spec acceptance assessment to be
independent of the implementer; mechanical runners need real receipts rather
than separate LLM judges; retain human authority gates. Decide whether one
fresh independent evaluator may fulfill both code-review and spec-acceptance
obligations with separate results, or whether those two assessments must also
be independent of each other. This recommendation is not yet a decision.

## D6 - Independence from the implementer; separate gate verdicts

**Question:** Must code review and spec acceptance be independent of each other,
or is independence from the implementer the required separation?

**Answer:** Trent confirmed: “Yes, independence from the implementer is what
matters. One fresh evaluator can satisfy both gates, with separate verdicts.
Let's move on to evidence reuse and how we decide when a result is still valid.”

**Decision:** Permit one fresh evaluator, without inherited implementation
conversation, to fulfill code-review and spec-acceptance obligations. Retain
separate explicit verdicts and evidence for both gates. Do not require those
two evaluations to use distinct evaluator sessions merely for mutual
independence. Preserve required human authority and actual runner evidence.
This supersedes the earlier unratified evaluator choice in the discussion.

## Evidence-reuse discussion - proposed contract, not yet ratified

- Results retain their original evaluated input/candidate identity; reuse records
  why they apply to the current candidate, without relabeling the original run.
- Automatically reuse only when a gate's required inputs remain equivalent,
  evidence is intact, and the evaluator/execution still qualifies under the
  applicable policy. New timestamps, attempt IDs or unrelated bookkeeping do
  not by themselves change applicability.
- Inputs include the relevant source/test scope, approved criteria/requirements,
  actual check command and environment assumptions, and any consumed evidence.
  A code-review result includes its base/diff scope as well as the evaluated code.
  Time-sensitive/external checks additionally bind observed state/validity rules.
- Default to a conservative declared scope; use existing project/build-system
  input manifests where available rather than inventing whole-program
  dependency analysis. A changed shared utility, migration, lockfile, runner or
  relevant configuration must not be classified as unrelated by filename alone.
- When relevant inputs changed or equivalence is unknown, obtain new proof for
  the affected obligation. This may be focused re-execution or a qualifying
  independent delta assessment, not necessarily a full repeated review/suite.
  Delta assessment's access to prior findings remains part of the next review-
  knowledge decision; no current history-exclusion rule is silently relaxed.
- The model may propose reuse and scope; the core checks declared input binding,
  evidence and accepted proof. The model's unsupported semantic assurance is
  insufficient to extend a result to changed inputs.
- Preserve FAIL/unavailable records. Reuse cannot turn them into PASS or permit
  an omitted required gate. Missing evidence is unavailable; restored exact
  bytes allow revalidation, not a fabricated new execution.
- Final acceptance must cover the final candidate through verified reuse and
  required refreshes. Do not add a universal expiry timer or mandatory whole-
  suite rerun solely because a commit ID changed.

## D7 - Permit targeted delta assessments

**Question:** May an independent evaluator supplement the earlier review by
assessing the delta and its interactions, rather than rereview the whole slice
after every code change?

**Answer:** Trent confirmed: “Yes, allow targeted delta assessments that
supplement the earlier review and cover the changed code and its interactions.
Let's move on to how reviewers use prior findings without overlooking new
defects.”

**Decision:** Permit targeted independent refreshes that supplement preserved
earlier review evidence and explicitly cover changed code and its interactions.
Do not require a fresh full-slice review solely because the candidate changed.
The original review retains its original input identity; the new assessment
identifies the prior proof, delta, interaction coverage and current candidate.
Unknown coverage or wider changes can require broader assessment. Detailed
applicability fields in the preceding discussion remain design proposals for
later specification; this decision does not retroactively rebind old results.

## Prior-finding knowledge discussion - proposed, not yet ratified

- Supply a bounded, source-bound review packet: approved requirements and gate
  criteria, prior reviewer findings/results and coverage limits, current delta,
  claimed dispositions, and relevant source/test evidence. Separate reviewer
  conclusions from implementer assertions. Exclude raw implementation chat and
  decision journals as implicit requirements.
- Prior findings are review inputs, not authority. The fresh evaluator verifies
  claimed fixes and prior resolutions affected by the delta against code/evidence,
  and independently searches changed code/interactions for regressions, missing
  invariants and bypasses. Carry forward unaffected resolutions through verified
  applicability rather than rebinding every historical finding ID each round.
  Retain original reports for inspection. Do not require another blind full-slice
  session for each refresh.
- Preserve stable finding/class identities. Output both prior-finding status
  (resolved, still present, unsupported, etc.) and newly supported defects with
  current candidate/path evidence and explicit scope/limitations.
- New instances of a supposedly resolved defect class remain reportable. Reopen
  a finding with concrete contrary evidence, not merely a rewritten summary.
  Class resolution is not a prohibition on further discovery.
- Blocking follows approved gate criteria. Style suggestions, hypothetical
  concerns and unrelated pre-existing issues do not silently become new
  acceptance requirements. Retain substantiated out-of-scope findings for
  explicit disposition without forcing unapproved scope expansion.
- Reviewer history access is a deliberate versioned change from the current
  formal history-exclusion policy, not inherited implementation context. The
  core validates packet/reference integrity; semantic adequacy remains the
  independent evaluator's responsibility. No source/runtime changes yet.

## D8 - Use prior findings while preserving new-defect discovery

**Question:** May reviewers receive prior findings/relevant dispositions,
verify affected resolutions, and still report newly supported defects under
the approved gate criteria?

**Answer:** Trent confirmed: “Yes, let's adopt that approach. Let's move on to
human exceptions and amendments—what can be waived, and how should we record my
authorization without adding unnecessary ceremony?”

**Decision:** Give fresh independent evaluators bounded, source-bound reviewer
history and relevant dispositions. Verify claimed fixes/affected resolutions,
carry unaffected proof through applicability checks, and independently examine
the delta/interactions for new defects. No ban on new instances of a resolved
class, mandatory extra blind full review or re-reconciliation of every old ID.
Preserve separate gate verdicts, explicit coverage limits and original reports.
Exclude raw implementation conversation as authority; earlier verdicts are
review inputs, not commands. New blocking findings must satisfy gate criteria.

## Human exceptions and amendments - proposed, not yet ratified

- Separate ordinary implementation choices, explicit requirement amendments,
  and scoped quality/risk exceptions. The model may change execution strategy
  inside approved commitments without seeking human reapproval. Deferring or
  narrowing promised behavior is still an amendment, even if rubric IDs do not
  change.
- Recommend human-waivable quality obligations (for example an unavailable
  validation or a known unresolved finding), subject to each declared gate's
  policy. Preserve original FAIL/missing result and record accepted exception;
  do not relabel it PASS. A forbidden waiver requires an explicit applicable
  policy amendment, not a fabricated guard fact.
- Evidence truth/identity and actual authority are not falsifiable through a
  waiver. An authorized decision to proceed without proof is recorded as
  unverified/waived, never as proof that tests ran or reviewed code merged.
  Preserve actual source/merge observations and original evidence.
- Present a concrete decision once: affected gates/findings or requirement
  delta, known consequences, candidate/content/requirement identity and action
  scope. Record the user's actual instruction or unambiguous response in that
  context, with a host-provided conversation/message reference when available,
  retained quote/provenance, summary, rationale and scope. Do not invent a
  message identifier or attribute an assistant summary as a human quote.
- One instruction may authorize several named exceptions or an amendment plus
  continuation/merge when explicit. Do not request repeated confirmation for
  its internal record/apply/validate steps. Apply idempotently and retain honest
  intermediate state if recording is interrupted.
- Default exceptions to the named candidate/risk, not future work. Invalidate
  or seek renewed authority when relevant source/requirements/risk changes;
  unchanged bookkeeping alone does not demand another approval. Broader
  standing policy needs explicit scope. Do not infer merge/deploy authority
  from a waiver unless the instruction includes that action.
- An amendment retains old/new requirement versions and the human decision,
  updates affected planning/criteria views, and refreshes only affected proof.
  It changes the active commitment, not the historical evaluation result.
- The current human-confirmed actor is cooperative evidence of an observed
  decision, not independent authentication. Stronger identity controls are a
  distinct integration. Existing hosted protections are not bypassed by a local
  exception. No new approval, waiver or protocol transition is recorded now.

## D9 - Scoped human exceptions and amendments with one authorization

**Question:** May the human explicitly waive substantive quality obligations or
amend commitments while preserving truthful evidence, scoped authorization and
visible exceptions?

**Answer:** Trent confirmed: “Yes, that boundary fits. Record that decision,
and let's move on to migration and how we’ll test whether the new approach
improves efficiency without reducing quality.”

**Decision:** Adopt the preceding human-exception and amendment contract.
Ordinary strategy within approved scope remains model-led. Human quality/risk
exceptions follow the applicable gate policy; non-waivable policy requires an
explicit policy amendment. Preserve failures and missing proof as exceptions,
never fabricated PASS, execution, integration or authority. Capture the concrete
scope, known consequences, actual instruction and available provenance once;
an unambiguous response to a specific proposal suffices. Internal recording,
application and validation do not require repeated human confirmation. Preserve
old/new commitments and refresh affected proof. Relevant risk/scope changes
require renewed applicability or authorization; bookkeeping alone does not.
Merge/deployment authority must be included explicitly. This records a design
decision, not an actual gate waiver, amendment or milestone passage.

## Migration and evaluation - rejected proposal, superseded by D10

- Introduce an explicitly versioned protocol/model. Existing features retain
  their locked semantics and historical evidence; new features may opt into
  the pilot. Preserve historical reading/replay without maintaining two active
  orchestration systems indefinitely. Retirement is a later explicit decision.
- Offer existing-feature adoption only at a quiescent milestone, with no active
  attempt. Show the obligation/authority mapping and evidence that remains
  applicable or needs refresh before authorization. Preserve feature identity,
  journal and original results; append the adoption boundary. Unsupported or
  ambiguous mappings block adoption rather than infer passage.
- Start with protocol regression fixtures and isolated comparative trials,
  then a small opt-in live pilot covering both one-repository and shared-parent
  multi-repository layouts. Do not start by converting a complicated active
  delivery. Every live milestone still needs its normal applicable gates.
- Compare old/new orchestration on the same frozen tasks and approved quality
  obligations, with matched model/tool/environment settings and bounded repeats
  to expose model variance. Include clean controls, known defects, defects newly
  introduced during fixes, shared dependency changes, requirement drift, missing
  evidence, cross-repository interactions and explicit human exceptions.
- Verify protocol invariants deterministically: no unsupported passage, stale
  reuse, self-certified independent review or lost authority; interruption and
  retry preserve evidence and idempotence. Separately test actual interception
  coverage for each supported host; declare unsupported coverage honestly.
- Use held-out defects and blind independent assessment of final candidates to
  detect misses, false alarms and regressions. Adjudicate genuine defects under
  unchanged acceptance criteria; finding count alone is not a quality score.
  This extra evaluation is a bounded pilot experiment, not another permanent gate.
- Measure total validation tokens/cost, active elapsed time, repeated expensive
  executions, human interventions and bookkeeping burden per accepted slice.
  Separate waiting time from active work, summed provider time from wall time,
  unavailable measurements from zeros, and pilot audit cost from operating cost.
- Set success criteria before trials. Proposed practical target: roughly 30%
  lower median validation cost across representative matched trials, with no
  invariant failures, no newly missed known blocking defects and no observed
  worsening of independently assessed defect outcomes. Report distributions,
  task mix, exceptions and inconclusive results; a small pilot cannot prove
  statistical quality equivalence. Exceptions cannot count as equivalent passes.
- Expand adoption after human review of the pilot results; continue observing
  escaped defects and rework. Pause expansion on a regression and repair the
  failure. Revert new-feature defaults if needed; never erase new-format events
  or silently downgrade an adopted feature. Finish with compatible tooling or
  explicitly map back at a safe boundary; rerun proof whose applicability failed.

## D10 - Direct cutover; learn through real project work

**Question:** Should adoption begin with a fresh-feature pilot and defer active
feature migration until comparative results are reviewed?

**Answer:** Trent directed: “I want to just make the switch now. If I have any
work in flight with the older GateReeve, I will simply resume them. Let's not
try to be backwardly compatible. We'll test this on real code and real projects.
And iterate if we need to.”

**Decision:** Replace the current orchestration with the new approach directly.
Do not build backward compatibility, parallel legacy execution, historical
protocol replay support, automatic migration tooling, staged opt-in/adoption,
or a pilot/benchmark prerequisite. Trent will resume older work as needed.
Keep prior project documents and evidence as available context; this does not
require interpreting old events as current gate passage or deleting old records.
On resumption, establish current commitments and obtain applicable evidence for
current milestones; do not restart the entire planning interview solely because
old runtime state is unsupported. Exact resume mechanics belong to the current
protocol specification, not a legacy conversion subsystem.

Use ordinary implementation regression tests for core correctness and evaluate
practical efficiency/quality on real code and projects. Observe repeated checks,
validation cost/time when available, human interruptions, actionable findings,
missed defects and rework using existing receipts/records. No mandatory matched
trial suite, additional blind pilot audit, fixed percentage improvement target,
rollout dashboard or adoption gate. Keep required validation gates and scoped
human authority; iterate on concrete observed failures. This replaces the
preceding unratified rollout proposal and earlier backward-compatibility
requirements in the narrow storage proposal.

## Broader interview conclusion

D1-D10 settle the design direction: parent-folder local evidence with Git
optional; retained planning backbone; model-led execution within authorized
phases; milestone enforcement; independent code/spec verdicts that may share
one evaluator; applicable evidence reuse and targeted delta assessments;
bounded prior findings with fresh defect discovery; explicit human exceptions;
and direct cutover without compatibility machinery.

Remaining engineering questions are consciously deferred to specification:
exact gate/input schemas, current-protocol resume entry, platform interception
capability, and transaction/error handling. The design should make these
limits visible. The implementation should remove incidental scheduler ordering
while preserving genuine evidence requirements. No remediation-round cap is
introduced. The revised design is ready to synthesize for human review; no
approval or native passage is inferred from concluding this interview.
