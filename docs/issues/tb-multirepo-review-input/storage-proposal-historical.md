> Historical input only. Superseded by [design.md](design.md) and interview
> D3-D10. In particular, old compatibility, history-exclusion and separate
> Git-backed execution requirements are not requirements of the new design.

# Design - tb-multirepo-review-input

**Status:** previous storage proposal; broader design interview reopened
**Updated:** 2026-10-23
**Controlling interview:** [interview.md](interview.md), D1 and D2

> This proposal is retained as input, not the full design of the next iteration.
> Trent has broadened the work to model-led orchestration while preserving the
> planning backbone and hard validation gates. Follow the reopened
> [interview](interview.md) and [architecture discussion](architecture-options.md)
> for that work. Parent-folder storage with optional Git remains settled. No
> design approval, specification or implementation passage has been recorded.

## Problem

GateReeve documents one canonical record at
`<workspace>/docs/issues/<featureId>/`, shared by nested Git repositories. The
parent need not itself be a Git repository. Compact review preparation instead
requires approved spec/design in the selected application repository's pinned
tree. CareNav's parent-folder layout fails with
`CONTRACT_INVALID: Unsafe review input path` before a reviewer launches.

Selected-repository assumptions also exist in advisory evidence admission and
Git-derived packet finalization. Fixing requirement packaging alone leaves the
ordinary review boundary blocked. Git tracking must be optional for the shared
record while inputs, results and currentness remain verifiable by the core.

## Intent

Support the documented parent-folder layout, preserving one authority, exact
application source pins, approved requirements, independent review and locally
retained evidence. The parent may track the record in Git; a new repository,
evidence commits and remote publication are not prerequisites.

This revision supersedes the proposed mandatory Git-owner/remote-retention
approach. A hash identifies bytes but does not retain them. A local copy retains
bytes but is not a backup, external authentication or proof of human approval.

## Chosen shape

### 1. Canonical authority and compatibility

Resolve configuration, feature identity and selected repository through the
existing workspace resolver. Verify the resulting feature home against the
initialized record. No arbitrary external requirement paths are accepted.
Bind captures to feature initialization identity, repository alias, logical
repository selection and relevant configuration. Absolute paths are local
containment checks, not portable evidence IDs or provider input. Workspace
relocation requires canonical re-resolution and currentness validation.

Use the shared-record path when the canonical home lies outside the selected
application Git root, whether its parent has Git, ignores the record or has no
Git. Preserve the existing repository-local Git-backed requirement path; do
not silently start reading its mutable working-copy documents instead.
Untracked requirements inside the application repository are a separate scope.

Introduce a versioned shared-record input/persistence capability. Existing
governed features require explicit compatible adoption before using changed
admission rules. Preserve pinned historical replay; do not rewrite prior events
or interpret old events as proof of the new contract.

### 2. Retained local input bundle

Persist frozen input bundles inside the canonical feature record, separately
from the temporary provider checkout. Proposed internal layout:

```text
docs/issues/<featureId>/
  spec.md                           # current canonical requirements
  design.md
  events.jsonl                      # existing passage authority
  workflow-model.lock.json
  review-inputs/<captureId>/
    manifest.json                   # frozen inputs; no future output references
    requirements/spec.md            # exact captured bytes
    requirements/design.md
    evidence/<contentHash>          # evidence required by this capture
  advisory/<readinessId>/...         # existing readiness/results
  pr-<number>/attempts/<id>/...      # existing formal artifacts/receipts
```

Capture IDs are validated opaque operation identities. The layout does not
provide a caller-controlled arbitrary path API. Repeated evidence can share
content within a capture; cross-capture deduplication and automatic pruning
are out of scope.

The proposed manifest carries these bindings through owning versioned schemas:

| Binding | Content |
| --- | --- |
| Contract | Schema/policy version and capture identity |
| Authority | Feature ID/initialization identity, relevant approval/validation and current implementation-authorization references |
| Repository | Selected alias, canonical logical selection and existing source-context identity |
| Source | Exact application base/head, applicable feature/slice bases, boundary scope and criteria |
| Requirements | Canonical feature-relative path, retained path, raw-byte SHA-256 and byte length for spec/design |
| Input evidence | Typed references with original feature-relative path, retained path, raw-byte SHA-256 and byte length |
| Execution | Applicable model/module/resource identities and dependency event bindings under existing preparation rules |

The manifest hash is referenced by readiness/preparation and subsequent
protocol evidence, never included in the manifest itself. Timestamps and
storage paths are provenance, not content identity. Strict current JSON schemas
must be deliberately versioned; these proposals are not unvalidated extra fields.

Requirement identity includes approved document hashes and applicable authority
bindings. Capture IDs, timestamps, parent Git HEAD and unrelated feature-folder
contents do not define requirement identity. Existing source, scope, criteria,
model and dependency bindings continue to apply. Appending an unrelated report
therefore does not invalidate reviews.

### 3. Capture and publication

1. Verify canonical identity, current lifecycle authorization and existing
   design-approval/spec-validation rules. Capture does not approve a document.
   Store observed authority references without claiming an old event attested
   bytes it did not bind. Existing approval/amendment discrepancies require
   normal reconciliation.
2. Read canonical spec/design and explicitly required input evidence as regular
   files. Reject traversal, symlinked files/intermediate directories, escapes
   and unsupported file types. Check paths and opened-file identity around
   capture so path substitution cannot select other bytes.
3. Preserve raw bytes, including line endings. Hash and measure the bytes
   actually copied. Keep structured metadata within existing JSON limits and
   stream supported larger evidence; never truncate silently. Stage privately
   under the feature home, flush files, verify copies and publish only a complete
   bundle. Publication must be exclusive, serialized for that identity and
   durable according to the platform's supported file/directory sync behavior.
4. Never replace an existing capture. Repeat requests may reuse a complete
   bundle only after all identities/hashes match. Conflicts fail; partial staging
   is unusable. Reserve/lock identities before publication to prevent races.
5. Make published bundles read-only by convention and revalidate hashes on use.
   Permissions alone are not integrity proof. This is the existing cooperative
   trust model, not a signed ledger or protection from an owner editing both
   the journal and files.

Provider checkout cleanup removes only disposable material. Referenced input
bundles and results, including failed attempts, remain under the canonical
record. No automatic pruning or retention expiry is introduced. Capacity or
publication failure reports an unavailable/blocking result rather than launching
with incomplete input or deleting prior evidence.

### 4. Independent reviewer view

- Export only the selected application's exact pinned Git source and approved
  diff ranges, preserving compact filtering and source validation.
- Inject captured spec/design beneath the safe virtual namespace
  `.gatereeve-agent-evidence/requirements/`. Never expose a path to the writable
  canonical workspace.
- Expose only the input evidence permitted for that module, including current
  Verification and bound attachments where required. Local retention is not
  permission to expose the complete evidence store.
- Advisory retains its existing permitted remediation/history inputs. Formal
  Judge remains blind to advisory reports, prior formal findings, journals,
  plans and historical verification. Distinguish host-side admission proof from
  provider-visible evidence inventories.
- Classify retained bundle namespaces as host history in all source views and
  diffs as well, including when captures happen to be tracked by a parent Git
  repository. Do not fall back to broad noncompact document export.
- Preserve fresh independent contexts, read-only source access and denied
  network execution. Do not include other repository source or credentials.

### 5. Local admission and core freshness

For the shared-record capability, replace `advisory.assertTracked` with a
core-verified local retention proof. Do not simply skip the guard or trust an
agent-supplied persistence flag. Cover the existing required reference closure:
readiness, result/unavailable claim, applicable proceed reason, focused evidence,
reused-review provenance and required remediation/history bindings. Validate
typed record relationships, original references, retained copies and hashes.
Keep existing clean/inapplicable/proceed semantics; none records a formal PASS.

Formal preparation must bind requirement identity and its retained-input manifest
in canonical prepared inputs, applicable gate fingerprints and core acceptance/
currentness checks. The current agent-workflow fingerprint is derived before
compact change construction; adding hashes only to a prompt, snapshot digest or
audit is insufficient. Apply the binding to all requirement-consuming formal
gates, including spec assessment, through the resolved boundary context.

Recheck these conditions at launch, formal entry, outcome recording and final
review-currentness/human acceptance as applicable:

- Canonical feature/repository/configuration and relevant authority agree.
- Required retained files exist, remain contained and match hashes/lengths.
- Current canonical spec/design still match the approved requirement identity;
  approval, validation and implementation authorization remain current.
- Source pins, scope/criteria, module definitions and required dependency
  events satisfy the existing source/evidence currentness rules.
- Original evidence references still match captured bytes wherever required
  for current admission/dependency proof. A retained copy explains a historical
  result; it does not conceal a changed or missing current reference.

Drift during execution prevents recording the result as current for the changed
inputs. Preserve diagnostics under the original identity and require revised
readiness/preparation as applicable. Never silently recapture mutable files to
make an old result current. Missing/modified capture or result bytes block reuse
and passage while preserving historical events. Restoring exact bytes permits
normal revalidation; different bytes require a new capture/attempt. Distinguish
source drift, requirement drift and missing evidence in diagnostics.

### 6. Results and interrupted operations

Store results in their existing advisory/attempt namespaces. Results or host
receipts bind the input manifest, exact input identity/source context, module
identity and existing provider receipts. Version any affected schemas; host
provenance does not silently become an extra provider output field. Frozen
input manifests never refer to their own future output.

Persist and verify the output set before recording an outcome through the core.
Identical publication can be repeat-safe; different bytes cannot overwrite an
already published artifact under the same identity. Adapt publishers that
currently allow replacement when used by the new contract.

The journal remains passage authority. A published bundle/result without its
event is an orphan for deterministic reconciliation, not PASS. An event with
missing required bytes is historical passage with unavailable current proof.
Reconcile known operation/event IDs and hashes before repeating a launch or
append. Do not claim an atomic transaction across filesystem and journal or
infer a verdict from file presence.

### 7. Ordinary packet validation and finalization

For shared records, derive typed packet inventory and evidence deltas from
recorded gate references, retained manifests and a captured packet-inventory
baseline. The core validates enabled-gate artifacts, source/attempt identity,
hashes and permitted bookkeeping. An application Git diff, caller-supplied
`--changed-path` list or successful directory scan alone is insufficient.

| Application source checks | Shared evidence checks |
| --- | --- |
| Preserve clean checkout, exact PR/base/head and synchronization | Validate canonical local identity and manifest/reference closure |
| Post-evaluation code changes follow existing source-drift/evidence-only rules | Only declared evidence/bookkeeping changes are admitted; requirement/dependency changes trigger currentness handling |
| Preserve application commit/push and reviewed-content merge protection | No evidence commit/push, parent-Git clean status or remote is required |

Adapt ordinary `boundary.retry`, packet construction/validation and finalization
so this path does not demand impossible application evidence commits. Final
bookkeeping retains real core event bindings and repeat-safe behavior.
Repository-local finalization keeps its Git-backed procedure. Shared evidence
exceptions must never conceal an application code change.

### 8. Retention and cleanup

Keep canonical records and referenced bundles/results by default. Report
independently: record location, required-byte availability/integrity, optional
Git tracking coverage and any verified archival action. Untracked or ignored
does not mean missing; locally retained does not mean externally backed up.
No remote is required for review or ordinary completion under the local contract.

Before discarding/removing the workspace, require an explicit applicable human
decision under the existing closeout policy:

- **Keep:** preserve the record and required input/output closure outside the
  deletion scope. If the record lies inside that scope, preservation must be
  arranged and verified before proceeding.
- **Archive:** after explicit authorization, copy the record and full referenced
  local evidence closure to a selected destination outside deletion scope;
  verify bytes/manifests and record the destination before claiming archival.
  Include journal/model provenance. Application Git objects are not claimed
  archived unless separately included and verified.
- **Discard:** record the user's explicit decision/scope before removal. This
  acknowledges intentional evidence loss; it is neither archival nor authority
  inferred from design approval. This repair adds no deletion service.

No Git initialization, ignore-policy edit, remote creation, automatic document
move, archival or garbage collection is included. Optional Git tracking does
not change review identity.

### 9. Bounded scope

Cover the ordinary path end to end: canonical capture, local advisory admission,
formal preparation/currentness, immutable output bindings, ordinary packet
validation/finalization, observer diagnostics and necessary local-retention
reporting. Update owning canonical policy/commands with the versioned capability
so skills no longer request evidence commits that this path deliberately omits.

The separate already-merged completion-recovery operation also requires
requirements inside the selected Git repository (`recovery.js`). Document its
unsupported shared-record case explicitly; do not silently extend the repair
into recovery, release or deployment governance. Ordinary review evidence does
not become whole-feature certification through relabeling.

## Alternatives considered

- Mandatory records repository/remote: rejected by the user's storage choice;
  optional tracking remains supported.
- Hash-only mutable files: rejected; hashes cannot recover missing bytes.
- External immutable storage service: deferred; unnecessary storage/access
  machinery for this local workflow.
- Relax `pathOf` to allow parents: rejected; source paths remain strict and
  canonical documents are captured into safe virtual paths.
- Copy all records into application repositories: rejected; duplicates authority
  and exposes review history.
- Skip tracking checks or trust agent persistence flags/path lists: rejected;
  replace them with typed local proof validated by the core.
- Treat local snapshots as approval, backup or PASS: rejected; those are
  separate claims with separate evidence and authority.

## Constraints

- Reuse the existing `tb-multirepo-review-input` worktree based on `643e3ea`;
  preserve old main and unrelated files. No merge/rebase is needed for design.
- Later implementation belongs in canonical `plugin-src/` and owning helpers/
  tests. Exercise a provenance-bound local build; do not patch installed caches
  or generated distribution. This document edit is not an installed fix.
- Govern the repair through the existing working repository-local path; do not
  use the unreviewed new contract to certify its own implementation.
- Preserve source/PR protections, closed prepared PRs, human gate/merge authority,
  independent review and default uncapped remediation rounds.
- No CareNav application changes, migration, deployment, activation, production
  AWS mutation, main merge or public plugin release is included.
- This is a review candidate. Approval to develop the approach is not passage
  of its newly detailed design. No spec/implementation begins before that gate.

## Open risks

- Concurrent mutation/path substitution: validate stable capture, copied bytes,
  launch and recording, not only an earlier hash of the original file.
- Incomplete freshness propagation: test actual core acceptance/currentness,
  every requirement-consuming gate and ordinary packet paths, not only prompts.
- History leakage: tracked captures must not enter later source exports, diffs
  or formal dependency inventories.
- Crash windows: exclusive publication, complete manifests and journal
  reconciliation must cover partial writes and interrupted recording.
- Adoption: strict schemas/models and pinned historical events need versioned
  compatibility; no silent rewrite of existing records.
- Local loss/growth: no backup promised and no automatic pruning. Retain
  referenced evidence; stream supported files and report capacity failures.

## Verification scenarios for specification

These inform later AC/rubric; they are not completed tests or spec approval.

1. A parent without Git and multiple nested repositories completes advisory
   preparation/admission and an ordinary formal boundary using local evidence.
   Repeat with tracked and ignored parent records.
2. Isolated views contain exact selected application source/approved documents;
   other repository source and forbidden formal history are absent.
3. Wrong feature/alias, external arbitrary paths, traversal, symlinked components,
   unsafe IDs and capture/reserved-path collisions fail.
4. Requirement, authority, source or required-evidence drift between capture,
   launch, recording and final acceptance prevents current-result reuse.
   Unrelated reports and optional parent evidence commits do not invalidate it.
5. Missing/truncated/changed retained bytes, lengths or current original evidence
   references block admission/reuse/currentness with specific diagnostics.
6. Packet inventory derives from protocol/manifests; forged changed-path lists
   and undeclared artifacts cannot pass. Local bookkeeping cannot hide code drift.
7. Concurrent publication/crashes before and after publication/event append
   reconcile without overwriting evidence, duplicating passage or inventing PASS.
8. Existing repository-local tests/historical replay remain valid. Older records
   require compatible adoption before local-proof admission.
9. Retention distinguishes local availability, optional Git and verified archival;
   no automatic cleanup or remote mutation occurs.
10. Exercise the built local adapter against CareNav pins with clear provenance;
    changing CareNav lifecycle events requires separate applicable authorization.

## Changes

- **2026-10-23:** Revised after Trent chose parent-folder documents with Git
  optional. Replaced mandatory Git ownership with locally retained input/evidence
  proof; included ordinary formal freshness and packet finalization so packaging
  does not merely expose the next Git-only blocker. Kept completion-recovery
  separate and preserved explicit cleanup decisions. Design approval pending.
