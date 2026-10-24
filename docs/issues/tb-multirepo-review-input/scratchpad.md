# Scratchpad - tb-multirepo-review-input

Approved product choices are in
[interview.md](interview.md), D1-D10, and [design.md](design.md).
Append implementation decisions here as they arise; do not duplicate the interview.

## [1] Build and test the current core before switching public consumers

[x] **Promote**

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
