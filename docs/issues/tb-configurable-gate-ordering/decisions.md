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
