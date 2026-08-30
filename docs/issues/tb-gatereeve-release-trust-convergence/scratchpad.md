# Decision Scratchpad - tb-gatereeve-release-trust-convergence

**Feature start:** 2026-08-30

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Model schema v2 as append-only ordered stage history

[x] **Promote**

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

[x] **Promote**

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
attempt. Candidate and replacement tag/version pairs must match exactly, and
every Apple status response must identify the recorded request ID.
Release-stage passage later consumes only an accepted attempt with matching
bytes.

**Triggered by:** P2 and AC4 require request continuity across runner failure,
bounded recovery, fail-closed ambiguity, and prohibition of generic reruns.

**Alternatives considered:**
- Continue `notarytool submit --wait` - rejected because interruption can lose
  the request ID and offers no durable recovery point.
- Store attempts directly as successful lifecycle stages - rejected because
  timeout, rejection, and uncertainty are facts, not completed trust gates.
- Automatically resubmit after timeout or interruption - rejected because it
  can create multiple Apple requests for changed or ambiguous bytes.

## [3] Distinguish submitted and final stapled DMG identities

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Apple trust evidence v2, notarization recovery, retained artifacts, native verification, schema-v2 lifecycle binding, and later publication

Treat the signed, unstapled universal DMG submitted to Apple and the final stapled universal DMG as two explicit immutable identities in one authorized trust derivation. The notarization attempt and Apple request remain bound to the submitted artifact. After acceptance, trust finalization copies the retained submitted artifact to a distinct final path, staples and validates that copy, then records both identities and their lineage. Native ARM64/Intel verification, the trusted-universal-DMG lifecycle stage, finalization, and publication bind only the final stapled artifact. The retained submitted artifact plus attempt history remains the recovery authority and both are retained for at least 30 days. This is not permission to rebuild or substitute bytes under the candidate version.

**Triggered by:** The existing trust script hashes the DMG before stapling even though stapling may change the distributable file, making exact-byte authority and recovery ambiguous

**Alternatives considered:**
Assume stapling preserves the DMG digest - rejected because the contract must not depend on that implementation detail; staple the only retained DMG in place - rejected because a recovery invocation could no longer match the attempt-bound submitted bytes; treat post-staple drift as requiring a new RC - rejected because stapling is the intended trust-finalization derivation, not an arbitrary rebuild

## [4] Revalidate Plugin identity at every cross-run recovery boundary

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** trusted lifecycle construction, retained Plugin artifacts,
recovery-run selection, and candidate-identity tests

The schema-v2 lifecycle builder reads and validates the retained Plugin
candidate's `RELEASE.json` against the exact requested tag, version, source
commit, Plugin ID, and marketplace before hashing its tree. Binding a GitHub
run to the same source commit is insufficient because multiple RC identities
can legitimately use one commit.

**Triggered by:** PR #33 independent review found that recovery could combine a
same-source Plugin tree from a different RC with the current Apple candidate.

**Alternatives considered:**
- Trust the preparation run ID and source SHA alone - rejected because neither
  proves the candidate tag.
- Query only the original workflow inputs - rejected because the retained
  artifact already contains authoritative self-identifying metadata and must
  remain independently verifiable.

## [5] Fail closed when native Intel authority cannot be established

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** native macOS evidence, Intel runner compatibility, Rosetta
rejection, and protected rehearsal behavior

Native verification accepts `sysctl.proc_translated=0` directly and rejects
`=1`. Apple's documented missing-key result means the process is native; the
CLI's `-i` form represents that result as successful empty output, which is
also accepted. Unexpected nonempty output or an actual command failure is
indeterminate and fails closed.

**Triggered by:** PR #33 independent review found that every translation-probe
error was previously converted into `rosettaTranslated: false`.

**Alternatives considered:**
- Treat any missing translation key as native - rejected because an
  operational probe failure on Apple Silicon could authorize Rosetta evidence.
- Reject the documented missing-key result - rejected because Apple defines
  `ENOENT` as a native process and GitHub's Intel runner exhibits that case.
- Use `hw.optional.arm64` as a fallback - rejected after hosted evidence because
  the key is also absent on the Intel runner and is unnecessary when the
  primary API's documented missing-key semantics are preserved.

## [6] Retain repository-local publishers behind a schema-v2 hosted authority

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** schema-v2 finalization, hosted publication workflows, receipt recovery, Cask linkage, CLI compatibility, and migration documentation

Keep the existing repository-local GitHub, Plugin, manifest, website, and Homebrew transport adapters as the implementation of deterministic convergence. Add a schema-v2 finalization and receipt layer as the only new-release authority, and invoke the adapters only from protected hosted release-publication jobs that consume retained exact packets and sealed plan digests. Do not persist or mutate a newly synthesized schema-v1 release record; schema v1 remains historical/read-only. The local commands remain inspection and exact-record recovery surfaces, not an alternate authority for changing plans or trusted bytes.

**Triggered by:** P5-P7 audit found deterministic local primary and Cask engines but no hosted publication workflow and no schema-v2 finalization or linked Cask record

**Alternatives considered:**
Copy PortReeve's publication engine - rejected because GateReeve already has product-specific Plugin/Desktop/Cask adapters; keep local CLI publication as production authority - rejected because it bypasses hosted environment approval and custody; replace all existing adapters - rejected because their dry-run, exact-remote preflight, PR transport, and idempotent receipt behavior already satisfy the desired semantics; create a shared runtime package - rejected until both repository-local paths stabilize.

## [7] Advance the immutable public-Cask smoke fixture with public history

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** native Homebrew smoke CI, immutable public release fixtures,
and future Cask-maintenance procedure

Pin public-Cask smoke to the newest immutable Cask actually present in the
public tap, currently `v0.1.0-rc.2` from coordinated preparation run
`33234514595`. Keep the older RC.1 release and evidence immutable; do not
rewrite it. When an approved Cask publication advances the tap, advance this
explicit smoke fixture to the matching retained release packet in repository
history. Also trigger the smoke workflow when the schema-v2 Cask implementation
changes.

**Triggered by:** PR #34 hosted run 33333176807 proved both native local-tap
install/upgrade paths, but both public-tap jobs correctly rejected the stale
RC.1 expectation after the tap advanced to RC.2.

**Alternatives considered:**
- Accept any public Cask bytes - rejected because it would discard exact-byte
  authority.
- Rewrite or remove the RC.1 fixture - rejected because published history is
  immutable and remains useful historical evidence.
- Discover an unpinned latest release at runtime - rejected because the smoke
  must bind an explicit retained packet and cannot silently change authority.

## [8] Cut over Apple custody through validated overlap

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** GitHub release-trust and release-publication environments, Apple credential custody, protected RC rehearsal, and rollback safety

Create release-trust with the required Trent Brown reviewer, self-review permitted, and a custom main-only policy; copy only the four non-secret Apple identity variables automatically. The user places the three Apple secrets directly into GitHub once. Preserve the historical Apple entries in release-publication until a fresh protected RC.3 rehearsal succeeds and its retained evidence is validated. Only then remove Apple variables and secrets from release-publication and re-audit disjoint custody. This temporary overlap is a bounded migration state, not an accepted steady state.

**Triggered by:** The approved live audit found release-trust absent while release-publication retained the historical combined Apple custody

**Alternatives considered:**
Delete historical Apple entries before validating release-trust - rejected because it removes the rollback path; transmit or copy secret values through the Playpen agent - rejected because Apple secrets must never reach the Linux host, logs, artifacts, or chat; leave the combined environment in place - rejected because it violates the approved trust/publication separation.

## [9] Require real GitHub environment deployments for protected authority

[ ] **Promote**

**Confidence:** HIGH

**Blast Radius:** protected trust production, trust recovery, primary and Cask
publication approval, live rehearsal evidence, and candidate-version handling

Treat `deployment: false` on a job environment as a blocking authorization
defect because it suppresses the GitHub deployment record and therefore the
configured required-reviewer gate. Preserve RC.3 and its retained exact bytes,
Apple request history, and native evidence as immutable successful trust
production, but do not count that run as approval-boundary evidence. Remove
deployment suppression through a fresh reviewed correction slice, test every
trust/publication environment job, and prove the reviewer wait with a fresh RC
identity before completing P9. Keep the temporary Apple-credential overlap in
place until that corrected rehearsal passes.

**Triggered by:** Protected RC.3 run `33340560850` entered `release-trust`, read
its secrets, and completed without a pending deployment or deployment record
despite the environment's required-reviewer rule.

**Alternatives considered:**
- Accept successful secret use as proof of protection - rejected because it
  proves credential availability, not reviewer authorization.
- Continue to finalization and publication dry-run with the same setting -
  rejected because it would reproduce the missing approval boundary.
- Modify the workflow directly in the feature-final acceptance branch -
  rejected because the approved plan requires a fresh reviewed delivery slice
  for code corrections discovered during live acceptance.
- Delete the rollback credentials from `release-publication` now - rejected
  until the corrected trust boundary has passed end-to-end.
