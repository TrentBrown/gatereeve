# Decisions - tb-multirepo-review-input

## D-implementation-1: one current runtime with reusable proof mechanics

Promoted from scratchpad [1]. The canonical current core is implemented in
protocol/current. Public CLI, native and Desktop consumers cut over together.
The old state-machine interpreter, scheduling DAG and owner-ordering mutation
surfaces are removed. Resolver, fresh provider adapters, structured receipts,
release trust and artifact/terminal isolation remain reusable mechanics.

Historical user journals are retained as files, never replayed by the new core.
Installed rc.16 continues governing this implementation record until separately
authorized installation/resumption. Local generated candidates are not releases.

The approved interview D1-D10 and design remain controlling product decisions.

---

## Build and test the current core before switching public consumers

**Confidence:** HIGH

**Blast Radius:** Protocol entry points, persisted feature state and all consumers.

Implement the new contract in a small current-protocol namespace first, with
negative tests and no production feature conversion. Public consumers switch
together after the executable path is sound. This is intermediate development,
not a shipped parallel legacy mode. Installed rc.16 continues to govern this
implementation record until an authorized local cutover.

**Triggered by:** Plan authorization and source inspection of graph-coupled consumers.

**Alternatives considered:**
- Rewrite every existing state machine in place first: makes meaningful incremental
  verification harder and risks accidentally using new semantics on old records.
- Ship a version selector: rejected by D10; no old runtime fallback will be exposed.

**Promoted:** 2026-10-23. PR: #84.
