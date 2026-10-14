# Decisions - tb-configurable-gate-ordering

No implementation decisions promoted yet.

---

## Preserve definition identity with a versioned ordering overlay

**Confidence:** HIGH
**Blast Radius:** repository policy, resolved models, review/finalization freshness and Desktop configuration.

Store owner completion-order edges separately in schema-2 policy/graph, retaining schema-1 behavior and original module digests. Conditional owner links use the existing after semantics and bind predecessor events for freshness but do not transfer review reports to Judge inputs. Default models remain schema-1 when no owner ordering is present. Feature adoption remains explicit; no new lifecycle state or owner-authored stage object.

**Triggered by:** approved configuration/API extension and historical review integrity.
**Alternatives considered:** modifying module manifests would change definition identity; stages introduce global barriers and a competing ordering source; priority alone cannot guarantee completion order.

**Promoted:** 2026-10-14.

---

## Bind policy application to a completed immutable preview

**Confidence:** HIGH
**Blast Radius:** asynchronous Modules settings state and migration confirmation.

Native advisory found three related failures: dependency absorption dropped staged ordering, late responses restored discarded edits, and Apply could submit a newer mutable draft against an older preview. Fix the complete asynchronous contract: clone ordering into every preview call, clear validation and disable Apply immediately on new edits, retain one validated immutable submission snapshot, invalidate generations and close confirmation on Discard/new preview, and prevent edits during application. Regression coverage includes ordinary and dependency-expansion responses released after Discard and an edited draft while confirmation is open.

**Triggered by:** advisory findings at ordering-s1-ready-1; defects violate AC4 / R6-R7 and graph preview R8.
**Alternatives considered:** patching only the missing argument would leave stale response/confirmation authority defects; keeping the previous valid preview clickable during validation can submit unreviewed choices.

**Promoted:** 2026-10-14. PR: #81.

---

## Bind owner confirmation to the host candidate and migration baseline

**Confidence:** HIGH
**Blast Radius:** module-policy application, IPC preview identity and core model migration conflict handling.

The second advisory confirmed the frontend fixes and found that saved-policy digest alone misses new unselected catalog definitions and independent feature-model changes. Extend the authority binding to a host-computed fingerprint of the exact resolved policy/model, complete discovered definition identities and feature model/journal baseline. Transport that identity through preview/confirmation/Apply, revalidate it before publication, and let core migration reject a baseline different from the one confirmed. On a late guarded conflict, restore only the host's own published policy bytes; never overwrite another writer.

**Triggered by:** native advisory ordering-s1-ready-2, one R6/R7 finding affecting manager and renderer.
**Alternatives considered:** UI snapshots and saved-policy digest protect draft identity but cannot bind undisclosed host state. Recomputing an impact at Apply without checking the old fingerprint is not consent to a changed impact.

**Promoted:** 2026-10-14. PR: #81.

---

## Serialize policy publication and rollback ownership

**Confidence:** HIGH
**Blast Radius:** concurrent repository policy mutations and recovery from a guarded model conflict.

Formal spec assessment identified that fingerprint checks and own-byte rollback alone cannot distinguish overlapping successful/failed operations, especially identical published bytes. Hold one exclusive repository policy mutation lock across validation, publication, migration and cleanup/rollback. Reject a competing operation before it can write; retain PID/time when an interrupted owner leaves a lock rather than deleting another operation's lock automatically. Add a deterministic manager test that holds migration open while a competing Apply attempts the same preview. Reload saved policy provides a fresh catalog/baseline after confirmation drift.

**Triggered by:** R7 formal assessment and class-wide publication/rollback ownership review.
**Alternatives considered:** comparing bytes alone is not ownership; retrying the competing writer under its earlier fingerprint could apply a stale confirmation.

**Promoted:** 2026-10-14. PR: #81.

---

## Make execution and packets obey the pinned configurable DAG

**Confidence:** HIGH
**Blast Radius:** shared boundary retry, native and Desktop execution, finalization recording, packet validation and policy recovery.

Independent Judge findings expose four reachable gaps beyond graph resolution. Capture the execution preparation at launch and enforce its model/input/predecessor identity at completion and again during core recording. Remove retry-wide barriers that contradict explicit owner dependencies through Explain Diff or Packet Validation; all enabled checks remain required before human review. For disabled standard artifact checks, use modular packet schema 4 naming the attempt, and derive its exact inventory/dispositions/evidence from a trusted protocol snapshot rather than permitting manifest authors to disable gates. Preserve historical packet schemas. Restore previous policy only after core state confirms that a failed migration did not publish; pending markers/changed state require recovery, and unchanged saved-policy adoption remains previewable after reload.

**Triggered by:** independent Judge a4 F1-F4, R4/R7/R10.
**Alternatives considered:** adding more owner ordering restrictions would create an unapproved stage barrier; allowing arbitrary missing packet artifacts would weaken enabled modules; copying current predecessor IDs would launder stale in-flight results; rolling back policy after unknown core mutation would hide recovery state.

**Promoted:** 2026-10-14. PR: 81.
