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

---

## Separate cumulative feature range from assessed merge target

**Confidence:** HIGH

**Blast Radius:** Candidate identity, source export, delta coverage and protected merge authorization

Keep original featureBaseSha as the cumulative review anchor. Retain a distinct target commit and source snapshot in the candidate, export it to the evaluator, include it in applicability and delta coverage, and require the live merge action to match it. Target movement needs refreshed interaction proof. Alternatives: replacing the feature base loses cumulative coverage; merely allowing an arbitrary live target would leave interactions unassessed. The concrete repair and regressions are in verification/formal-pr84-remediation-2.md.

**Triggered by:** Independent formal review CR2-2 exposed original-base and live-target conflation

**Alternatives considered:**
None recorded.

**Promoted:** 2026-10-23. PR: https://github.com/TrentBrown/gatereeve/pull/84.

---

## Bind every inherited runner variable conservatively

**Confidence:** HIGH

**Blast Radius:** Verification execution and applicability across CLI and Desktop hosts

Hash the full inherited environment and pass that frozen environment to checks. Retain no cleartext environment values in the fingerprint. This may rerun checks across GUI and shell environments, but unknown relevance cannot qualify old proof. Isolated source-only assessments can still reuse results. Alternatives: retaining a caller-selected subset misses undeclared influences; a new minimal environment would change existing project command behavior. Future narrowing needs an explicit execution contract and evidence.

**Triggered by:** Fresh native Judge F2 reproduced changed command outcome with unchanged declared-variable fingerprint

**Alternatives considered:**
None recorded.

**Promoted:** 2026-10-23. PR: https://github.com/TrentBrown/gatereeve/pull/84.

---

## Materialize standing permission into exact candidate decisions

**Confidence:** HIGH

**Blast Radius:** Human authority, protected merge, CLI/native/Desktop consumers.

D11 authorizes acceptance-only grants and explicitly scoped merge grants. Keep
future permission separate from exact candidate/action decisions: the model
requests application and the core requires all required gates to PASS, then
records its derivation from the original instruction. Revalidate grant scope,
expiry and revocation at action time. No grant waives evidence or authorizes
deployment. Bind the implementation authorization event so amending and later
reverting requirements cannot revive an old grant. No wall-clock expiry is
invented: null explicitly means the current feature run.

**Triggered by:** Trent's 2026-10-24 approval and explicit merge clarification.

**Alternatives considered:** Automatically treating an overnight request as all
permissions would conflate acceptance, merge and deployment. Requiring a human
for every exact head would defeat the approved unattended workflow.

**Promoted:** 2026-10-24. PR: #84.
