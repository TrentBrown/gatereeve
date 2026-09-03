# Decision Scratchpad - tb-workflow-modules

**Feature start:** 2026-09-02

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Separate module identity from boundary outcome keys

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Module schema, resolved feature locks, boundary projection,
CLI gate identifiers, journal replay, migration reporting, and later Desktop
module presentation.

Module definitions use durable namespaced IDs such as
`gatereeve/pin-context`. Boundary modules separately declare a portable
`boundary.gateId` outcome key. The built-ins retain their existing keys such as
`pinContext`, so current CLI inputs and historical journals continue to replay
without reinterpretation; new UI and policy surfaces identify modules by the
namespaced ID. The resolved model binds the two identities together.

**Triggered by:** Replacing the hardcoded boundary inventory with namespaced
modules would otherwise require renaming every existing gate event and user-facing
CLI key during a behavior-preserving slice.

**Alternatives considered:**
- Rename all boundary gate IDs to module IDs now - rejected because it creates
  an avoidable event and CLI compatibility break unrelated to module behavior.
- Use the existing unnamespaced gate IDs as module IDs - rejected because it
  weakens global module identity and conflicts with the approved manifest contract.

## [2] Distinguish hard dependencies from conditional ordering

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Module manifest schema, policy validation, deterministic DAG
resolution, dependency-edit UX, boundary attempt construction, and evidence
freshness ordering.

Modules declare `dependsOn` for hard requirements and may declare `after` for
conditional ordering predecessors. An enabled hard dependency must also be
selected and enabled. An `after` edge participates in the resolved DAG only
when its target is enabled. The built-in Decision Triage module uses `after`
for configurable evaluations, allowing Judge or code review to be disabled
while still requiring Decision Triage to wait for every evaluation that remains
active.

**Triggered by:** The approved design makes Decision Triage locked while Judge
and code review are configurable. Treating every existing sequencing edge as a
hard dependency would make those checkboxes impossible to turn off.

**Alternatives considered:**
- Remove every disabled module and silently rewrite ordinary `dependsOn` edges -
  rejected because the manifest would not reveal which dependencies are truly
  required for a module to function.
- Keep disabled modules as automatic `NOT_APPLICABLE` outcomes - rejected
  because disabled policy and an audited applicability assertion are different
  states.

## [3] Pin the resolved graph on each boundary attempt

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Boundary-start event payloads, journal replay, model
migrations, attempt projection, evidence attribution, and feature-lock storage.

Each new module-backed `BOUNDARY_STARTED` event embeds the resolved module graph
that created the attempt. Projection validates and uses that graph rather than
reinterpreting the attempt through a later feature-model migration. The feature
lock remains the default graph for future attempts. Legacy events without an
embedded graph continue to use their pinned legacy model.

**Triggered by:** A feature-level module policy migration may enable, disable,
or update modules after earlier attempts exist. Replaying all earlier attempts
through only the newest graph would drop gates, invent gates, or misstate module
versions in historical evidence.

**Alternatives considered:**
- Interpret all attempts through the newest feature lock - rejected because it
  silently rewrites historical obligations and can make old gate events invalid.
- Store every prior full workflow model in the current lock - rejected for this
  slice because attempt-local graph pinning is narrower and directly identifies
  the evidence contract that was active for the attempt.

## [4] Treat model migration as an attempt boundary

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Migration previews, boundary readiness, gate eligibility,
remediation, and stale-evidence reporting.

Every boundary attempt records the model hash under which it began. If the
feature migrates to a different model hash, the earlier attempt remains
readable through its pinned graph but cannot receive new gate outcomes or enter
human review. Migration impact explicitly lists every enabled boundary gate as
invalidated because the established gate fingerprint contract includes the
feature model hash. Work continues through a fresh attempt under the new lock.

**Triggered by:** Allowing a partially completed attempt to continue after a
module policy migration would mix evidence fingerprints and obligation graphs
from two models even when only one named module appeared to change.

**Alternatives considered:**
- Invalidate only the visibly changed module - rejected because all existing
  fingerprints include the old model hash.
- Allow new outcomes on the old attempt using the new model hash - rejected
  because one attempt would then contain evidence from two governing models.

## [5] Carry the prior boundary contract through model migration

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Model-migration event payloads, legacy boundary-attempt replay, projection validation, staged Desktop protocol resources, and migration tests

Each newly recorded MODEL_MIGRATED event carries a previousBoundary snapshot for its fromModelHash. Projection uses that snapshot only for older boundary-start events that lack an attempt-local module graph. Module-backed attempts continue to prefer their own embedded graph. This keeps the append-only journal intact while preserving legacy gate inventory, module identity, and evidence attribution across migration.

**Triggered by:** Independent PR review showed that a legacy BOUNDARY_STARTED event has no embedded module graph and would otherwise be reconstructed from the replacement model after migration

**Alternatives considered:**
Store all historical models in the current lock - rejected because the attempt only needs the governing boundary contract and changing lock shape would widen the slice. Rewrite earlier boundary events during migration - rejected because the journal is append-only. Reject migrations after any legacy attempt - rejected because it prevents the approved explicit migration path rather than preserving history.

## [6] Keep Desktop module mutations semantic and main-process bounded

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Desktop state and IPC contracts, project workflow-policy writes, feature-model migration, boundary waivers, preload authority, and renderer controls.

Desktop exposes named operations for previewing and applying a complete module policy and for waiving one eligible module at an exact active scope. The renderer cannot submit arbitrary protocol requests, file paths, model JSON, or event payloads. The main process resolves the selected saved project, rebuilds the candidate graph from installed built-ins and repository manifests, recomputes dependency and migration impact, writes only `.gatereeve/workflow.json` atomically, and sends confirmed waiver/migration passage through the protocol core.

**Triggered by:** P4 intentionally relaxes GateReeve Desktop's predominantly read-only model, creating an API-contract and security-boundary change.

**Alternatives considered:**
- Expose the protocol adapter directly to the renderer - rejected because it would turn a narrow product control into a general event-journal mutation capability.
- Let the renderer write `.gatereeve/workflow.json` - rejected because renderer compromise must not grant arbitrary project-file writes.
- Offer copyable shell commands only - rejected because the approved design explicitly requires in-app checkboxes, preview, apply, and waiver controls.

## [7] Activate feature-scoped waiver controls with finalization attempts

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Slice sequencing for P4/P8, Desktop finalization controls, and generic finalization protocol operations.

Slice 2 implements boundary-scoped waivers but does not fabricate a feature-scoped waiver against a module definition alone. The feature waiver UI and mutation activate in P8, when the protocol first creates a finalization attempt with the exact merge input, resolved module identity, dependency evidence, and scope fingerprint to which `WAIVED` can safely bind. This changes delivery ordering only; the approved feature behavior remains required.

**Triggered by:** P4 named both waiver scopes, while the approved P8 contract owns creation and fingerprinting of generic feature-finalization attempts.

**Alternatives considered:**
- Record a feature waiver before an attempt exists - rejected because it would lack the approved exact scope fingerprint and could carry across changed merge input.
- Add a temporary release-specific waiver record - rejected because it would put product-specific state into the generic protocol and require migration in P8.
- Disable a finalization module as a substitute for waiving it - rejected because durable project policy and one-feature risk acceptance are intentionally distinct controls.

## [8] Bundle the minimal trusted waiver-guard runtime

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Desktop package contents, executable discovery, trusted Python guard dispatch, and boundary-waiver freshness validation.

GateReeve Desktop stages the canonical `pr_context.py`, `workflow_context.py`, and `workflow_common.py` scripts needed to verify that a waiver's pinned pull-request source is still current. It discovers a compatible Python 3.10+ executable plus Git and the GitHub CLI through the same Finder-compatible paths used by Setup, passes their absolute paths into the main-process adapter and Python guard, and binds a new waiver fingerprint to the verified context plus exact module identity. Existing recorded dependency fingerprints are reused only after that fresh context check because Desktop must not invent replacement inputs for evidence produced by another harness.

**Triggered by:** The first PR-boundary audit found that the initially injected unit test passed while the packaged default guard path lacked its Python script, and that the formal `boundary_gate.py` adapter does not accept every structural or project module ID.

**Alternatives considered:**
- Stage the complete workflow script directory - rejected because Desktop needs only the three-file trusted context-check closure.
- Reimplement pull-request freshness in renderer or ad hoc main-process JavaScript - rejected because the existing canonical guard already owns the check and the renderer must not gain process authority.
- Recompute every dependency using the formal gate adapter - rejected because structural and project gate IDs are outside that adapter and because doing so would invent input shapes different from the recorded evidence.

## [9] Keep packaged Python verification fail-closed with an exact allowlist

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** macOS package contents, package CI, and the trusted Desktop waiver-guard runtime

Replace the blanket Python-file rejection with an exact, shared allowlist for pr_context.py, workflow_context.py, and workflow_common.py. Require all three paths in the ASAR contract while continuing to reject every other Python file. This aligns the package verifier with the already-promoted minimal-runtime decision without weakening its fail-closed posture.

**Triggered by:** Post-boundary packaged-runtime CI correctly rejected the newly staged Python guards because its blanket no-Python invariant predated the approved three-script runtime closure.

**Alternatives considered:**
- Remove the Python guards - rejected because the packaged waiver path needs the canonical freshness guard.
- Permit any Python file under `resources/scripts` - rejected because a directory-wide exemption could hide accidental or hostile runtime expansion.
- Skip packaged-runtime verification - rejected because the failure exposed a real contract mismatch.

## [10] Separate persistent shells from explicitly authorized module tasks

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Desktop IPC and preload contracts, terminal ownership and
lifecycle, device-local command grants, renderer consent and session controls,
and boundary evidence recording.

Command modules execute directly from the pinned manifest in dedicated named
PTY sessions; they never enter or replace the persistent user shell. The
renderer can name only a pinned module plus its exact active attempt/gate and a
`once` or `always` consent choice. The main process resolves executable,
arguments, repository-relative working directory, timeout, and effects. Durable
consent is stored outside the repository and keyed by Git common-directory
identity plus the module manifest and observed declared inputs. Completed task
transcripts and exact results are bounded and retained under the governed
feature's `runtime/module-attempts/` evidence directory before fresh core
validation records a terminal outcome.

**Triggered by:** P7 relaxes Desktop's process boundary and requires multiple
interactive terminals, exact reusable consent, changed-input invalidation, and
attributable evidence without weakening the existing user-controlled shell.

**Alternatives considered:**
- Write command text into the persistent shell - rejected because GateReeve
  could not reliably attribute, cancel, time-limit, or classify that process and
  would interfere with the user's session.
- Let the renderer submit executable paths and arguments - rejected because a
  compromised renderer would gain general spawn authority.
- Keep transcripts only in memory - rejected because a gate event must refer to
  durable exact evidence and cancellation/failure attempts must remain
  diagnosable.

## [11] Treat installed providers as one-shot fail-closed observation peers

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Provider installation and allowlisting, module readiness,
JSON-over-stdio schemas, process supervision, normalized live status, command
completion mapping, and automatic gate outcome authority.

Provider code is never imported into Desktop and cannot be supplied by a
repository manifest. GateReeve discovers regular installed manifests, admits
only the exact ID/version/manifest-digest entries in its application allowlist,
and spawns the selected executable without a shell. One bounded versioned JSON
request must produce exactly one bounded JSON response tied to the request,
provider, module, and input fingerprint. Missing, mismatched, stale, malformed,
duplicate, crashed, timed-out, and excessive-output cases remain unavailable or
unset rather than manufacturing passage. Normalized provider progress remains
observation; terminal `PASS` or `FAIL` is appended only after the protocol core
freshly revalidates the boundary context, module identity, dependency
fingerprints, and retained evidence.

**Triggered by:** P6 introduces third-party executable observation code and a
new path from terminal results to authoritative workflow events.

**Alternatives considered:**
- Load provider JavaScript into Electron's main process - rejected because a
  provider failure or compromise would inherit and corrupt GateReeve runtime
  state directly.
- Accept provider paths from project manifests - rejected because checking out
  a repository must not install executable observer authority.
- Let a successful provider response append its own event - rejected because
  only the protocol core owns freshness, eligibility, fingerprint, and
  append-only journal validation.

## [12] Bind finalization passage to a historical model and exact merge

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** Finalization event schemas, replay, model migration, feature
completion guards, attempt lookup, pause behavior, CLI operations, and Desktop
finalization controls.

Finalization is a generic attempt DAG pinned to the feature-final integration
commit, the then-active model hash, and a complete resolved module graph. Replay
validates the attempt graph against either the current lock or the exact
historical snapshot retained by model migration. Attempt IDs are unique across
boundary and finalization attempts. Required evidence, human-only waivers,
dependency event IDs, pauses, blocking changes, migration staleness, and
invalidation are revalidated during replay before Complete can pass. A model
with no enabled finalization modules completes without a synthetic attempt.

**Triggered by:** P8 adds an API and journal-schema surface whose evidence must
remain deterministic across migration while preventing forged or stale
post-merge passage.

**Alternatives considered:**
- Reconstruct old attempts from the current model - rejected because migration
  would reinterpret historical obligations and can make a valid journal
  unreadable.
- Treat live provider status as completion evidence - rejected because it is
  mutable observation rather than an append-only, fingerprint-bound outcome.
- Require an empty attempt when the slot is disabled - rejected because it adds
  misleading release ceremony to projects with no post-merge obligations.

## [13] Package the GateReeve release observer as a self-contained exact peer

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** Release Conductor validation reuse, provider manifests and
allowlisting, Desktop staging, ASAR unpacking, Electron child processes, release
status presentation, and macOS package verification.

The product-specific `gatereeve/release-conductor` provider stays outside the
generic protocol core but reuses the canonical Release Conductor chain
validators. Development source imports those shared validators; packaging
bundles the complete provider into one self-contained ESM entrypoint, rewrites
its staged executable and manifest digests, and launches it through GateReeve's
trusted Electron executable with `ELECTRON_RUN_AS_NODE=1`. Discovery verifies
the entrypoint bytes against the exact allowlisted manifest. Valid conductor
failures and timestamps remain visible, while only a terminal failure-free
COMPLETE chain whose source contains the feature merge returns PASS.

**Triggered by:** P9 introduces product-specific GitHub observation code, and
packaged-runtime review showed that an unpacked entrypoint cannot resolve
relative imports left inside `app.asar` and that a metadata-only digest would
not bind executed code.

**Alternatives considered:**
- Put Release Conductor semantics in the protocol core - rejected because other
  projects have different or absent build/deployment workflows.
- Unpack the shared protocol and release trees beside the provider - rejected
  because the executable digest would not bind the imported support-code
  closure and the package surface would expand.
- Require a system Node executable - rejected because the signed Desktop
  already ships a compatible runtime and Finder-launched applications cannot
  rely on shell PATH state.

## [14] Validate candidate journals before atomic append

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** All protocol mutation entry points, append-only journal
integrity, and recovery from malformed semantic payloads.

Every ordinary protocol mutation now projects the complete candidate journal in
memory before `appendEvent` atomically replaces `events.jsonl`. Structural
`appendEvent` remains available as the low-level journal primitive, but
transitions, gates, finalization modules, and change events use
`appendProjectedEvent` so a replay-invalid event cannot poison the durable
feature record.

**Triggered by:** The installed RC.11 boundary adapter appended a structurally valid BOUNDARY_STARTED event lacking its required scope, then discovered the semantic failure only while rereading the record.

**Alternatives considered:**
- Repair invalid journals after append - rejected because an append-only
  authority should reject invalid state before persistence rather than depend
  on recovery surgery.
- Add a one-off boundary scope check - rejected because the same
  append-then-project pattern existed across multiple mutation families.
- Move all projection validation into `appendEvent` without a record argument -
  rejected because the low-level primitive does not own the model lock and
  historical model context needed for semantic replay.
