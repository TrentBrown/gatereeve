# Interview - workflow-state-machine-cli

**Feature start:** 2026-08-24
**Status:** complete

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

## D1 - Authoritative repository

**Question:** Should the workflow state-machine and CLI feature belong to the
GateReeve repository or remain in the exploratory `deterministic-subagents`
directory?

**Answer:** Use `/home/trent/code/tb/gatereeve` as the authoritative project
repository.

**Decision:** GateReeve owns the feature. The older
`agentic-development-workflow` repository and the `deterministic-subagents`
exploration directory are outside the feature unless later evidence establishes
a specific migration or archival need.

## D2 - Personal-project feature identity

**Question:** Must this feature be associated with a Tree task and issue-numbered
branch?

**Answer:** No. GateReeve is a personal project outside the Quality Process
tracker, and its topic branches need only a brief descriptive name.

**Decision:** The feature has no external task or issue number. Its stable
feature identity is `workflow-state-machine-cli`, derived from the descriptive
topic branch.

## D3 - Isolated project worktree

**Question:** Should the existing exploration directory be renamed, or should
the feature use an isolated peer worktree containing the actual GateReeve
source?

**Answer:** Create the proposed peer worktree.

**Decision:** Develop in `/home/trent/code/tb/gatereeve-state-machine` on branch
`workflow-state-machine-cli`, created from `gatereeve/main`. Keep the canonical
`/home/trent/code/tb/gatereeve` checkout on `main`.

## D4 - CLI authority and permitted actors

**Question:** Is the CLI merely an advisory observer, or is a CLI-validated and
recorded transition required before GateReeve recognizes workflow advancement?

**Answer:** GateReeve must require the CLI transition. This does not prevent an
agent from moving work forward: either an agent or a user may invoke the CLI to
advance the workflow, but one of them must do so through the CLI.

**Decision:** The CLI is the exclusive authority for recognized workflow-state
transitions, but it is not itself the workflow actor or an autonomous engine.
Agents and humans may invoke transitions. Each transition declares which actor
authority is acceptable, so human-only approvals and waivers cannot be
laundered through an agent invocation. Files and external systems may change
out of band and may satisfy inferred guards, but those changes never silently
advance GateReeve state; passage occurs only after the CLI revalidates the
guards and records the transition.

## D5 - PR-boundary gate hierarchy

**Question:** Should PR-boundary components such as verification, judge,
pattern review, code review, and decision triage be top-level peers of
implementation and human review, or nested under the PR-boundary state?

**Answer:** They should be first-class nested gate states inside the composite
`PR_BOUNDARY` state.

**Decision:** Model the active PR boundary as a composite state containing
independently visible gate instances. Multiple child gates may be eligible,
blocked, passed, failed, waived, or stale at the same time. Nesting must not
make them secondary in CLI or graphical presentation. Distinguish actions from
states: for example, invoking a judge is an action, while having current,
passing judge evidence for a specific boundary attempt is a gate state.

## D6 - Fixed slice lifecycle, dynamic slice instances

**Question:** Does making PR slices first-class mean inventing new workflow
states for every feature-specific set of slices?

**Answer:** No. A feature may have dynamically created slice instances, but all
instances are governed by one fixed slice lifecycle.

**Decision:** Define slice lifecycle states centrally, with an initial shape
such as `PROPOSED`, `PLANNED`, `IMPLEMENTING`, `PR_BOUNDARY`, `HUMAN_REVIEW`,
`MERGED`, and `ABANDONED`. A particular slice is an instance carrying identity,
description, scope, plan/rubric mappings, branch, PR, and boundary history. New
work discovered during a feature creates or revises slice instances; it never
extends the state-machine schema with feature-specific state names. The exact
state vocabulary remains subject to later design refinement.

## D7 - Single active delivery slice

**Question:** Should the initial state machine enforce GateReeve's existing
sequential-delivery convention, or permit multiple slices to be active at the
same time?

**Answer:** Enforce a single active slice.

**Decision:** A feature may own any number of `PROPOSED` or `PLANNED` slices,
but at most one slice may occupy an active state such as `IMPLEMENTING`,
`PR_BOUNDARY`, or `HUMAN_REVIEW`. A later slice cannot begin implementation
until the active slice reaches `MERGED` or `ABANDONED`. Concurrent delivery is
not an implicit exception; supporting it later would require an explicit state
model and invariant change.

## D8 - First-class discovered changes

**Question:** Should implementation discoveries that change design, spec, plan,
or slice structure become states in the main lifecycle, or first-class change
records with their own lifecycle and effects?

**Answer:** Represent them as first-class change records.

**Decision:** A discovered change is a child entity with identity, origin,
target artifact, rationale, impact, blocking status, and a fixed lifecycle such
as `PROPOSED`, `APPROVED`, `APPLIED`, `VALIDATED`, `REJECTED`, or `SUPERSEDED`.
The feature and slice retain their lifecycle positions while status and graph
views prominently project unresolved changes. Transition guards block on
applicable unresolved records, and applying a change invalidates dependent
artifacts or evidence. Do not create combinatorial lifecycle states that mix
position, change status, and evidence freshness.

## D9 - Change approval authority

**Question:** Which actors may propose and approve changes to approved design,
specification, plan, slice structure, and operational issue status?

**Answer:** Approve the proposed authority matrix.

**Decision:** Agents and humans may propose any change. Amendments to approved
design or to specification scope, acceptance criteria, or rubric require
explicit human approval. Agents or humans may approve plan changes that remain
within the approved design and specification, slice-structure changes that
remain within the approved plan, and ordinary issue-status changes. The CLI
must reject or escalate an attempted lower-level change when its actual impact
expands scope or contradicts a higher-authority artifact; an agent cannot
launder a design or requirements decision through plan or slice metadata.

## D10 - Tracked canonical event journal

**Question:** Should workflow events live only in local operational state to
avoid dirtying Git, or in a tracked canonical journal within the cumulative
feature record?

**Answer:** Use the tracked canonical journal model.

**Decision:** Store an append-only journal such as
`docs/issues/{featureId}/events.jsonl` in the tracked feature record. Record
meaningful transitions, approvals, waivers, invalidations, and discovered-change
events, but not read-only observations. Derive current state from this journal
plus freshly revalidated repository and external facts; do not create a second
authoritative mutable state projection. The CLI may append events but must never
stage or commit them automatically. Journal updates produced during a pinned PR
boundary are declared evidence and follow boundary synchronization and
finalization rules. Status must make uncommitted journal changes and clean-tree
prerequisites explicit.

## D11 - Multidimensional individual gate state

**Question:** Should an individual gate use one lifecycle-status enum, or
separate recorded outcome, freshness, eligibility, evidence, and blocking
dimensions?

**Answer:** Use the multidimensional model.

**Decision:** A gate instance records an outcome such as `UNSET`, `PASS`,
`FAIL`, `WAIVED`, or `NOT_APPLICABLE`; evidence and its input fingerprint;
and the responsible actor/event. Freshness (`CURRENT`, `STALE`, or `UNKNOWN`),
eligibility, and blocking reasons are derived from current facts and guards.
Execution activity may be observed but is not authoritative workflow state.
The CLI may render a concise composite label, but must preserve facts such as a
previous `PASS` whose evidence is now `STALE` and therefore blocking.

## D12 - Feature and slice lifecycle vocabulary

**Question:** Should the feature-level post-planning state be called
`DELIVERY`, `IMPLEMENTATION`, or `BUILDING`, given GateReeve's established
public terminology?

**Answer:** Use the proposed hierarchical naming: `DELIVERING_SLICES` as the
composite, with `IMPLEMENTING`, `PR_BOUNDARY`, and `HUMAN_REVIEW` as the
visible slice states.

**Decision:** The top-level feature lifecycle initially follows
`INITIALIZED`, `DESIGNING`, `SPECIFYING`, `PLANNING`, `DELIVERING_SLICES`,
`FINALIZING`, and `COMPLETE`, with explicit abandonment available from
nonterminal states. `DELIVERING_SLICES` is an internal composite covering the
feature's sequential PR slices. Its active slice exposes GateReeve's existing
public phase vocabulary: `PLANNED`, `IMPLEMENTING`, `PR_BOUNDARY`,
`HUMAN_REVIEW`, and terminal `MERGED` or `ABANDONED`. Do not introduce
`BUILDING` as a phase name; GateReeve uses build as a verification activity.
CLI and graphical views should emphasize the precise active-slice phase while
also showing the containing multi-slice lifecycle.

## D13 - Defer existing-feature adoption

**Question:** Should v1 include a one-time command that bootstraps authoritative
state for features already underway before the state-machine CLI exists?

**Answer:** No. The vast majority of features begin the GateReeve workflow from
the beginning, so adoption is an infrequent transitional case.

**Decision:** V1 supports newly initialized features and does not adopt or
reconstruct state for in-flight legacy features. Keep the journal and domain
model extensible enough for a future explicit import/baseline event, but do not
let uncertain historical evidence complicate the initial CLI or state machine.

## D14 - Initialization enters design directly

**Question:** Should `INITIALIZED` be a durable lifecycle state between feature
creation and design work?

**Answer:** No. Successful feature initialization should enter `DESIGNING`
directly.

**Decision:** `gatereeve feature init` is an atomic bootstrap operation. It
establishes feature identity, creates the minimal feature record and tracked
journal, creates `interview.md`, records the initial event, and leaves the
feature in `DESIGNING`. If initialization fails, it records no feature state.
Do not add an `INITIALIZED` state that conveys no meaningful period of work or
decision.

## D15 - Semantic public commands

**Question:** Should the public CLI expose a generic command such as
`gatereeve advance`, or explicit domain commands describing the transition and
authority being exercised?

**Answer:** Use explicit domain commands and omit generic advancement.

**Decision:** Public mutating commands use semantic verbs such as feature
initialization, design approval, spec validation, slice start, gate evidence
recording, change approval, and feature finalization. A generic transition
primitive may exist inside the state-machine implementation but is not a public
escape hatch. Read-only `next` output supplies exact eligible commands,
acceptable actor authority, guards, and blocking reasons so agents and humans
can proceed without guessing.

## D16 - Generated model and instance graphs

**Question:** Should graphical state be a separately maintained diagram, or be
generated from the authoritative state-machine definition and current feature
projection?

**Answer:** Generate both the complete model view and a current-feature overlay
from authoritative state.

**Decision:** `gatereeve graph --model` presents the complete feature, slice,
change, gate, and transition topology. `gatereeve graph` overlays the current
feature state, active slice, passage history, eligible and blocked transitions,
stale gates, and open changes. V1 emits Mermaid and structured JSON; richer
HTML/SVG rendering and open-in-browser conveniences may follow without changing
the model. The terminal `status` remains the primary quick view. Graphs are
derived output and never an independent workflow authority.

## D17 - Hooks are guard adapters, not transition actors

**Question:** How should agent lifecycle hooks, optional Git hooks, and CI checks
relate to the authoritative GateReeve CLI?

**Answer:** Hooks may observe, warn, or block deterministic violations, but may
never record workflow advancement.

**Decision:** The CLI owns all state-machine and guard logic. Hooks call CLI
query or check surfaces and do not duplicate rules. Agent lifecycle hooks may
inject current status; optional Git hooks and CI may warn or fail on
high-confidence deterministic violations. Hooks never approve gates, append
passage events, grant waivers, or silently transition state. Bypassing a local
hook cannot bypass GateReeve because later status and transitions revalidate
facts and the journal remains unchanged.

## D18 - Declarative topology with trusted guards

**Question:** Should topology and guard behavior be entirely imperative,
fully configurable as a generic workflow DSL, or divided between a declarative
GateReeve model and trusted executable predicates?

**Answer:** Use the declarative-topology plus trusted-guard-registry
architecture.

**Decision:** A schema-versioned GateReeve model declares states, transitions,
gate definitions, actor authority, guard identifiers, invalidation
dependencies, and display metadata. Executable code implements a closed
registry of trusted guard predicates referenced by stable identifiers. The
model cannot embed arbitrary commands or user code. The same validated model
drives transition enforcement, status, next-action guidance, explanation, and
graph generation. It is GateReeve-specific and must not evolve into a generic
workflow engine or DSL.

## D19 - Per-feature workflow-model pinning

**Question:** Should an active feature automatically inherit state-model changes
when GateReeve is upgraded, or remain governed by a pinned model until an
explicit migration?

**Answer:** Pin the model and require explicit migration.

**Decision:** Feature initialization records the exact workflow-model version
and content hash, and each journal event identifies the model version that
accepted it. Plugin upgrades do not silently alter active-feature transitions,
guards, invalidation rules, or evidence requirements. A human-authorized model
migration must report changed obligations and resulting stale or missing
evidence before it is recorded. Completed records retain sufficient model
identity for later explanation. The design will later choose between embedding
a normalized model snapshot and retaining versioned models in GateReeve.

## D20 - PR-boundary staged partial order

**Question:** Should PR-boundary evaluation enforce one serial review chain, or
a staged partial order that makes independent reviews eligible against the same
pinned diff?

**Answer:** Use the staged partial order.

**Decision:** Entering `PR_BOUNDARY` pins exact PR context, then requires
artifact/scope reconciliation and the verification matrix. Once those
prerequisites are current, scoped spec evaluation, pattern review, independent
judge, and code review become independently eligible; the state machine does
not schedule them or require artificial serialization. After all required
results are current and nonblocking, findings are resolved, decisions are
triaged, the final diff is explained, and the boundary packet is assembled and
validated before transition to `HUMAN_REVIEW`. Independent evaluators should
not inherit each other's conclusions merely because their execution happened
in some order.

## D21 - Explicit remediation and boundary attempts

**Question:** Should a failed gate or out-of-band source mutation automatically
return a slice to implementation, or block in place until an authorized actor
records an explicit remediation transition?

**Answer:** Require explicit remediation transitions.

**Decision:** A failed child gate leaves the slice in `PR_BOUNDARY` with a
blocking outcome. Eligible actions may include rerunning the gate, an allowed
human waiver, or explicitly resuming implementation with linked findings and
rationale. Resuming implementation closes the current boundary attempt as
unresolved or superseded while retaining its evidence. Re-entering the boundary
creates a new attempt and input fingerprint. Source changes made while the
recorded state remains `PR_BOUNDARY` are reported as an illegal or unrecorded
mutation and stale affected evidence; GateReeve never silently repairs the
lifecycle state.

## D22 - Narrow, fingerprint-scoped waivers

**Question:** Should waivers be broad actor overrides, or narrowly scoped
exceptions declared by the workflow model and tied to exact evidence inputs?

**Answer:** Enforce the narrowly scoped waiver policy.

**Decision:** Only gates explicitly declared waivable may be waived. A waiver
requires human authority, rationale, acknowledged risk, supporting context, and
the exact gate instance/input fingerprint. Relevant code, artifact, or model
changes stale the waiver, and it never transfers to another slice or boundary
attempt. `NOT_APPLICABLE` is a separate disposition asserting irrelevance, not
risk acceptance. GateReeve exposes no generic force or administrator bypass,
and gates whose substance is the human decision itself cannot be replaced by a
waiver.

## D23 - Two-step human approval protocol

**Question:** Given that a local full-access CLI cannot cryptographically
distinguish human and agent operators, what v1 mechanism should prevent agents
from casually claiming human-only authority?

**Answer:** Use the proposed two-step request/grant mechanism for now, while
allowing that it may later be relaxed if its friction outweighs its value.

**Decision:** An agent may create a pending approval request but may never grant
it. A human grants the distinct request through a separate semantic CLI command;
only then may either actor invoke the authorized transition. Do not expose an
`--actor human` assertion flag. Journal events distinguish requester, granter,
and transition operator. This is procedural protection and auditability, not a
security boundary against a malicious full-access process. Any later relaxation
is an explicit, versioned workflow-model policy change rather than an informal
bypass.

## D28 - No journal hash chain in v1

**Question:** Does hash-chaining the event journal materially improve result
quality or address a legitimate security need when the only actors are one
human and full-access agents?

**Answer:** No. Omit the hash chain and retain hashes only where they establish
workflow-model identity or evidence freshness.

**Decision:** Journal events use stable IDs, monotonically increasing sequence
numbers, schema validation, atomic append behavior, and correction through new
events. Git supplies durable history and ordinary tamper/corruption recovery.
Do not hash-chain events: it would not prevent valid-but-mistaken agent actions
or deliberate impersonation by a full-access agent, and it would add complexity
and false confidence. Continue hashing pinned model content and relevant gate
inputs because those fingerprints directly detect stale evidence. Reconsider
signing or stronger tamper evidence only if GateReeve later gains genuinely
untrusted or separately credentialed actors.

## D29 - Commander.js for the public CLI

**Question:** Should the public GateReeve CLI use Python to align with existing
workflow helpers and avoid a Node user dependency?

**Answer:** No. Use Commander.js, consistent with the user's other CLI
projects.

**Decision:** Implement the public `gatereeve` command in Node.js with
Commander.js. Cross-project consistency and an established CLI implementation
pattern outweigh alignment with the current Python helper layer. The design
must explicitly address how Commander commands invoke or absorb existing Python
validators, how Node is distributed as a user dependency, and whether the
current private maintainer CLI is extended or separated from the public
workflow surface.

## D30 - One unified GateReeve executable

**Question:** Should GateReeve maintain separate public workflow and private
maintainer Commander packages, or evolve its existing CLI into one namespaced
`gatereeve` executable?

**Answer:** Use one unified executable.

**Decision:** Evolve the existing Commander/`qp-cli-core` CLI into the public
`gatereeve` program. Workflow commands such as status, feature, slice, gate,
change, approval, and graph form the primary surface. Existing composition,
validation, and release operations remain under explicit `plugin` and `release`
maintainer namespaces. Rename the generic binary and old package identity rather
than creating a second CLI with duplicated bootstrap, formatting, and release
infrastructure.

## D31 - Plugin-baked governance, optional CLI installation

**Question:** Should the Commander CLI be the exclusive state authority and a
required user installation, or should the GateReeve plugin contain the same
governance while the CLI remains optional?

**Answer:** State-machine governance must be fully built into the GateReeve
plugin; installation of the user-facing CLI is optional.

**Decision:** The shared GateReeve protocol core is the exclusive authority for
projection, guards, invalidation, authorization, journaling, and transitions.
The installed plugin packages and invokes that core directly for agent-driven
workflow operations. The optional PATH-accessible Commander CLI is a human,
automation, and observability adapter over the identical core. Neither adapter
may duplicate or weaken policy, and absence of the optional CLI does not reduce
plugin enforcement to advisory instructions. Initial rollout may still stage
activation for evaluation, but the target architecture makes governance a
normal plugin capability.

## D32 - Node runtime for the shared protocol core

**Question:** Should GateReeve add Node as a plugin prerequisite so the plugin
and optional Commander CLI can share one JavaScript protocol implementation, or
ship standalone compiled executables?

**Answer:** Add Node as the prerequisite for v1.

**Decision:** GateReeve's supported installation includes a documented Node
runtime version. The plugin distributes the JavaScript protocol core and invokes
it through a plugin-local entry point; the optional Commander CLI imports the
same implementation. Do not maintain parallel Python and JavaScript state
authorities. Existing Python validators may remain subprocess guard providers
until deliberately migrated. Reconsider compiled standalone distribution only
if the Node prerequisite creates demonstrated adoption problems.

## D33 - Skills bracket work with protocol operations

**Question:** How should agent-driven GateReeve skills interact with the shared
protocol core without turning the core into an orchestration engine?

**Answer:** Require all state-affecting skills to use the proposed
preflight/work/submit pattern.

**Decision:** A skill asks the core whether its semantic operation is eligible
and receives authoritative context, guards, blockers, authority requirements,
and artifact locations. The agent then performs the activity autonomously and
submits evidence or requests a transition. The core freshly revalidates and
records or rejects the request. Skills cannot self-declare gate passage; the
core does not choose skills, launch agents, schedule work, or execute the
workflow.

## D38 - Sparse human-confirmation gates and autonomous mandate

**Question:** Does the two-step request/grant and actor-authorization model add
too much friction for long autonomous agent runs relative to the protection it
actually provides?

**Answer:** Yes. Replace it with sparse human-confirmation gates and
feature-scoped autonomous implementation authorization.

**Decision:** This decision supersedes D23's two-step approval ceremony and
refines D24 and D26. GateReeve requires human confirmation only for approval of
the initial design, initial authorization of the approved feature plan,
design/specification amendments, waivers or risk acceptance, human review, and
complete-feature abandonment. One implementation authorization covers the
approved feature plan and its sequential slices. Agents may autonomously plan
within that scope, implement, enter and execute boundaries, run and rerun gates,
remediate findings, adjust in-scope plans/slices, record evidence, and finalize
after merge. The next human interruption occurs only for human review, a
higher-level amendment, or a waiver/risk decision.

Human confirmation may occur in conversation and be recorded by the agent, or
be recorded directly through the optional CLI. The journal may distinguish the
human decision from the recording operator for audit context, but operator
identity is not an authorization barrier. GateReeve trusts cooperative agents
to represent explicit human decisions honestly and makes no security claim
against a malicious full-access process.

## D39 - Grandfather in-flight legacy features

**Question:** How should an upgraded plugin handle features already underway
without a model lock and event journal when v1 has no adoption mechanism?

**Answer:** Use the easiest path: allow old features to finish without
governance and require it for newly initialized features.

**Decision:** Existing feature records lacking state-machine artifacts are
recognized as explicit legacy features and may complete under the previous
skill-driven process. They do not partially enter governance or reconstruct
history. Newly initialized features use protocol governance by default. Do not
build migration machinery until real in-flight upgrade experience demonstrates
a need.

## D40 - V1 success priority

**Question:** Which outcome should be the primary measure of whether v1 earns
its complexity: gate correctness, workflow observability, or longer autonomous
runs?

**Answer:** Prioritize gate correctness, with observability secondary and
autonomy preserved as a constraint.

**Decision:** V1 succeeds primarily when it mechanically rejects missing,
out-of-order, inconsistent, or stale gate passage; prevents a slice from
reaching human review without all current required evidence; invalidates the
correct downstream facts after relevant changes; and appends nothing for an
illegal transition. Secondary success is immediate reconstruction of position,
blockers, and next legal actions by a fresh agent. The design must not add human
interruptions beyond the genuine approval, amendment, risk, review, and
abandonment decisions already identified.

## D34 - Query and assertion exit semantics

**Question:** How should read-only workflow conditions, invariant assertions,
and rejected mutations map to process exit codes?

**Answer:** Use the proposed query-versus-assertion semantics.

**Decision:** Read-only `status`, `next`, `explain`, `history`, and `graph`
commands exit successfully whenever they can produce a valid projection, even
if that projection is blocked, failed, or stale. `check` exits nonzero when its
requested invariant is violated. Mutating commands exit nonzero and append
nothing when guards or authority fail. Every command exposes one stable JSON
result envelope from which human output is rendered. Optional discovery lets
session-start integration ignore directories with no GateReeve feature without
treating absence as an error.

## D35 - Pause as an orthogonal suspension

**Question:** Should pausing and resuming create phase-specific lifecycle
states, or a recorded suspension overlay on the existing position?

**Answer:** Use the suspension overlay.

**Decision:** A feature may be explicitly paused while retaining its current
feature, slice, gate, and change positions. Pause and resume append journal
events and carry rationale; read-only inspection remains available, while
ordinary mutations are blocked. Resume restores eligibility at the exact prior
position. Abandonment and appropriate approval inspection remain possible while
paused. Do not create combinatorial `PAUSED_DURING_*` lifecycle states.

## D36 - Minimal v1 hook surface

**Question:** Should v1 automatically install Git commit/push hooks, or rely on
plugin-core enforcement and the existing agent session hook while exposing
checks for later integrations?

**Answer:** Enhance only session-start integration and defer Git-hook
installation.

**Decision:** V1 adds optional feature discovery and current-status context to
the existing agent `SessionStart` hook and exposes reusable `gatereeve check`
operations for CI or explicit integrations. It does not install pre-commit or
pre-push hooks, alter `core.hooksPath`, or attempt to chain user hooks.
State-affecting skills and the protocol core provide governance. A future
explicit hook installer requires evidence of added value and must respect
existing repository policy.

## D37 - Feature-local workflow-model lock

**Question:** Should a feature pin only a model version/hash and depend on every
future GateReeve installation retaining that model, or persist the normalized
declarative model in its own tracked record?

**Answer:** Persist the feature-local model lock.

**Decision:** `feature init` writes a tracked
`workflow-model.lock.json` containing the exact normalized states, transitions,
gate dependencies, authority and invalidation policy, schema/model identity,
content hash, guard identifiers, and protocol-core compatibility range. The
core evaluates that locked model and must either support it or require explicit
migration. Executable guard code is not copied into the feature record.

## D24 - Human-authorized entry into implementation

**Question:** Should the transition from planning into slice delivery require
only mechanical branch readiness, or also explicit human authorization to begin
implementation?

**Answer:** Require both.

**Decision:** `PLANNING` may transition to `DELIVERING_SLICES` only when
GateReeve revalidates the specification, plan-to-rubric mapping,
issue-to-plan/rubric mapping, tracker and decision-log presence, and at least
one planned slice, and an explicit human implementation approval has been
granted. The mechanical gate proves the work is executable; the human grant
authorizes code-changing activity and starts the first slice in `IMPLEMENTING`.

## D25 - Amendments are nested delivery cycles

**Question:** When delivery reveals a design, specification, or plan amendment,
should the feature return to its original top-level design/specification/planning
state, or remain in delivery while a blocking change cycle runs?

**Answer:** Keep the feature in delivery and use the nested change cycle.

**Decision:** The feature remains in `DELIVERING_SLICES`, and the active slice
retains its lifecycle position but becomes blocked by the applicable change
record. Human approval, application, dependent-artifact invalidation,
reconciliation, and validation occur in the change record's child lifecycle.
The original design and specification phases remain historical truth rather
than being re-entered. Status and graph views must prominently expose the target
and progress of the blocking amendment.

## D26 - Amendment-driven implementation reauthorization

**Question:** When a delivery-time amendment changes approved design or
specification, does the original authorization to implement remain valid?

**Answer:** No. Design and specification amendments require renewed human
implementation authorization; in-scope plan and slice adjustments do not.

**Decision:** Applying an approved design or specification amendment stales the
existing implementation grant. GateReeve must reconcile and revalidate all
affected downstream specification, plan, slice, rubric, and readiness facts,
then obtain a new human grant before code-changing work resumes. A plan-only or
slice-only adjustment proven to remain within the approved design and
specification requires deterministic revalidation but no additional human
authorization. A change record cannot become `VALIDATED` until these dependent
obligations are current.

## D27 - Feature-final boundary and post-merge finalization

**Question:** Should complete-feature evaluation run as a separate completion
boundary after the last PR, or as `FEATURE_FINAL` scope within the last real
slice's PR boundary?

**Answer:** Keep complete-feature evaluation in the final slice boundary and
reserve finalization for post-merge closeout.

**Decision:** The final slice enters `PR_BOUNDARY` with `FEATURE_FINAL` scope.
Verification, spec evaluation, rubric completion, and independent judge cover
the complete feature; pattern review, code review, and explain-diff remain
focused on the final slice. After those gates pass, the slice proceeds through
human review and merge. The feature then leaves `DELIVERING_SLICES` for
`FINALIZING`, which confirms the merge, preserves the completion report,
resolves retention, closes any external task, freezes the cumulative record,
and writes the final checkpoint. Missing implementation discovered during
finalization creates another slice and returns the feature to delivery rather
than creating a completion pseudo-boundary.

## Closing summary

The design direction is solid around a hierarchical, artifact-backed state
machine enforced by a shared GateReeve protocol core. The core governs legal
passage, current evidence, invalidation, and journaling; agent skills and an
optional Commander CLI are adapters over it. The model keeps feature, dynamic
slice, nested gate, discovered-change, freshness, and suspension concerns
separate rather than combining them into one state enum. It preserves long
agent autonomy between a small number of genuine human decisions.

The PR-boundary shape is also settled: exact context, reconciliation, and
verification establish the review surface; spec evaluation, pattern review,
judge, and code review then become independently eligible; triage, final diff
explanation, and packet validation precede human review. Failed or stale work
blocks in place and returns to implementation only through an explicit passage
that creates a later boundary attempt.

The remaining uncertainty is implementation-level rather than conceptual. The
spec and plan must define the exact event schema, command grammar, guard and
invalidation matrix, plugin-local Node packaging, optional CLI distribution,
GitHub merge reconciliation, and compatibility behavior for pinned model locks.
These risks are consciously accepted for design synthesis; none requires
reopening the chosen architecture before the design gate.
