# Decision Scratchpad - tb-gatereeve-release-trust-convergence

**Feature start:** 2026-08-30

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Model schema v2 as append-only ordered stage history

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** coordinated release schema, validators, fixtures, later
finalization and publication adapters

Schema v2 uses an immutable identity plus an append-only `stages` array. The
complete order is `source-pinned`, `policy-resolved`,
`plugin-candidate-built`, `universal-desktop-packaged`,
`artifact-digests-established`, `candidate-qualified`,
`trusted-universal-dmg-established`, `authoritative-native-verified`,
`desktop-trust-verified`, `distribution-finalized`,
`publication-approved`, and `published`. Each append binds structured evidence
and the previous stage; validators reject omission, reordering, duplication,
unknown stages, identity drift, and non-prefix histories. Schema-v1 validation
remains available only through an explicit legacy reader; mutation helpers
require schema v2.

**Triggered by:** P1 requires strict schema dispatch, exact product-stage
placement, immutable history, and binary conformance tests.

**Alternatives considered:**
- A single mutable `state` field - rejected because it cannot prove historical
  transitions or distinguish durable attempts from successful stages.
- Retrofitting stage history into schema v1 - rejected because it would
  synthesize history for already-published records.
- Reusing PortReeve's exact stage array - rejected because GateReeve retains a
  universal DMG and coordinated Plugin/Desktop topology.

## [2] Keep notarization attempts separate from successful release stages

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** Apple notarization scripts, retained trust artifacts,
recovery commands, workflow retry rules, and schema-v2 trust transitions

Every Apple submission uses a standalone append-only attempt record bound to
the candidate version, source SHA, tag, and exact universal-DMG identity. It is
written before submission and advances to durable `submitting` before Apple is
invoked, so abrupt runner loss cannot make an ambiguous request look safe to
resubmit. It records the returned request ID before polling and contains
explicit polling sessions limited to 60 polls at 30-second intervals. Timeout,
rejection, uncertainty, and supersession are durable attempt states, never
successful release stages. Recovery resumes the same request ID; `submitting`
or uncertain submission must be reconciled against Apple history, and a new
submission is allowed only after durable evidence that no request exists.
Changed bytes require a fresh candidate version and a linked superseding
attempt. Release-stage passage later consumes only an accepted attempt with
matching bytes.

**Triggered by:** P2 and AC4 require request continuity across runner failure,
bounded recovery, fail-closed ambiguity, and prohibition of generic reruns.

**Alternatives considered:**
- Continue `notarytool submit --wait` - rejected because interruption can lose
  the request ID and offers no durable recovery point.
- Store attempts directly as successful lifecycle stages - rejected because
  timeout, rejection, and uncertainty are facts, not completed trust gates.
- Automatically resubmit after timeout or interruption - rejected because it
  can create multiple Apple requests for changed or ambiguous bytes.
