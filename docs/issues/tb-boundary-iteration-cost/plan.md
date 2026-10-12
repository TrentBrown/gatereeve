# Plan - tb-boundary-iteration-cost

**Feature:** `tb-boundary-iteration-cost`
**Spec:** [spec.md](spec.md)
**Design:** [design.md](design.md)
**Interview:** [interview.md](interview.md)
**Created:** 2026-10-12
**Status:** implementation authorized; S1 integrated, S2 implemented locally and preparing formal review

## Inputs

- `spec.md` controls behavior, failures and rubric mapping. [Spec validation](spec-validation.md) is PASS and protocol `validate-spec` is recorded.
- Approved `design.md` controls architecture, scope and boundaries.
- `interview.md` D1-D16 supplies examples, authority and retention decisions.
- Primary handoff: `/Users/trent.brown/Code/tb/gatereeve/docs/handoffs/boundary-efficiency.md`, including item 8. The supplied MyLifeMap handoff path does not exist.

## Strategy

Implement in the isolated worktree `/Users/trent.brown/.codex/worktrees/boundary-iteration-cost/gatereeve`, branch `tb-boundary-iteration-cost`, from original feature base `ef725bbedfda28be0967fefde6cf2748679612c2`. The primary checkout and completed workflow-modules record remain separate.

Build shared review-view and compact-input mechanics first. Deliver the source-bound recovery path immediately afterward so completion recovery is not held until every advisory/orchestration change is finished. Then add advisory execution and finally connect readiness/retry procedures across portable adapters. Preserve the formal graph's Verification dependency and currentness semantics throughout.

Source changes belong in `plugin-src/shared/` and registered plugin contracts. CLI and Desktop consume staged/package outputs; use their staging scripts rather than editing generated copies or installed Codex/Claude caches. Existing provider launchers enforce fresh context, capability and read-only access; reuse their contract where possible, with separate advisory preparation so no formal attempt/gate is manufactured.

## Steps

- **P1. Define and implement review input identity and formal history exclusion.** Introduce shared review-view/input-manifest mechanics that bind original commit, approved requirement files, source/test/config/dependency inputs, permitted test evidence, scope/capability/policy and the filtered snapshot. Formal preparation excludes validated advisory artifacts, raw decision/event journals and earlier review reports from supplied documents, diff and snapshot access; current verification remains permitted. Resolve aliases/symlinks and reject unsafe or ambiguous classification rather than hide arbitrary production inputs. Keep exclusion receipts outside the Judge's view. Missing binding requirements block reconciliation against approved documents; no automatic narrative-to-requirement promotion. Preserve older model behavior until explicit adoption. **Advances:** R4, R5, R10, R18, R22.

- **P2. Replace aggregate review payload construction with bounded referenced evidence.** Refactor `pinned-snapshot.js`, `agent-workflow-service.js` and their input/receipt consumers to construct compact manifests and referenced text diffs without assembling the complete payload as one bounded JSON field. Deduplicate identical slice/feature payloads, detect renames, retain old/new identities and binary material through digest-bound accessible files, and preserve exact review ranges and relevant inventories. Attribute primary feature focus from verified slice provenance without changing whole-feature scope. Capture before/after metrics on generated scratch repositories, including 905 files and at least 24 MiB of review material, mixed-feature shared-file merges and binary create/change/delete cases. **Advances:** R15, R16, R17, R18, R24.

- **P3. Add guarded post-merge finalization recovery and compatible replay.** Add a semantic `feature.recover-finalization` operation with a dedicated event (proposed `FEATURE_FINALIZATION_RECOVERED`), stable recovery identity, trusted evidence/currentness preflight and no-write rejection. Verify accepted recorded merges against the exact selected integrated source; check no pause/blocker/unresolved delivery. Bind explicit applicable human-confirmed waiver evidence to feature, approved requirements, Judge obligation and source. Validate remaining whole-feature verification/spec/retention obligations without relabelling slice-only reports. Extend finalization-anchor resolution and replay to accept this dedicated validated recovery while retaining normal feature-final merge behavior and configured modules. Provide explicit migration/adoption preview for older records; select compatible model/core version identities and update selectors/digests only through normal source/version mechanics. Do not repair MyLifeMap's real journal in this feature. **Advances:** R19, R20, R21, R22, R23.

- **P4. Add isolated advisory review, compact retention and readiness checks.** Implement a portable advisory preparation/execution path outside formal boundary attempts, with shared provider contract and same formal applicability, scope and capability. Launch from explicit readiness declarations after fast/focused checks. Add structured readiness/findings/unavailable outputs, compact immutable tracked records (proposed `advisory/<run-id>/review.json` with declared supporting files), prior finding checklists and defect-class analysis records. Determine underlying finding identity rather than rubric-only identity; validate revised readiness and changed approach after recurrence. Reuse clean advisory results only after deterministic comparison of the complete P1 input manifest; evidence-only changes do not update formal fingerprints. Classify errors and allow one transient retry while preserving immediate unavailable handling for persistent config/isolation problems. Register a discoverable advisory skill/resources through the workflow inventory if a new invocation surface is needed. **Advances:** R1, R2, R3, R6, R7, R8, R9, R10, R11, R23.

- **P5. Implement repeat-safe boundary retry orchestration and late presentation.** Add a portable retry helper invoked after implementer fixes/readiness. Reuse existing `pr_lifecycle.py`, context, gate, packet and plugin-adapter contracts via structured requests. Record stable checkpoint IDs before uncertain mutations and reconcile recorded events/current PR identity before replay; use fresh attempt identity without carrying old formal PASS results. Preserve branch direction, PR closure policy, human review/merge authority and currentness. Retain early code-review/spec findings, and generate final Explain Diff/narrative/consolidated summaries only on the clean substantive path. Surface actionable blockers and partial-progress state. **Advances:** R3, R12, R13, R14, R23, R24.

- **P6. Integrate portable adapters, packaged resources and workflow guidance.** Update canonical `WORKFLOW.md`, command procedures, Judge prompt/schema/evaluator bindings, `PROTOCOL.md`, module-contract docs and relevant skill adapters. Ensure Codex/Claude invoke shared advisory, retry and recovery semantics without requiring the optional PATH CLI or Desktop. Wire CLI convenience commands and Desktop's shared runner where relevant without adding a configurable-ordering UI. Register required resources in `workflow-inventory.json`; maintain exact module version/digest selectors and compatible feature adoption. Stage CLI/Desktop copies and validate Codex/Claude package candidates and integrity. Document repository-specific draft CI suppression/sharding as options while requiring applicable checks on later source changes. **Advances:** R2, R4, R5, R7, R8, R11, R12, R13, R19, R21, R22, R23, R24.

- **P7. Exercise the complete journeys and produce evidence for the full rubric.** Rehearse readiness -> advisory failure -> defect-class remediation -> clean or reasoned bypass -> formal boundary -> interruption/resume -> current review artifacts, plus already-merged recovery -> required finalization -> Complete. Include negative cases and older-record replay. Record structural cost metrics: stored/inline review bytes, duplicated payload count, number of full formal preparations before advisory defect discovery, and bookkeeping operations. Label historical wall-clock estimates and distinguish fixture/provider-contract evidence from any live provider rehearsal. Finish full scoped verification, spec evaluation, independent Judge and formal boundary with the exact selected source; create completion evidence without implying merge/release/real-feature recovery occurred. **Advances:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24.

## Delivery slices

| Slice | Work | Primary rubric | Dependency | Review scope |
|---|---|---|---|---|
| S1 - Review view and compact inputs | P1, P2, scoped P6 packaging | R4, R5, R10, R15-R18, R22, R24 | none | SLICE |
| S2 - Post-merge recovery | P3, scoped P6 operation/guidance | R19-R23 | S1 integrated | SLICE |
| S3 - Advisory discovery | P4, scoped P6 adapters/resources | R1-R3, R6-R11, R23 | S1 integrated; starts from updated integration after S2 | SLICE |
| S4 - Retry integration and full-feature proof | P5, remaining P6, P7 | R12-R14, R23-R24 plus all feature criteria | S2 and S3 integrated | FEATURE_FINAL |

Each later slice begins from updated integration on a fresh delivery branch containing the stable feature ID. Every slice passes the existing governed review and exact-head human merge boundary. No development branch is merged or rebased into another branch. Slice proposal/state transitions wait for implementation authorization and actual readiness.

## Code areas and tests

| Area | Expected source touchpoints | Verification focus |
|---|---|---|
| Input view/packet | `protocol/pinned-snapshot.js`, `agent-workflow-service.js`, `agent-workflow-runtime.js`, new shared view/manifest helper | `cli/test/pinned-snapshot.test.js`, `agent-workflow-service.test.js`, `agent-workflow-contract.test.js`, `agent-workflow-runtime.test.js` plus generated large/binary/mixed-feature fixtures |
| Advisory | shared protocol preparation/runtime and `resources/agent-workflows/`, native provider bindings, optional new skill | new advisory integration/record/reuse tests; existing provider isolation/capability tests |
| Recovery | `protocol/constants.js`, `model/workflow-model.json`, guards, finalization, projection, journal, adapter/index/snapshot and CLI operations | `cli/test/finalization.test.js`, `boundary-protocol.test.js`, `plugin-adapter.test.js`, `snapshot.test.js`, old model/migration fixtures |
| Retry | portable script(s), PR/context/gate/packet adapters | Python tests for boundary context/gate/packet/lifecycle plus interruption and no-write fixtures |
| Packaging/hosts | inventory/selectors, canonical commands/skills, CLI stage script, Desktop shared runner/stage script | plugin build/integrity tests, adapter parity and Desktop stage/protocol/runner tests |

New helper/resource filenames above are proposed implementation locations, not claims that those files already exist. Node/npm dependencies are installed only in the intended worktree if needed; no source checkout is swapped beneath another running task.

## Verification

Use targeted tests as each behavior is implemented. Required high-value cases include history sentinel leakage through every input route, missing approved constraints, malicious/mislabelled evidence paths, each changed advisory input class, duplicate readiness, code FAIL versus unavailable, transient retry exhaustion, underlying recurrence, PR/context movement, crash after uncertain journal/PR mutations, binary before/after corruption, mixed features touching the same file, ambiguous historical waiver, fake integration proof, active/paused/blocked recovery, unchanged old journal replay, duplicate recovery and required finalization modules preventing premature Complete.

Planned commands, run from this worktree when source exists:

```bash
node --test cli/test/pinned-snapshot.test.js cli/test/agent-workflow-service.test.js cli/test/agent-workflow-runtime.test.js
node --test cli/test/finalization.test.js cli/test/boundary-protocol.test.js cli/test/plugin-adapter.test.js cli/test/snapshot.test.js
python3 -m unittest discover -s plugin-src/shared/resources/scripts/tests
npm test --prefix cli
npm run check --prefix apps/desktop
bash ci/portable-acceptance.sh
```

The portable acceptance script supplies the repository's package/candidate/integrity checks; use its canonical commands rather than inventing a release/publisher action. New scoped tests are added to the above verification ladder as their paths are created. A live provider rehearsal, when available, remains explicitly labelled and does not replace fixture failure coverage.

At the final boundary run branch-document lint/triage, full rubric evaluation, pattern review when applicable, code review, independent formal Judge, current Explain Diff and packet validation through the governing model. Signing, publication, installed-version validation and invoking recovery on a real external feature are later separate operations under their existing authority boundaries.

## Authorization boundary

The design is approved, the spec is validated, and Trent approved this implementation plan in the active chat. The protocol recorded implementation authorization before S1 started. Every slice still requires review and explicit authorization of its exact reviewed head before merge; release and applying recovery to a real external feature remain separate operations.
