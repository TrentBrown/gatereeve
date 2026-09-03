# Interview - tb-workflow-modules

**Feature start:** 2026-09-02
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

## D1 - Preserve the opinionated top-level lifecycle

**Question:** Should workflow modules be allowed to replace or freely reshape
GateReeve's top-level feature lifecycle?

**Answer:** Leave the top-level flow opinionated and unchanged for now. Add
flexibility within the existing process instead.

**Decision:** The first module architecture will use defined extension slots
inside the current feature and slice lifecycle. Arbitrary top-level lifecycle
graphs are out of scope.

## D2 - Deliver the refactor incrementally under one feature

**Question:** Should the module architecture be attempted as one replacement
or broken into independently reviewable steps?

**Answer:** Treat it as a major refactoring that is broken down into proper
steps, following the proposed staged plan.

**Decision:** `tb-workflow-modules` is one governed feature with cumulative
design and specification records and multiple sequential delivery slices. The
first slices establish declarative contracts and preserve behavior before
project customization and external operations providers are added.

## D3 - Separate durable module policy from boundary-local waivers

**Question:** When a change is small enough not to justify every default PR
boundary check, should the user disable the module for the project or make a
scoped exception?

**Answer:** Keep Judge and code review enabled and required by default, but let
the user explicitly skip either check for one boundary when its cost is not
proportionate to the change.

**Decision:** Project module enablement and boundary-local disposition are
separate operations. A boundary-local skip records an audited `WAIVED` outcome
with a reason against the exact current boundary fingerprint; it does not
change project defaults and becomes stale if that boundary changes.
`NOT_APPLICABLE` remains a distinct assertion that a module does not apply.
Structural integrity gates remain non-waivable.

## D4 - Use controls that distinguish configuration from commands

**Question:** Should project module enablement and a one-boundary waiver use
the same UI control and mutation timing?

**Answer:** No. Project enablement should use checkboxes, while skipping Judge
or another waivable check for the current boundary should use a push button.
Checkbox edits should not take effect until the user explicitly applies them.

**Decision:** The module-settings interface uses labeled checkboxes to stage
durable policy edits plus an `Apply module changes` button. Applying validates
the complete configuration and, for an active feature, previews model migration
and evidence invalidation before an atomic write. A boundary module exposes a
`Skip for this boundary...` button that opens a reason-and-confirmation dialog
and records the scoped waiver immediately after confirmation.

## D5 - Store gating module policy in tracked project configuration

**Question:** Should module enablement be local application state or shared,
versioned project policy?

**Answer:** Gating module defaults should live in a tracked project file that
GateReeve may edit, but GateReeve must not automatically commit the edit.

**Decision:** Use a separate tracked `.gatereeve/workflow.json` policy file
rather than overloading the local workspace-identity configuration. GateReeve
shows and validates the pending diff, writes it atomically after confirmation,
and leaves the resulting Git change for ordinary user or agent review and
commit. Personal presentation preferences and non-gating informational
settings may remain application-local.

## D6 - Resolve modules locally before considering remote distribution

**Question:** Which module sources should the first version discover and make
available for enablement?

**Answer:** Support built-in modules and tracked repository-local declarative
modules, but defer remote installation and an online registry.

**Decision:** Version one resolves modules shipped with the installed workflow
plugin plus validated manifests under `.gatereeve/modules/`. GateReeve performs
no automatic network discovery, package installation, or arbitrary JavaScript
loading. A repository-local module proves the contract is genuinely extensible
without creating a second distribution ecosystem before the manifest and trust
model are stable.

## D7 - Keep module execution outside GateReeve in version one

**Question:** Does enabling a module authorize GateReeve to launch its
implementation?

**Answer:** No. Version one should keep execution external except for trusted
read-only observation and narrowly defined configuration and waiver mutations.

**Decision:** Boundary modules are executed by the agentic harness and its
installed skills. GateReeve may poll built-in read-only providers, edit the
tracked module policy after confirmation, record explicit protocol waivers,
and expose safe deep links or copy/open-terminal actions. Repository manifests
cannot inject executable code into GateReeve, and enablement conveys neither
credentials nor mutation authority.

## D8 - Represent the whole boundary uniformly but lock its envelope

**Question:** Which existing PR-boundary steps become configurable modules,
and which remain non-replaceable integrity machinery?

**Answer:** Represent every boundary step declaratively, while keeping context
pinning, reconciliation, decision triage, and packet validation locked and
non-disableable.

**Decision:** The generic module graph includes both structural and evaluative
modules. Locked built-ins protect the boundary envelope and appear disabled in
project settings with an explanation. Verification, spec evaluation, pattern
review, Judge, code review, explain diff, and project additions are configurable
evaluative modules. The human-review transition remains a lifecycle operation
after all required module outcomes resolve.

## D9 - Derive ordering from explicit dependencies without hidden cascades

**Question:** Should users manually order modules, and what happens when a
module with enabled dependents is disabled?

**Answer:** Derive ordering from module dependencies, provide no arbitrary
manual reordering in version one, and never silently cascade a disable action.

**Decision:** Manifests declare the dependency DAG and GateReeve uses a stable
topological presentation. Enabling a module may visibly stage its required
dependencies. Disabling a dependency identifies affected configurable modules
and offers to stage them too, while a locked dependent blocks the change. The
complete graph must reject missing dependencies and cycles before it can be
applied.

## D10 - Pin module upgrades and require explicit adoption

**Question:** May a GateReeve or workflow-plugin upgrade silently replace the
module definitions selected by a project?

**Answer:** No. Module versions and content digests must be pinned, and updates
must be explicitly reviewed and applied.

**Decision:** Project policy identifies exact module versions or digests, and
each feature lock stores the fully resolved module graph. GateReeve may surface
an available update and its definition diff, but new and active features remain
on their current project pins until the user applies the update. Active-feature
adoption requires migration-impact preview and confirmation; a missing pin or
changed repository-local module is unresolved drift rather than permission to
substitute new behavior.

## D11 - Require an enabled release module during feature finalization

**Question:** Should verified release completion be part of the same feature
workflow, or should build and deployment live in a separate project or purely
observational status surface?

**Answer:** Keep release completion in the feature workflow when the project
has enabled a release module. Do not require a separate project merely to build
and deploy. The current Release Conductor may remain GateReeve-specific while
other products provide differently shaped release implementations through the
same general module contract.

**Decision:** An enabled release module is a required feature-finalization gate.
The feature remains in `FINALIZING` until the module's provider reports terminal
success for a release whose source contains the feature's final merge commit.
One qualifying release may satisfy multiple features included in that source.
Projects without an enabled release module have no release gate. The generic
contract describes provider-defined stages, status, evidence, actions, source
binding, and terminal completion; it does not impose GateReeve's particular
build, signing, notarization, publication, Cask, or smoke-test sequence on other
products.

## D12 - Name the release capability separately from its provider and stages

**Question:** Should the accidental word `trust` remain in the name of the
overall GateReeve release module?

**Answer:** No. Use a simpler name for the complete release capability and
reserve `trust` for the actual signing, notarization, and verification stage.

**Decision:** The user-facing module is **GateReeve Release**, with stable
module ID `gatereeve/release`. Its current evidence-provider ID is
`gatereeve/release-conductor`, and the existing GitHub workflow remains named
**Release Conductor**. This keeps the product capability independent of its
current implementation and permits other products to use their own release
module and provider names without inheriting GateReeve-specific terminology.

## D13 - Attach release to a generic feature-finalization slot

**Question:** Should GateReeve encode release-specific lifecycle state, or
should release be an ordinary module attached to a generic extension slot?

**Answer:** Treat release as an ordinary module attached to a generic
`feature.finalization` slot, with no release-specific state in GateReeve's
core.

**Decision:** GateReeve's core understands the `feature.finalization` extension
slot and its generic gating semantics, not releases. A module attached there
may bind evidence to the feature's final merge commit, expose provider-defined
stages and safe actions, report status, and declare terminal success.
`gatereeve/release` is the first such module; other projects may attach a
deployment, package-publication, compliance, or other finalization module, or
leave the slot empty. The opinionated top-level lifecycle remains unchanged.

## D14 - Limit version one to two explicit extension slots

**Question:** Should version one accept arbitrary module attachment points, or
support only extension slots whose lifecycle and UI semantics GateReeve
explicitly understands?

**Answer:** Support only the two proposed extension slots in version one.

**Decision:** Version one recognizes `boundary.evaluation` for checks performed
before human PR review and `feature.finalization` for post-merge completion
gates. Unknown slot names are rejected rather than rendered or executed with
guessed semantics. The manifest schema may accommodate future slot additions,
but each new slot requires an explicit definition of timing, blocking behavior,
evidence binding, and UI placement.

## D15 - Let trusted providers record deterministic outcomes

**Question:** May a trusted installed provider make its verified observation
authoritative, or must an agent separately record an outcome that GateReeve can
already prove?

**Answer:** Trusted installed providers may record verified module outcomes
automatically, while repository-local manifests remain strictly declarative.

**Decision:** A trusted provider shipped through the installed GateReeve or
workflow-plugin distribution may poll read-only evidence, validate it against
the module contract and current input fingerprint, and submit the resulting
outcome through the protocol core. This does not authorize GateReeve to execute
the external workflow. Repository-local manifests cannot provide executable
provider code; they may reference only allowlisted installed providers. This
narrowly expands D7 so deterministic observation can advance the workflow
without a redundant agent action while preserving journal validation and
fail-closed behavior.

## D16 - Separate authoritative outcomes from live provider progress

**Question:** Should provider execution states become additional protocol gate
outcomes, or remain a separate live-status layer?

**Answer:** Keep authoritative gate outcomes separate from live provider
progress.

**Decision:** Preserve the protocol's authoritative outcome vocabulary
(`UNSET`, `PASS`, `FAIL`, `WAIVED`, and `NOT_APPLICABLE`) and freshness
vocabulary (`CURRENT`, `STALE`, and `UNKNOWN`). A provider may additionally map
its current condition to `pending`, `running`, `waiting`, `blocked`, or
`unavailable`, while retaining provider-specific stages, labels, and details.
Only a verified terminal result records an authoritative `PASS` or `FAIL`.
For example, Release Conductor's `WAITING_FOR_DIRECT_INSTALL` is live `waiting`
with an action prompt while its gate outcome remains `UNSET`.

## D17 - Preserve the feature rail and disclose modules beneath selected states

**Question:** Should enabled modules become additional items on the top feature
state rail, or appear in state-specific detail below the fixed rail?

**Answer:** Keep the top rail compact. Follow the existing slice disclosure
pattern: selecting a feature state reveals the relevant cards and module graph
below it.

**Decision:** The six-item feature rail remains unchanged. Selecting
**Implementing** shows PR slices and, for the selected slice, its existing
`boundary.evaluation` attempts-and-dependencies graph. Selecting **Finalizing**
shows a parallel graph for enabled `feature.finalization` modules such as
GateReeve Release. The implementation should generalize and reuse the existing
graph/card renderer rather than literally moving the boundary card or adding
module nodes to the top rail. Provider detail is disclosed from its module node
within this shared presentation.

## D18 - Separate module execution from observation and allow commands

**Question:** Should a provider remain one of a small set of module execution
types, and should repository modules be prevented from invoking project
scripts?

**Answer:** No. Providers should be understood as observers, independently of
how work is initiated, and the design should permit explicitly authorized
project scripts because excluding them would sacrifice too much extensibility.

**Decision:** A module may independently declare an optional `run` adapter and
an optional `observe` provider. Run adapters initially include `skill`,
`command`, and `manual`; providers obtain and validate progress or evidence and
normalize it for GateReeve. Providers should use a versioned JSON-over-stdio
process contract rather than load third-party code into the Desktop process.
Command execution is user-initiated, visible in GateReeve's terminal,
cancellable, time-bounded, and expressed as an executable plus argument array
rather than an implicit shell string. Authorization is pinned to the manifest
and executable-content digest and is invalidated by changes. GateReeve records
exit status and optional structured output but does not silently inject
credentials or imply that process separation is a security sandbox.

## D19 - Keep executable authorization local and exact-version scoped

**Question:** What should persistent authorization for a project command trust,
and should that authorization travel in tracked project configuration?

**Answer:** Use repository-local, exact-version authorization rather than a
portable or open-ended trust grant.

**Decision:** Tracked policy may enable a command module, but permission to run
it is device-local GateReeve state. Persistent authorization is bound to the
Git common repository, module ID, complete manifest digest, executable or
script-content digest, declared argument template, and working directory.
Linked worktrees of that repository may share an exact authorization; a
separate clone requires a new one. Any relevant change returns the module to
`Authorization required` and presents the diff. The execution prompt offers
`Run once` and `Trust this exact version`; returning to an already authorized
exact version may reuse its prior grant.

## D20 - Run command modules in dedicated task terminal sessions

**Question:** Should a command module inject its invocation into the project's
existing interactive shell or receive a separate execution session?

**Answer:** Use a dedicated task terminal session rather than taking over the
user's shell.

**Decision:** Each command-module attempt runs in a dedicated PTY/session named
for the module and attempt. GateReeve opens the bottom terminal panel, selects
that session, streams output, permits interaction when declared, and provides
unambiguous cancellation, timeout, and exit status. A small session selector
returns to the persistent user shell, which remains untouched. GateReeve keeps
a bounded attempt transcript as evidence. This extends the terminal only as
needed for task sessions rather than injecting automation as keystrokes into
an arbitrary interactive process.

## D21 - Give commands a default result mapping without requiring providers

**Question:** When is a completed command sufficient to resolve its module,
and when must a separate provider determine the outcome?

**Answer:** Use the conventional command result as the default, while leaving
provider-backed asynchronous work under provider authority.

**Decision:** A command module without an observation provider maps exit `0` to
`PASS` and a nonzero exit, signal, or timeout to `FAIL`. Optional structured
JSON may add summaries, evidence paths, metrics, or links but cannot convert a
nonzero exit into `PASS`. Explicit user cancellation records a cancelled
execution attempt and leaves the gate `UNSET`. When an observation provider is
present, command exit `0` means only that initiation succeeded; the provider
determines the eventual authoritative outcome. Each result remains bound to
the module version, command digest, input fingerprint, and exact attempt.

## D22 - Generalize scoped waivers to finalization modules

**Question:** If an enabled finalization module normally gates completion,
must every feature satisfy it, or may a user explicitly waive it for one
feature without changing project policy?

**Answer:** Apply the same explicitly declared, fingerprint-bound waiver model
to finalization modules.

**Decision:** A waivable `boundary.evaluation` module offers
`Skip for this boundary...`; a waivable `feature.finalization` module offers
`Skip for this feature...`. Both require a reason and record an audited
`WAIVED` outcome bound to the exact scope fingerprint, becoming stale when its
inputs change. Deterministic inapplicability remains `NOT_APPLICABLE`, and
locked structural modules remain non-waivable. Each configurable module
declares whether waivers are permitted; GateReeve Release permits them by
default so a specific feature may intentionally ship without a release while
the project-wide release policy remains enabled.

## D23 - Treat missing implementations as local readiness blockers

**Question:** Should a tracked reference to an executor or provider that is not
installed locally invalidate the project, or remain valid policy with an
explicit readiness failure?

**Answer:** Treat the missing implementation as a visible local-readiness
blocker rather than invalidating the project.

**Decision:** GateReeve continues to open and render the project from its
tracked manifests or feature-pinned resolved graph. A missing executor or
provider appears as `Implementation unavailable`; when its required slot is
active it blocks passage. GateReeve never silently disables, waives, or marks
the module not applicable. Known installation or location guidance may be
offered. The settings UI will not newly enable a module it cannot fully resolve
and validate, but policy committed elsewhere remains observable. Installing
the exact required implementation clears local readiness without altering
tracked policy or migrating the feature model.

## D24 - Keep skill dispatch external unless an agent command is authorized

**Question:** Should a `skill` run adapter authorize GateReeve to launch an
agent automatically?

**Answer:** No. Skills remain external-dispatch metadata; an agent launch from
GateReeve must be an explicitly authorized command.

**Decision:** A `skill` adapter identifies an installed skill and supplies
structured invocation context to a compatible external harness. GateReeve may
offer `Copy invocation` and `Open terminal` and then observe protocol evidence,
but it does not start an agent because a module becomes ready or a project is
opened. Existing agentic workflows may invoke the skill themselves. A project
that wants GateReeve to launch Codex, Claude, or another harness expresses that
invocation as a `command` executor, receiving the same local authorization,
digest checks, and dedicated task-terminal isolation as other commands.

## D25 - Treat command authorization as informed consent, not verified safety

**Question:** Does manifest and entrypoint digest pinning make an authorized
project command fully trustworthy?

**Answer:** No. Ship executable modules on an explicitly disclosed
informed-consent basis in version one rather than claiming containment or full
provenance.

**Decision:** GateReeve fingerprints the manifest, entrypoint, and declared
support files and re-prompts when those detectable inputs change. It also
states that the command retains the user's filesystem, process,
credential-file, and network access. Capability declarations are informative
until genuinely enforced sandboxing exists, because an unchanged entrypoint
may invoke changed PATH tools, dependencies, other files, or downloaded code.
The persistent action is labeled `Always allow this command version`, not
`Trust this exact version`. Dependency closure, confinement, signing, and
marketplace vetting are deferred explicitly rather than implied by process
isolation or digest checks.

## D26 - Deliver the refactor in four dependency-ordered slices

**Question:** How should the major refactor be divided so each delivery boundary
is independently reviewable and the riskiest integration is built on stable
contracts?

**Answer:** Use the proposed four sequential delivery slices in the stated
order.

**Decision:** Deliver: (1) the module protocol foundation, including manifests,
resolution, policy, pinning, dependency validation, and behavior-preserving
conversion of current PR checks into built-ins; (2) the GateReeve module UI,
including settings, migration preview, waivers, readiness, and generalized
Implementing/Finalizing graphs; (3) the execution/provider runtime, including
stdio providers, command authorization, task terminals, attempt history, and
structured results; then (4) the generic finalization gate plus GateReeve
Release and its Release Conductor provider, dogfooded through a real release.
Each later slice begins from updated `main` after its predecessor merges, while
the cumulative feature record retains the stable feature identity.

## D27 - Defer adjacent platform capabilities from version one

**Question:** Should the first module architecture also deliver distribution,
sandboxing, arbitrary UI extension, general lifecycle editing, and autonomous
orchestration?

**Answer:** No. Document those adjacent capabilities as deliberate future work.

**Decision:** Version one excludes remote registries and marketplace install,
signing, reputation, and vetting; enforced filesystem or network sandboxing;
module-supplied HTML, JavaScript UI, and custom screens; extension slots beyond
`boundary.evaluation` and `feature.finalization`; automatic agent launching,
autonomous module scheduling, and background command execution; and
customization of GateReeve's top-level lifecycle. Built-ins, tracked local
manifests, installed skills and providers, explicitly authorized commands,
manual steps, settings, waivers, and the two status graphs remain in scope.

## Closing summary

The design now has a stable center: GateReeve retains its opinionated feature
and slice lifecycle while resolving a versioned module DAG inside two explicit
extension slots. Tracked policy and feature locks make the graph reproducible;
scoped waivers preserve deliberate user control; built-in and repository-local
definitions support project variation; and execution, observation, and
authoritative outcomes remain distinct contracts.

The highest-risk area is executable project commands. Version one accepts that
power on an informed-consent basis with explicit user initiation, local
exact-version authorization, dedicated task terminals, and honest disclosure
that no sandbox or complete dependency proof exists. The other significant
integration risk is allowing trusted providers to record deterministic outcomes
without letting repository manifests inject provider code.

The remaining unknowns are implementation-level rather than product-direction
questions: exact manifest and stdio schemas, local authorization storage,
provider process supervision, bounded transcript format, and model-migration
mechanics. These belong in the specification and plan. Marketplace governance,
sandboxing, custom UI, extra slots, and autonomous orchestration are consciously
deferred.
