# Design - tb-boundary-iteration-cost

**Status:** approved (gate passed 2026-10-12)
**Date:** 2026-10-12
**Source:** [Interview](interview.md), decisions D1-D16.

## Problem

The PR-boundary workflow spends substantial verification and bookkeeping time before an independent Judge discovers defects. MyLifeMap PR #234 repeatedly failed R29 on related saves, paging and response-ordering paths. Fixing one example at a time produced expensive formal retries. The handoff estimates about 35 minutes per attempt; this estimate is historical evidence, not a measured performance guarantee for this feature.

The review-input builder also creates binary diffs without rename detection, duplicates identical slice patches, and enforces an approximately 12 MiB aggregate limit before externalizing patches as files. Tracked review history contributes size and can expose earlier findings to an allegedly independent Judge. MyLifeMap's whole-feature review was blocked by an approximately 22.8 MB diff spanning 905 files.

The final delivery then merged at slice scope after Trent explicitly waived the whole-feature Judge. All four slices are recorded as Merged, but the feature remains Delivering Slices. Normal entry to Finalizing is coupled to a slice merge marked `featureFinal: true`; the separate feature transition reuses a slice-merge event and fails when no slice identity is supplied. Read-only replay reproduced this failure. The recorded waiver exists in the decision log, not as an applicable whole-feature waiver event.

## Intent

Discover defects before expensive formal attempts, reduce mechanical retry work, keep final presentation work out of failing iterations, and support large independent reviews through compact, inspectable evidence.

Provide a sanctioned, auditable route into Finalizing for an already merged feature with an explicitly waived whole-feature Judge, without rewriting historical events or interpreting missing evidence as success.

Preserve independent formal Judge execution, full applicable verification, CI on the reviewed source, protocol currentness and authority checks, and explicit human review/merge authorization. Configurable gate ordering is a subsequent feature.

## Chosen shape

### 1. Advisory review at slice readiness

When the implementer declares a significant specced slice ready after fast checks and focused tests, automatically run advisory review wherever the formal Judge applies. Review a pinned source snapshot using a fresh context, read-only access, denied network access, and the formal Judge's capability standard and scope.

Supply approved requirements, code, tests and the fast/focused evidence. Mark full verification pending. A clean advisory result means `ready for formal review`; it is never a formal Judge or Verification PASS. The implementer can proceed without a clean result with a retained reason. That reason does not waive a formal obligation.

Advisory reruns receive a bounded checklist of earlier advisory and formal findings for the same slice. They check those fixes and assess the full in-scope slice for further defects. Prior findings never count as proof of correctness.

### 2. Defect-class remediation and execution failures

After an advisory or formal Judge failure, require the implementer to identify the violated invariant, examine every path affecting it, and add focused regression coverage for related failures found before declaring the revised slice ready. Retain a brief analysis and coverage record. Both review prompts request every supported finding identified, without claiming exhaustive discovery.

The same finding recurring after a claimed fix requires an explanation and a changed remediation approach. Distinct defects sharing a rubric ID remain distinct. No default consecutive-failure-count halt is added; explicit project stop rules and escalation requirements continue to apply.

Retry a transient advisory execution error once automatically. Persistent configuration or isolation errors are unavailable immediately. Unavailable execution is not a code failure. After unavailability or exhausted transient retry, the implementer may proceed with a retained reason; formal Judge requirements remain intact.

### 3. Compact tracked records and advisory-only reuse

Keep compact advisory records in the tracked cumulative feature folder: reviewed source identity and input bindings, findings, readiness outcome, remediation summary, operational errors, and any reason for proceeding without a clean result. Do not retain full transcripts in these records. Use stable run identities and preserve earlier records for handoffs and audit.

A clean advisory result may remain usable after evidence-only changes only when deterministic input comparison proves that all declared review inputs are unchanged, including source, tests, configuration, dependencies and approved requirements. Do not classify changes as evidence-only merely by commit message or broad directory name. This reuse rule does not apply to formal gate outcomes, dependency event IDs or attempt fingerprints.

### 4. Enforce formal Judge blindness

Formal Judge receives approved binding requirements and current formal verification, with access to relevant code and tests. Exclude advisory history, prior review reports, raw decision journals, verdicts and bypass reasons from supplied inputs, diff material and the read-only repository view. A fresh conversation alone is insufficient.

Binding requirements belong in approved spec/design. If a binding constraint exists only in a journal, reconcile it through the existing document approval process. Do not automatically summarize a journal into newly authoritative requirements. Preserve the identity of the original commit and explicitly bind the filtered view and allowed evidence in the execution receipt. Keep exclusion audit information outside the Judge's view.

Formal Judge retains its Verification dependency and full-verification requirement. This feature does not move the formal Judge ahead of its required evidence or add user-configurable gate scheduling.

### 5. Early discovery, late presentation

Keep code review and spec assessment early as defect-finding activities, with findings recorded as they occur. Generate Explain Diff, final PR narrative and consolidated review summaries once substantive checks are clean. Required formal reports remain current prerequisites to human review. Subsequent source changes invalidate affected checks and artifacts.

### 6. Retry orchestration

Provide one orchestration entrypoint after remediation and the revised readiness declaration. It reuses the exact existing PR, resolves the updated pinned context, starts a fresh formal attempt when needed, and handles protocol gate recording and packet bookkeeping.

The implementer owns fixes and readiness. The helper preserves PR closure preference, branch direction, currentness, formal freshness and human authority boundaries. Retain recoverable checkpoints and stable identities so interruption does not duplicate attempts or events. Never carry an old formal PASS into a new attempt as if current. Shared mechanics belong in portable plugin resources so Codex and Claude adapters invoke the same contracts; Desktop is not a prerequisite.

### 7. Compact review input construction

Use a compact input manifest with exact source ranges, requirements, changed-file inventory and digest-bound references to review material. Construct larger diff material as bounded referenced files rather than requiring the whole review's payload to fit one in-memory JSON object before externalization.

Deduplicate identical feature/slice patches. Detect renames while retaining substantive edits. Represent binary changes with old/new identity, paths and content hashes, keeping the relevant actual files accessible in the immutable review snapshot. Preserve before/after material where required to assess a change. Apply review-history exclusions consistently to text, snapshots and input documents.

Keep the pinned review range and complete relevant source inventory intact. Other features merged to the integration branch must not silently disappear from whole-feature review. Attribute the primary feature focus using verified slice provenance where available, avoid eagerly duplicating unrelated diff payloads, and retain access to the full assembled product and relevant shared dependencies. If narrower source scope is desired later, it requires its own explicit contract rather than a size-driven heuristic.

Measure packet size and construction behavior against the oversized MyLifeMap scenario and representative rename, binary, large-text and duplicate-patch cases. Raising the aggregate limit alone is not the chosen fix.

### 8. Sanctioned post-merge finalization recovery

Add a semantic protocol recovery operation for a feature in Delivering Slices whose final delivery has already merged at slice scope. It must validate that no delivery remains active or unresolved, there are no blocking changes or pause, the relevant slice reviews were accepted, and the recorded reviewed content is integrated in the exact source selected for completion.

Require explicit human-confirmed waiver evidence for the missing whole-feature Judge, bound to this feature, the approved requirement identity, waived obligation and verified final integrated source. Existing documented human waiver evidence may be referenced and bound by the recovery operation; a tooling error, ordinary slice Judge PASS, or general instruction to proceed is not a substitute for an explicit applicable waiver. Ambiguous or mismatched historical authority must be surfaced, not inferred.

Require the remaining whole-feature verification, spec-compliance and retention obligations to be demonstrated for the selected source. Existing reports may support that assessment only when their source, scope and content genuinely establish those obligations. Recovery must not relabel a slice-scoped report as whole-feature evidence. Missing obligations must be supplied or explicitly handled under their own permitted policies.

Append a dedicated event that records the validated merge provenance, completion basis and waiver and enters Finalizing. Do not modify old slice merges, reopen an already merged slice, invent another merge, or append the malformed slice-merge event produced by the current generic transition. Subsequent finalization starts against the recovery's verified merge/source identity, and configured finalization modules continue to govern Complete. Normal features with a true feature-final merge retain their existing path.

The new operation must have a repeat-safe identity, clear preflight blockers, and journal replay support. Older governed features keep their pinned model and history until an explicit compatible migration or supported recovery adoption is performed. Upgrading the plugin alone must not alter their semantics. This feature fixes the plugin and supplies a reviewable recovery path; it does not authorize changing MyLifeMap's live feature journal in this work.

## Alternatives considered

- Mandatory clean advisory review: rejected; it adds a new blocking gate and can delay formal review without changing the final quality requirement.
- Formal Judge consuming advisory history: rejected; it compromises the agreed independent evaluation.
- Earlier formal Judge with fast verification only: deferred; the current Judge contract consumes full Verification evidence.
- Reusing formal PASS results across attempts: rejected in this feature; formal fingerprint and dependency semantics remain unchanged.
- Delaying all code review until the end: rejected; it moves a useful source of defect discovery late.
- Local-only advisory history or full transcripts: rejected; compact tracked evidence gives durable handoff support without transcript bulk.
- Automatically halting on repeated rubric failure: rejected as a default; recurrence is evaluated per underlying finding, with explicit project rules preserved.
- Increasing input limits or omitting source changes solely to fit: rejected; compact construction preserves scope and evidence access.
- Editing historical events or declaring the feature Complete after a tooling failure: rejected; recovery needs explicit authority, verified source and remaining finalization obligations.

## Constraints

- No implementation, specification or implementation plan before the design gate.
- The plugin protocol core remains the authority for preflight and passage.
- Formal Judge uses a fresh, read-only, isolated context with its configured capability standard. Failure to establish it leaves formal Judge unavailable/UNSET.
- Full applicable verification and CI on the reviewed source remain required by existing policy. Draft CI suppression and sharding are repository-specific practices; later source changes still require applicable CI.
- Preserve unrelated work in the primary checkout and the completed `tb-workflow-modules` record. Work uses the separate `tb-boundary-iteration-cost` worktree.
- Preserve source/target branch direction rules and explicit human merge authorization.
- Preserve historical model locks and immutable attempts. Upgrade/migration must be explicit for in-flight features.
- Configurable gate addition/removal/reordering and formal-evidence caching are outside this feature.

## Open risks

- Workflow-record filtering can hide production inputs if based on overly broad directory assumptions; allowed inputs and exclusions need explicit identities and validation.
- Raw decision journals may contain binding constraints absent from approved requirements; reconciliation must retain the approval boundary.
- Large text diffs and binary before/after access need bounded construction without dropping review material.
- Advisory reuse must account for every declared input and cannot trust path labels alone.
- Interrupted orchestration needs safe journal checkpoints and idempotence under uncertain execution outcomes.
- Finalization recovery changes protocol semantics; old model replay, waiver binding and prevention of false Complete claims need targeted verification.
- Different providers must enforce equivalent isolation and artifact visibility. No fallback may silently weaken those requirements.

## Changes

- 2026-10-12: Initial synthesis of D1-D16, including the updated handoff's finalization blocker.

**Approval record:** Trent approved the consolidated design, including packet compaction and feature-completion recovery, and authorized specification and planning in this chat on 2026-10-12.
