# Decisions - tb-workflow-modules

**Feature start:** 2026-09-02

Permanent record of decisions promoted from `scratchpad.md`.

---

## Separate module identity from boundary outcome keys

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

**Promoted:** 2026-09-03. PR: #61.

---

## Distinguish hard dependencies from conditional ordering

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

**Promoted:** 2026-09-03. PR: #61.

---

## Pin the resolved graph on each boundary attempt

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

**Promoted:** 2026-09-03. PR: #61.

---

## Treat model migration as an attempt boundary

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

**Promoted:** 2026-09-03. PR: #61.

---

## Carry the prior boundary contract through model migration

**Confidence:** HIGH

**Blast Radius:** Model-migration event payloads, legacy boundary-attempt replay, projection validation, staged Desktop protocol resources, and migration tests

Each newly recorded MODEL_MIGRATED event carries a previousBoundary snapshot for its fromModelHash. Projection uses that snapshot only for older boundary-start events that lack an attempt-local module graph. Module-backed attempts continue to prefer their own embedded graph. This keeps the append-only journal intact while preserving legacy gate inventory, module identity, and evidence attribution across migration.

**Triggered by:** Independent PR review showed that a legacy BOUNDARY_STARTED event has no embedded module graph and would otherwise be reconstructed from the replacement model after migration

**Alternatives considered:**
Store all historical models in the current lock - rejected because the attempt only needs the governing boundary contract and changing lock shape would widen the slice. Rewrite earlier boundary events during migration - rejected because the journal is append-only. Reject migrations after any legacy attempt - rejected because it prevents the approved explicit migration path rather than preserving history.

**Promoted:** 2026-09-03. PR: #61.

---

## Keep Desktop module mutations semantic and main-process bounded

**Confidence:** HIGH

**Blast Radius:** Desktop state and IPC contracts, project workflow-policy writes, feature-model migration, boundary waivers, preload authority, and renderer controls.

Desktop exposes named operations for previewing and applying a complete module policy and for waiving one eligible module at an exact active scope. The renderer cannot submit arbitrary protocol requests, file paths, model JSON, or event payloads. The main process resolves the selected saved project, rebuilds the candidate graph from installed built-ins and repository manifests, recomputes dependency and migration impact, writes only `.gatereeve/workflow.json` atomically, and sends confirmed waiver/migration passage through the protocol core.

**Triggered by:** P4 intentionally relaxes GateReeve Desktop's predominantly read-only model, creating an API-contract and security-boundary change.

**Alternatives considered:**
- Expose the protocol adapter directly to the renderer - rejected because it would turn a narrow product control into a general event-journal mutation capability.
- Let the renderer write `.gatereeve/workflow.json` - rejected because renderer compromise must not grant arbitrary project-file writes.
- Offer copyable shell commands only - rejected because the approved design explicitly requires in-app checkboxes, preview, apply, and waiver controls.

**Promoted:** 2026-09-03. PR: #62.

---

## Activate feature-scoped waiver controls with finalization attempts

**Confidence:** HIGH

**Blast Radius:** Slice sequencing for P4/P8, Desktop finalization controls, and generic finalization protocol operations.

Slice 2 implements boundary-scoped waivers but does not fabricate a feature-scoped waiver against a module definition alone. The feature waiver UI and mutation activate in P8, when the protocol first creates a finalization attempt with the exact merge input, resolved module identity, dependency evidence, and scope fingerprint to which `WAIVED` can safely bind. This changes delivery ordering only; the approved feature behavior remains required.

**Triggered by:** P4 named both waiver scopes, while the approved P8 contract owns creation and fingerprinting of generic feature-finalization attempts.

**Alternatives considered:**
- Record a feature waiver before an attempt exists - rejected because it would lack the approved exact scope fingerprint and could carry across changed merge input.
- Add a temporary release-specific waiver record - rejected because it would put product-specific state into the generic protocol and require migration in P8.
- Disable a finalization module as a substitute for waiving it - rejected because durable project policy and one-feature risk acceptance are intentionally distinct controls.

**Promoted:** 2026-09-03. PR: #62.

---

## Bundle the minimal trusted waiver-guard runtime

**Confidence:** HIGH

**Blast Radius:** Desktop package contents, executable discovery, trusted Python guard dispatch, and boundary-waiver freshness validation.

GateReeve Desktop stages the canonical `pr_context.py`, `workflow_context.py`, and `workflow_common.py` scripts needed to verify that a waiver's pinned pull-request source is still current. It discovers a compatible Python 3.10+ executable plus Git and the GitHub CLI through the same Finder-compatible paths used by Setup, passes their absolute paths into the main-process adapter and Python guard, and binds a new waiver fingerprint to the verified context plus exact module identity. Existing recorded dependency fingerprints are reused only after that fresh context check because Desktop must not invent replacement inputs for evidence produced by another harness.

**Triggered by:** The first PR-boundary audit found that the initially injected unit test passed while the packaged default guard path lacked its Python script, and that the formal `boundary_gate.py` adapter does not accept every structural or project module ID.

**Alternatives considered:**
- Stage the complete workflow script directory - rejected because Desktop needs only the three-file trusted context-check closure.
- Reimplement pull-request freshness in renderer or ad hoc main-process JavaScript - rejected because the existing canonical guard already owns the check and the renderer must not gain process authority.
- Recompute every dependency using the formal gate adapter - rejected because structural and project gate IDs are outside that adapter and because doing so would invent input shapes different from the recorded evidence.

**Promoted:** 2026-09-03. PR: #62.
