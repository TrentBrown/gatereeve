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
