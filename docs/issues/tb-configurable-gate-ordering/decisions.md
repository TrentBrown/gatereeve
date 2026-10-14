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
