# Spec - tb-boundary-iteration-cost

**Feature:** `tb-boundary-iteration-cost`
**Created:** 2026-10-12
**Design:** [Approved design](design.md)
**Interview:** [Interview D1-D16](interview.md)

## Summary

Reduce the cost of reaching a formal independent PR review through advisory discovery, safer remediation, compact tracked evidence, deferred presentation and guarded retry orchestration. Support bounded large reviews and sanctioned feature-finalization recovery after a waived whole-feature Judge and slice-scoped final merge.

## Definition of Done

The global workflow Definition of Done applies. These criteria describe feature behavior, not substitutes for required review, CI, merge or release authority.

## Scope and terminology

- **Readiness declaration:** the implementer's explicit indication that planned slice work and fast/focused checks are complete; ordinary commits/edits are not declarations.
- **Reviewed inputs:** versioned manifest of all source, test, build/config/dependency, approved-requirement, review scope/capability/policy and declared test-evidence inputs used by a run. A changed input prevents advisory reuse even when the new commit is labelled evidence-only.
- **Substantive checks clean:** applicable defect-finding checks have no unresolved blocking finding; required formal checks must ultimately have current nonblocking outcomes under existing policy. Optional advisory bypass does not waive them.
- **Operational unavailable:** execution could not establish a valid review because of provider/configuration/isolation/schema/publication failure; it is separate from a supported code failure.
- **Recovery source:** the exact integrated commit selected and verified against accepted slice merge provenance. A historical waiver must explicitly cover this feature/obligation and be unambiguously applicable when bound to the source and approved requirements; fresh human confirmation resolves ambiguity.
- **Portable:** shared plugin resources run through native Codex/Claude adapters; optional CLI and Desktop do not define authority or prerequisites.
- The source remains the assembled product for whole-feature review; feature focus attribution never silently changes the selected base/head range or hides relevant shared changes.

## Acceptance Criteria

- **AC1.** At the same applicability and scope as formal Judge, a slice-readiness declaration after fast/focused checks automatically launches an isolated advisory review of pinned source. Clean means ready for formal review with full verification pending. A retained source-bound reason allows proceeding without a clean result; advisory output never certifies a formal gate.
- **AC2.** The formal Judge independently sees approved requirements, relevant code/tests and current formal verification. Advisory history, raw journals and earlier reviews are excluded from input, diff and repository view. Approved-document reconciliation supplies missing binding requirements; original and filtered source identities remain auditable.
- **AC3.** After advisory or formal code failure, revised readiness requires defect-class analysis and coverage. Advisory reruns receive prior findings, check fixes and evaluate the full scope for new defects. Recurrence requires a changed approach, with explicit project stop/escalation rules preserved and no new default count halt.
- **AC4.** Compact source-bound advisory records are tracked without full transcripts. Clean advisory results remain usable only after deterministic proof that every declared input is unchanged across evidence-only edits. One transient retry is allowed; persistent configuration/isolation failure or exhausted retries is unavailable and can be bypassed with a recorded reason.
- **AC5.** Early code review/spec assessment records defects before final presentation. Final presentation waits for substantive checks to be clean. A single retry entrypoint after implementer fixes/readiness handles exact-PR reuse, fresh formal context/attempt, protocol recording and recoverable bookkeeping while preserving guards, human authority and formal freshness.
- **AC6.** Review input is a compact inspectable manifest with bounded referenced text and binary evidence. Large whole-feature reviews, duplicate patches and renames preserve the exact pinned scope, relevant changed-file inventory, substantive edits, old/new evidence and access to the assembled product and shared code. Production changes are not silently omitted to reduce size.
- **AC7.** An already merged feature whose final delivery was reviewed at slice scope can enter Finalizing through a dedicated guarded recovery operation when the exact integrated source, accepted merges, explicit applicable whole-feature Judge waiver, remaining whole-feature evidence and retention are proven. History is preserved, rejection writes nothing, recovery is repeat-safe and normal finalization obligations still govern Complete.
- **AC8.** The portable plugin exposes consistent advisory/retry/recovery contracts and guidance to Codex and Claude, with stable actionable results and explicit compatible adoption for older features. Existing normal feature-final review and closeout behavior remain valid; packaging contains all resources. A reproducible report measures structural cost reduction without promising unmeasured model latency.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1: Readiness trigger and applicability | One readiness declaration launches advisory review iff formal Judge applies; ordinary edits do not launch it; each revised declaration selects the revised pinned source. | Missing, duplicate, per-edit or mismatched-scope/applicability launch. | Trigger/adapter tests with applicable, inapplicable and revised-source fixtures. |
| R2 | AC1: Advisory isolation and evidence | Fresh context with zero inherited turns, read-only pinned access, denied network and formal capability standard; approved requirements plus source/tests and fast/focused results; full verification explicitly pending. | Weaker isolation/capability, wrong source/scope or implied full verification success. | Provider contract tests and an isolation/input receipt fixture. |
| R3 | AC1: Readiness outcome and nonblocking bypass | Clean result is READY_FOR_FORMAL_REVIEW; proceeding without it retains a nonempty source-bound reason; no advisory result creates a formal PASS or waiver. | Clean advisory represented as certification, bypass without retained reason, or formal state advanced by advisory. | Outcome and bypass integration tests; journal comparison. |
| R4 | AC2: Formal Judge history exclusion | Advisory records, bypass reasons, raw journals and prior reports are absent from formal input, diff content and snapshot paths, while current permitted evidence remains available. | History visible through any route, including rename/symlink/path alias, or required production content hidden. | Sentinel exclusion tests across prompt, patch and filesystem, including adversarial paths. |
| R5 | AC2: Approved requirements and audited filtered identity | Binding requirements come from approved spec/design; absent requirements produce a reconciliation blocker; receipt binds original source and filtered view; audit exclusions are retained outside Judge access. | Unapproved journal summary becomes authoritative, missing constraints silently accepted, or view identity unverifiable. | Requirement-reconciliation and receipt-validation fixtures. |
| R6 | AC3: Defect-class remediation | Failure records include invariant, affected mutation/transition paths and regression coverage for related failures found before revised readiness; a code failure cannot be treated as an operational error. | Only first example repaired without class analysis, false readiness or missing related regression evidence. | Readiness validation fixtures and remediation procedure review. |
| R7 | AC3: Complete advisory rerun review | Rerun receives bound prior advisory/formal findings as a fix checklist, checks their resolution and assesses every in-scope criterion for new findings. | Checklist replaces scope review, prior verdict accepted as proof or finding history leaks into formal Judge. | Advisory input/output coverage tests and reviewer prompt fixture. |
| R8 | AC3: Recurrence and broader findings | Prompts request all supported findings identified; recurring underlying finding requires failed-fix explanation and changed approach; distinct findings under one rubric ID are separate; explicit stop rules/escalation remain. | First-finding-only default, rubric-ID recurrence identity, new count-based halt or project rule silently removed. | Finding-identity/readiness fixtures and workflow instruction checks. |
| R9 | AC4: Compact durable advisory retention | Each tracked immutable run record retains source/input identity, findings/outcome, errors and applicable remediation/bypass information without full transcripts; survives a fresh worktree read. | Missing identities, overwritten history, local-only requirement or full transcripts as feature artifacts. | Artifact schema tests and fresh-checkout/handoff fixture. |
| R10 | AC4: Verified evidence-only advisory reuse | Reuse succeeds after proven evidence-only changes with unchanged declared review inputs; fails after source, tests, build config, dependency, approved requirement or declared evidence changes. | Reuse based solely on path/message, incomplete input binding or stale result accepted. | Mutation matrix covering each input and misleading evidence paths. |
| R11 | AC4: Advisory errors and one retry | Transient errors allow at most one automatic retry; persistent config/isolation errors are unavailable immediately; exhaustion supports recorded bypass, never a code FAIL or formal PASS. | Unbounded/futile retries, unavailable mistaken for a defect, or formal fallback weakened. | Transient/persistent/isolation fault-injection tests. |
| R12 | AC5: Discovery before presentation | Code review and spec assessment retain early findings; Explain Diff, final narrative and consolidated summaries wait until substantive checks are clean; required formal artifacts exist before human review. | Presentation generated on failing default path, early discovery skipped, or formal artifacts omitted. | Orchestration trace fixtures and updated procedure review. |
| R13 | AC5: Guarded retry orchestration | After implementer remediation/readiness, one entrypoint reuses the exact PR, resolves current context and records a fresh formal attempt/results through the protocol while respecting closure, direction, human authority and currentness. | Wrong/new PR, unsafe direction, guard bypass or helper owns unapproved code fixes. | Python/JS integration fixtures for PR/context/guard failures. |
| R14 | AC5: Interruption recovery and formal freshness | Interrupted orchestration resumes without duplicate attempts/events/publications; uncertain outcome is reconciled before retry; old formal PASS cannot be copied into a fresh attempt. | Duplicate or partial misleading passage, unsafe uncertain retry, or stale formal evidence accepted. | Checkpoint/crash injection and fingerprint/dependency regression tests. |
| R15 | AC6: Large bounded review construction | A generated whole-feature fixture with at least 905 changed files and at least 24 MiB of total review material constructs digest-bound referenced inputs and starts review preparation without aggregate 12 MiB rejection or loading all patch payloads into one JSON field. | Aggregate-size failure, missing material, or merely raising the old limit. | Generated scratch-repository integration test with size/construction metrics. |
| R16 | AC6: Patch deduplication and rename representation | Identical feature/slice content has one retained payload; rename fixture retains old/new paths and substantive edits without full duplicate delete/add bodies. | Duplicate identical payloads, lost edits/paths or misleading rename classification. | Pinned-snapshot tests and before/after text-byte metrics. |
| R17 | AC6: Binary before/after evidence access | Binary changes retain paths, old/new identities and digests, with verifiable actual content accessible as required in the immutable snapshot; no inline encoded binary payload in review text. | Missing old/new evidence, wrong digest, inaccessible required content or encoded duplication. | Binary create/change/delete fixtures and evidence-integrity tests. |
| R18 | AC6: Whole-feature scope and shared-code preservation | Exact selected base/head, complete relevant source inventory and full assembled product remain inspectable; verified slice provenance provides primary focus without silently excluding unrelated integrated production changes or shared dependencies. | Range changed to fit, omitted production files, stale attribution or feature focus presented as complete isolation. | Mixed-feature merge fixture with overlapping files, shared dependencies and scope assertions. |
| R19 | AC7: Source-bound recovery authority and remaining evidence | Recovery requires an explicit applicable human-confirmed whole-feature Judge waiver bound to feature/approved requirements/exact verified integrated source, accepted merge provenance, and demonstrated remaining whole-feature verification/spec/retention obligations. | Tooling failure/general proceed/slice PASS substituted for waiver, ambiguous/mismatched authority, forged merge claim, or scope-only relabeling. | Recovery positive/negative fixtures for current and historical waiver evidence. |
| R20 | AC7: Recovery blockers | Paused/blocked feature, active or unresolved delivery, missing accepted review, missing remaining evidence, invalid retained content, wrong source or unsupported model prevents recovery without appending an event. | Any rejected recovery changes the journal or bypasses an unmet obligation. | Preflight and no-write rejection matrix. |
| R21 | AC7: Dedicated recovery event and normal closeout | Valid recovery appends one dedicated repeat-safe event entering Finalizing, preserves previous events and source provenance, and binds ordinary configured finalization modules to that source; Complete still requires those modules. | Old merge edited/replayed, fake merge added, wrong input SHA, premature Complete or ordinary final path regressed. | Replay/idempotence and finalization integration tests with required modules. |
| R22 | AC8: Historical compatibility and explicit adoption | Older model locks/journals replay unchanged; installed upgrade does not silently migrate feature/module semantics; recovery adopts compatible new semantics explicitly and preserves historical attempts. | Old record unreadable, implicit adoption, reinterpreted old outcomes or migration destroys prior evidence. | Frozen older-model fixtures and migration-impact/adoption tests. |
| R23 | AC8: Portable invocation and observable errors | Codex and Claude skill adapters reach the same portable contracts via plugin-local resources, without requiring optional PATH CLI or Desktop; failures/readiness/recovery preflight expose actionable stable states. | Provider-specific semantics, missing packaged resource or optional host required. | Plugin build/integrity and adapter parity tests. |
| R24 | AC8: Consistent workflow guidance and measurable cost | Shipped instructions agree on advisory/formal roles, requirements visibility, error/remediation rules, retry and recovery; measurement report records size reduction and avoided formal preparation on advisory failure, labels historical time estimates and makes no unsupported latency claim. | Contradictory ordering/authority guidance, missing resource registration, or claimed savings unsupported by trace/metrics. | Documentation/inventory validation and deterministic orchestration/packet benchmark report. |

## Evidence boundaries

All acceptance/rubric evidence for this source change is obtainable before its merge using local deterministic fixtures, read-only source snapshots, provider/host contract tests, packaged plugin candidates and retained measurements. No criterion requires production credentials, signing, public publication, or mutating the existing MyLifeMap feature. The completed-feature recovery scenario is reproduced in isolated fixture journals and scratch Git repositories.

A bounded live provider rehearsal, if available, is supplementary runtime evidence; fixture results alone must not be described as successful installed-provider execution. Release publication and applying recovery to another real feature remain separate authorized operations after this feature is delivered.

## Traceability

- AC1 -> R1-R3; design sections 1 and 2; interview D2, D4, D5.
- AC2 -> R4-R5; design section 4; interview D3, D8, D14.
- AC3 -> R6-R8; design section 2; interview D6, D7, D13.
- AC4 -> R9-R11; design section 3; interview D8, D9, D11.
- AC5 -> R12-R14; design sections 5 and 6; interview D10, D12.
- AC6 -> R15-R18; design section 7; interview D15.
- AC7 -> R19-R21; design section 8; interview D16 and the approved recovery synthesis.
- AC8 -> R22-R24; design constraints and sections 6-8; D1 and approved compatibility/measurement obligations.

## Out of scope

Configurable gate enablement/ordering/parallelism UI, moving formal Judge ahead of full Verification, caching/reusing formal PASS outcomes across attempts, modifying MyLifeMap's real journal, protected merges and release publication.

## Changes

- 2026-10-12: Initial specification derived from the approved design and D1-D16. No original criteria have been removed or weakened.
