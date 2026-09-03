# Design - tb-workflow-modules

**Status:** approved (gate passed 2026-09-03)

## Problem

GateReeve's top-level feature and slice lifecycle is intentionally opinionated,
but the checks inside its PR boundary are currently baked into the workflow
model and Desktop presentation. Projects cannot select a different set of
checks, add project-specific gates, or make a deliberate one-boundary exception
without changing the product. Post-merge work has the inverse problem: release
status can be observed separately, but it is not a general feature-finalization
gate and the current Release Conductor is necessarily specific to GateReeve.

This makes two useful experiences difficult:

- A project cannot share a reproducible policy for which evaluative checks are
  required while preserving GateReeve's structural boundary safeguards.
- A feature cannot remain visibly incomplete until a project-specific release,
  deployment, publication, or other finalization obligation has been verified.

The new user-controlled terminal adds a potential execution surface, but
injecting project automation into the user's persistent shell or automatically
running code from a checked-out branch would be unsafe and operationally
ambiguous. The module architecture must distinguish declarative policy,
execution authority, live observation, and authoritative workflow evidence.

## Intent

Refactor GateReeve so the fixed lifecycle contains a small number of explicit,
versioned module extension slots. Projects can enable built-in or tracked local
modules, add project-specific manual, skill, command, or observed work, and see
their dependency graph and status in the existing state-detail interface.

The design must:

- Preserve the current feature and slice lifecycle and the structural integrity
  of PR boundaries.
- Make project policy shared and reviewable while keeping executable permission
  local to the user's machine.
- Pin every feature to a fully resolved module graph so upgrades and policy
  edits cannot reinterpret historical evidence.
- Permit explicit, auditable, scope-local waivers without silently weakening
  project defaults.
- Support powerful project commands with informed consent and honest security
  boundaries.
- Make verified post-merge completion part of the same feature workflow when a
  project enables a finalization module.
- Prove the design first with GateReeve's existing PR gates and its own Release
  Conductor, then leave genuinely broader platform concerns for later work.

## Chosen shape

### Fixed lifecycle with two extension slots

GateReeve retains its existing top-level feature rail and state machine:
Designing, Specifying, Planning, Implementing, Finalizing, and Complete. Modules
cannot add, remove, reorder, or replace those states.

Version one recognizes exactly two extension slots:

- `boundary.evaluation` contains checks performed against a pinned PR-boundary
  attempt before human review.
- `feature.finalization` contains post-merge obligations that must resolve before
  the feature can become Complete.

Unknown slots are rejected. Adding a future slot requires GateReeve to define
its timing, blocking semantics, evidence scope, invalidation rules, and UI
placement rather than guessing from a manifest.

### Module definition, policy, and resolution

A module has a stable namespaced ID, version and content digest, label and
description, one supported slot, dependency IDs, required/optional disposition,
locked/configurable status, waiver policy, and optional `run` and `observe`
adapters. Its definition also declares the evidence and input-fingerprint
contract needed to resolve its outcome.

Version one resolves definitions from:

- Built-ins shipped with the installed workflow plugin.
- Declarative project manifests under `.gatereeve/modules/`.

Tracked `.gatereeve/workflow.json` selects exact module versions or digests and
contains shared project enablement policy. GateReeve may stage checkbox changes,
show the resulting policy diff, validate the entire graph, and write this file
atomically after `Apply module changes`; it never commits the edit. Personal
display preferences and executable authorizations remain local.

Every governed feature lock contains the fully resolved module graph, not only
references to current project defaults. GateReeve never substitutes a newer
installed definition silently. An update is presented as a definition diff and
requires explicit adoption. Applying policy or module changes to an active
feature requires a migration-impact preview and confirmation, including any
evidence invalidation.

Resolution rejects duplicate IDs, unknown slots, missing definitions, digest
mismatches, missing dependencies, and cycles. Ordering is a stable topological
order derived from dependencies; version one has no drag-and-drop ordering.
Enabling a module may visibly stage required dependencies. Disabling a module
with configurable dependents offers to stage their removal but never cascades
silently; a locked dependent blocks the change.

### Locked boundary envelope and configurable checks

All current PR-boundary steps become declarative built-in modules so the graph
has one representation. Context pinning, reconciliation, decision triage, and
packet validation remain locked, enabled, and non-waivable because they protect
the integrity of the boundary itself. Verification, spec evaluation, pattern
review, Judge, code review, explain diff, and project additions are configurable
evaluative modules. Judge and code review remain enabled and required in the
default GateReeve policy.

Human-review entry remains a lifecycle transition that becomes available only
after the required current boundary modules have nonblocking outcomes. It is not
a replaceable module.

### Outcomes, live progress, and scoped waivers

The protocol keeps its authoritative gate outcomes (`UNSET`, `PASS`, `FAIL`,
`WAIVED`, and `NOT_APPLICABLE`) and freshness values (`CURRENT`, `STALE`, and
`UNKNOWN`). Provider activity is a separate live layer with normalized
`pending`, `running`, `waiting`, `blocked`, and `unavailable` states plus
provider-specific stages, labels, and details. Only verified terminal evidence
records `PASS` or `FAIL`.

All authoritative results are bound to the exact module version, resolved
inputs, dependencies, and scope fingerprint. Changes make affected evidence or
waivers stale rather than silently carrying them forward. A missing local
implementation is shown as `Implementation unavailable`; it blocks a required
module when that slot is active but does not make the project unreadable or
convert the module to another disposition.

Waiver permission is explicit per module. A waivable boundary module exposes
`Skip for this boundary...`; a waivable finalization module exposes
`Skip for this feature...`. Both require a reason and record `WAIVED` against
the exact current fingerprint. `NOT_APPLICABLE` remains a distinct, reasoned
assertion, and locked structural modules cannot be waived.

### Execution and observation are independent

A module may declare either or both of:

- `run`: how work is initiated or performed.
- `observe`: how live status and evidence are obtained and verified.

Initial run adapters are `skill`, `command`, and `manual`.

A `skill` adapter is dispatch metadata for a compatible external agent harness.
GateReeve may copy its invocation context or open the user terminal, but does
not automatically launch an agent. A project that deliberately wants GateReeve
to launch Codex, Claude, or another harness expresses that invocation as a
normal `command` and accepts the command authorization boundary.

A `manual` adapter presents instructions and obtains structured human evidence
or attestation through an explicit action.

A `command` adapter uses an executable and argument array, not an implicit shell
string. It is never launched when a project opens, a module becomes ready, or a
background poll occurs. The user explicitly invokes it after seeing the exact
command, working directory, and disclosed effects. It runs in a dedicated,
named task terminal session so the persistent project shell remains untouched.
The session streams output, supports declared interaction, cancellation, and a
timeout, and retains a bounded transcript and exact process result for the
attempt. A terminal session selector switches between the user's shell and
module tasks.

Without a provider, command exit `0` records `PASS`; nonzero exit, signal, or
timeout records `FAIL`; explicit user cancellation records the attempt but
leaves the gate `UNSET`. Structured JSON output may enrich evidence but cannot
override a nonzero result. With a provider, successful command exit means only
that initiation succeeded and the provider determines the terminal outcome.

An observation provider is executable adapter code that reads and validates
work performed elsewhere. Third-party providers run out of process through a
versioned JSON-over-stdio contract rather than being loaded into the Desktop
process. Repository manifests may reference only installed, allowlisted
providers and cannot inject provider code. A trusted installed provider may
submit deterministic evidence through the protocol core, which freshly checks
the module identity, dependencies, input fingerprint, and outcome before
appending an event. Providers do not gain authority to initiate the external
workflow merely because they can observe it.

### Local command authorization is informed consent

Enabling a command in tracked policy does not authorize it to run. GateReeve
stores executable permission locally and binds persistent authorization to the
Git common repository, module ID, manifest digest, entrypoint and declared
support-file digests, argument template, and working directory. Linked worktrees
may reuse the same exact grant; a separate clone must be approved independently.
Changed detectable inputs return the module to `Authorization required` and
show their diff. The prompt offers `Run once` and
`Always allow this command version`.

This is an informed-consent mechanism, not a sandbox or proof of complete code
provenance. An authorized process retains the user's filesystem, process,
credential-file, and network access. An unchanged entrypoint may still invoke
changed PATH executables, dependencies, files, or downloaded code. GateReeve
does not silently inject credentials, claim dependency closure, or describe
process isolation as confinement.

### Desktop presentation

Modules do not lengthen the top feature rail and cannot supply custom HTML or
JavaScript UI. Selecting **Implementing** continues to show PR slices and, for
the selected slice, its `boundary.evaluation` attempts-and-dependencies graph.
Selecting **Finalizing** shows a parallel graph for the enabled
`feature.finalization` modules. Both views use a generalized version of the
existing graph and module-card renderer.

Each module node shows its standard identity, authoritative outcome, freshness,
live provider state, concise detail, and next safe action. Selecting it reveals
structured provider stages, evidence, timestamps, attempt history, failures,
links, and any permitted waiver action through shared GateReeve presentation.
An empty finalization slot does not create a meaningless release section.

Project module settings use checkboxes to stage durable enablement changes and
an explicit apply button. Locked modules remain visible but disabled with an
explanation. Missing local implementations remain visible readiness blockers;
GateReeve does not allow its UI to newly enable an unresolved module, although
it can observe policy committed elsewhere and offer known setup guidance.

### GateReeve Release

The first finalization module is user-facing **GateReeve Release**, stable ID
`gatereeve/release`. Its installed observation provider is
`gatereeve/release-conductor`; the GitHub workflow keeps the product-specific
name **Release Conductor**. The word `trust` is reserved for the actual signing,
notarization, and verification stage rather than the whole release capability.

When enabled, GateReeve Release is a required but waivable finalization gate. A
feature remains Finalizing until its provider proves that a conductor release
has reached terminal `COMPLETE` and that the release source contains the
feature's final merge commit. One qualifying release may satisfy every included
feature. Projects without an enabled release module have no release gate, and
other products may implement completely different release or finalization
modules through the generic contract.

### Delivery sequence

The feature is delivered through four sequential slices, each beginning from
updated `main` after the previous slice merges while retaining this cumulative
feature record:

1. Module protocol foundation and behavior-preserving conversion of current PR
   gates to built-in modules.
2. GateReeve settings, migration and waiver controls, readiness display, and
   generalized Implementing/Finalizing module graphs.
3. Provider processes, command authorization, dedicated task terminals,
   attempt history, and structured results.
4. Generic feature-finalization gating, GateReeve Release, its Release Conductor
   provider, and a real dogfood release.

## Alternatives considered

- **Arbitrary top-level workflow graphs:** rejected because the lifecycle is a
  valuable product opinion and arbitrary stages would multiply state, migration,
  gating, and UI semantics.
- **Hardcode release in GateReeve:** rejected because release is only one
  possible finalization obligation and its stages differ by product.
- **Use a separate build-and-deploy feature:** rejected for normal delivery
  because verified release completion belongs to the feature it ships when the
  project enables that obligation.
- **Place every module on the top rail:** rejected because it makes the primary
  lifecycle long and less understandable; state-specific disclosure already has
  a successful precedent in slices and boundary attempts.
- **Keep the current hardcoded boundary beside new project modules:** rejected
  because two representations would drift. Locked and configurable steps should
  share one declarative graph.
- **Manual module ordering:** rejected in favor of explicit dependencies and
  deterministic topological presentation.
- **Automatic module upgrades:** rejected because they could reinterpret
  workflow obligations or stale evidence without review.
- **Forbid project scripts:** rejected because it removes a large part of the
  architecture's practical value.
- **Automatically run project scripts or agents:** rejected because merely
  opening or observing a branch must not confer execution authority.
- **Inject module commands into the user shell:** rejected because process
  ownership, output attribution, cancellation, and exit status would be
  ambiguous.
- **Load provider code into the Desktop process:** rejected in favor of a
  language-neutral child-process contract with crash isolation and a narrow
  structured interface.
- **Remote marketplace in version one:** deferred until the manifest and
  runtime contracts have been proven locally and distribution trust can be
  designed deliberately.

## Constraints

- The plugin-packaged GateReeve protocol core remains authoritative for
  passage. Rejected mutations append no event, and Desktop observation cannot
  manufacture passage outside the protocol contract.
- Project manifests are declarative. Installed provider code and explicitly
  authorized commands are separate trust surfaces.
- GateReeve edits tracked policy atomically but never stages or commits it.
- Version one supports only `boundary.evaluation` and
  `feature.finalization` and retains the current top-level lifecycle.
- Structural PR-boundary modules remain locked and non-waivable.
- Command and agent execution is user-initiated. There is no autonomous module
  scheduler or background command runner.
- There is no security sandbox, enforced capability policy, complete dependency
  digest, or credential isolation in this feature.
- There is no module-specific UI code, remote registry, marketplace install,
  package signing, reputation system, or marketplace vetting in this feature.
- Slice one must preserve current PR-boundary behavior while replacing its
  representation; later slices depend on that stable contract.
- Each delivery branch is a one-way topic branch from current `main`; no
  development branch is merged or rebased outward.

## Open risks

- The manifest, project-policy, feature-lock, provider-stdio, structured-result,
  and authorization-store schemas must remain small enough to version and
  validate independently without duplicating the protocol model.
- Provider automatic passage needs a narrow authority designation and robust
  replay, timeout, crash, malformed-output, stale-input, and duplicate-event
  behavior.
- Command fingerprints detect only declared direct inputs. UI wording and tests
  must prevent users from mistaking reauthorization for sandboxing or provenance
  proof.
- Multi-session PTY ownership, bounded transcript retention, interactive input,
  cancellation, and app restart recovery may expose lifecycle races absent from
  the current one-shell terminal.
- An active feature migration can invalidate substantial evidence. The preview
  must be complete, and interrupted atomic policy/model updates must recover
  without leaving configuration and the pinned graph divergent.
- Release Conductor observation depends on GitHub authentication, retained
  artifact availability, source ancestry checks, and provider-specific status
  mapping. Unavailable or expired evidence must fail closed while remaining
  diagnosable.
- Large project DAGs may make the existing graph presentation unwieldy even
  though the top rail stays compact; the shared renderer will need bounded and
  accessible disclosure behavior.
- Installed provider and skill discovery must work consistently in packaged
  macOS builds and development environments without treating PATH availability
  as proof of compatibility.

## Changes

None.
