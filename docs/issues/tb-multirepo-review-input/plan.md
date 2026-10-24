# Plan - tb-multirepo-review-input

**Feature:** `tb-multirepo-review-input`
**Spec:** [spec.md](spec.md)
**Design:** [design.md](design.md)
**Interview:** [interview.md](interview.md)
**Created:** 2026-10-23
**Status:** approved for implementation (2026-10-23); native event `evt-model-led-plan-authorized-20261023`

## Inputs

The approved design controls architecture. The validated spec controls scope
and rubric; the interview supplies supporting rationale. Native events
`evt-model-led-design-approved-20261023` and
`evt-model-led-spec-validated-20261023` record the design/spec passages.
[spec-validation.md](spec-validation.md) records source pressure-testing.

## Strategy

Implement one coordinated breaking change in the existing isolated worktree.
Start with the core contracts and a narrow executable path through them, then
integrate evidence, execution and consumers before replacing distributed
instructions. Keep intermediate work local until the coherent current path is
reviewable. Do not publish half a cutover, preserve a legacy interpreter, or
build a migration/pilot framework.

Reuse useful mechanics such as trusted resolution, pinned source extraction,
receipts, atomic file publication primitives and provider isolation. Remove old
scheduling/state machinery where it no longer serves required proof. Update
outdated tests to assert current outcomes rather than keep obsolete behavior
alive for green tests. Preserve negative tests for integrity and authority.

The order below is an implementation strategy, not a new mandatory workflow
DAG. It can change within the approved scope. Begin at P1/P2, integrate storage
and validation before broad consumer cutover, and finish with actual local
runtime checks. Steps are not assumed to be independent shipping PRs.

## Steps

### P1. Define current contracts and inventory every retained obligation

**Advances:** R1, R2, R9, R17, R18, R19.

- Translate spec C1 into the current milestone/gate inventory, including
  Verification, spec assessment, Judge, pattern/code review, presentation,
  packet integrity and finalization. Record what is a semantic judgment, actual
  command fact or generated bookkeeping; preserve optional module policy.
- Define current schemas for obligation inputs, evaluator qualification,
  immutable results, applicability, delta assessment, human decisions and
  current-run activation. Separate original execution from current applicability.
- Probe installed host interception surfaces early. Record which actions can
  be intercepted and tested versus adapter-only/cooperative. Do not invent hook
  names or make unsupported hooks a hidden release blocker.
- Inventory CLI/desktop/native consumers of old graph fields and record the
  concrete replacements before removing fields.

**Code areas:** `plugin-src/shared/resources/protocol/model/`, `modules.js`,
`guards.js`, `projection.js`, `snapshot.js`; native hook manifests;
`apps/desktop/shared/contracts.js`, `main/module-policy.js`, renderer controls.

**Verification:** Contract/schema fixtures, full obligation inventory and host
capability notes. Fail missing obligations, invalid role combinations and
unsupported current-contract inputs explicitly.

### P2. Implement milestone core and repeat-safe current-run entry

**Advances:** R1, R2, R19, R20.

- Replace incidental execution-order state with authorized phase, current
  obligations, evidence applicability and milestone predicates.
- Add current-protocol resumption from approved documents and observable
  authority. Preserve old files as historical context; establish a new run under
  the logical feature and switch its active reference only after durable setup.
- Report exact missing authority/proof. Reuse unchanged planning intent where
  substantiated without replaying old events or restarting its interview.
- Reject unsupported old mutation requests with current resume guidance; do not
  add an old schema interpreter or automatic event migration.
- Keep failed/paused/stale state from blocking permitted diagnosis and repair;
  retain explicit project stop authority without a remediation-round cap.

**Code areas:** `feature.js`, `storage.js`, `journal.js`, `projection.js`,
`transitions.js`, `context.js`, `plugin-adapter.js`, `model.js`, `compatibility.js`.
Remove obsolete compatibility paths only after inspecting their call sites;
current-version identification is still needed.

**Verification:** Lifecycle, authority, resume/activation interruption and
idempotence tests. Include old locks, missing documents, unchanged requirements,
changed requirements, missing provenance and repeated resume after interruption.

### P3. Implement canonical local inputs, results and packet closure

**Advances:** R3, R4, R5, R6, R7.

- Resolve feature authority separately from selected application Git. Capture
  approved raw requirement bytes and typed evidence in immutable local bundles.
- Bind input identity through preparation, evaluator receipt, outcome admission
  and currentness checks. Handle multiple explicitly selected repository pins.
- Replace assertTracked/evidence-commit admission and Git-derived evidence
  finalization with validated local reference closure. Keep clean source/PR
  identity checks and reject post-review code drift.
- Publish complete inputs/results exclusively, reconcile orphan/partial writes,
  retain failures and report missing bytes accurately. Preserve explicit cleanup
  decisions without adding pruning or an archive service.

**Code areas:** `review-input.js`, `pinned-snapshot.js`, `advisory-storage.js`,
`artifact-publisher.js`, `execution-preparation.js`, `advisory.js`;
`resources/scripts/workflow_context.py`, `boundary_packet.py`, `pr_context.py`,
`feature_final.py` and callers in `boundary-retry.js`/finalization.

**Verification:** Resolver-to-packet integration across single repo and shared
parent with no Git, tracked Git and ignored records. Exercise symlinks, unsafe
paths, wrong feature/repository, raw-byte changes, concurrent capture, publication
failure, missing evidence and source drift. Inspect actual isolated input trees.

### P4. Implement evidence applicability and targeted delta admission

**Advances:** R10, R11, R12.

- Separate execution provenance and attempt bookkeeping from semantic input
  identity. Implement deterministic equivalence and retained-proof checks.
- Bind relevant source/tests, requirements, commands, config, dependencies,
  environment and consumed evidence; widen scope when relevance is unknown.
- Accept qualified delta assessments plus applicable earlier proof with explicit
  interaction coverage, current candidate and limits. Reject incomplete coverage.
- Compute final milestone coverage over applicable results; preserve old failures
  and missing evidence in history. Remove incidental event-ID invalidation.

**Code areas:** `fingerprint.js`, `boundary.js`, `projection.js`,
`execution-preparation.js`, `advisory-inputs.js`, `finalization.js` and schemas.

**Verification:** Mutation matrix for bookkeeping-only/source/shared helper/
lockfile/config/requirement/consumed evidence/external state. Assert launch counts
for true reuse and refresh; test cross-repository interaction coverage and
unavailable exact bytes. Do not equate a manifest assertion with semantic proof.

### P5. Simplify execution and provide independent review packets

**Advances:** R2, R8, R9, R13, R14, R21.

- Separate readiness declaration from requested discovery. Replace scheduler
  sequencing with operations that validate required inputs and execute chosen
  work. Generate IDs/requests/receipts and recover existing jobs on retries.
- Support one fresh independent code/spec evaluator execution with separate
  contract-validated verdicts. Keep other required evaluator roles and actual
  mechanical receipts visible and intact.
- Build bounded prior-review packets with source bindings, coverage, labeled
  claims, affected findings and fresh delta. Require new defect discovery under
  gate criteria; avoid re-reconciling every unaffected old finding.
- Preserve useful failure causes and existing execution measurements without
  a metrics service or extra benchmark gate.

**Code areas:** `agent-workflow-scheduler.js`, `agent-workflow-service.js`,
`agent-workflow-runtime.js`, `local-agent-adapters.js`, `advisory.js`,
`advisory-history.js`; `resources/agent-workflows/` schemas, prompts/validators;
CLI execution and desktop agent-workflow runner.

**Verification:** Fresh-context and role rejection tests, grouped verdict failure
cases, provider/job retry tests and representative review packets. Run an actual
local evaluator on a bounded fixture, retain the receipt and inspect the input;
fixture outputs alone do not establish functioning provider integration.

### P6. Implement scoped decisions and milestone action protection

**Advances:** R1, R15, R16, R17.

- Implement one semantic human decision operation with observable intermediate
  state, old/new requirements, exact action/risk scope and available provenance.
- Preserve FAIL/unavailable results with visible exceptions; require explicit
  policy amendment for non-waivable obligations. Refresh only affected proof.
- Bind acceptance/merge/completion to current candidate and authority. Represent
  actual external integration independently of quality and accepted exceptions.
- Connect protected adapters and supported host interception to the same core,
  fail closed for protected actions if checks are unavailable, and keep ordinary
  conversation/corrective work usable.

**Code areas:** `changes.js`, `boundary.js`, `transitions.js`, `finalization.js`,
`recovery.js`, `plugin-adapter.js`; `resources/scripts/pr_lifecycle.py` and
`merge_verified.py`; Codex/Claude hook manifests and owning scripts.

**Verification:** One-authorization retries/interruption, missing/ambiguous
provenance, scope drift, unauthorized merge, external merge observation, stale
source between preflight/action and unavailable-core tests. Verify source/target
branch direction guards and closed-PR policy survive. Run supported-hook smoke
and publish honest per-action coverage for both hosts.

### P7. Cut over CLI, native instructions and desktop consumers together

**Advances:** R9, R18, R19, R20, R21.

- Update CLI requests, native skills/commands and status views to the current
  operations, evidence and exception semantics. Remove compulsory advisory
  launches, redundant verification instructions and evidence commit ceremony.
- Remove desktop ordering controls and stale graph eligibility assumptions;
  render current obligations, accepted proof, missing evidence, exceptions,
  permitted operations and host coverage from core status.
- Preserve required module/finalization policy and useful diagnostics; remove
  obsolete old-protocol execution/replay and migration entry points.
- Update help and resume guidance, plus the real-project observation recipe.
  Report unknown cost/time honestly and avoid claiming improved quality before
  there is actual evidence from use.

**Code areas:** `cli/src/commands/`, `cli/src/agent-workflow/`;
`apps/desktop/main/`, `preload/`, `shared/contracts.js`, `renderer/`;
`plugin-src/shared/resources/{commands,policy}/`, native skills and `docs/`.

**Verification:** CLI/IPC/renderer contract tests, obsolete-field and instruction
inspection, local desktop runtime, keyboard/action smoke and native plugin status/
execution smoke. Include an unsupported old feature opening into resume guidance.

### P8. Build the coherent candidate and run end-to-end regression checks

**Advances:** R1, R3, R5, R6, R7, R8, R9, R12, R16, R17, R18, R19, R20.

- Stage canonical protocol into CLI/desktop and build plugin candidates through
  normal tooling. Do not edit installed caches or generated copies as source.
- Exercise the assembled current workflow from planning authority through review,
  accepted exceptions and observed integration/completion using isolated fixture
  repositories, including the parent-folder scenario that originated this work.
- Exercise current-run resumption and honest unsupported-host reporting on the
  built candidate. Use bounded local fixtures; no production or client-project
  mutation is needed for implementation acceptance.
- Run targeted suites as changes land, then the broad affected CLI/desktop/helper
  suites once the integrated candidate is stable. Preserve relevant safety tests
  while replacing tests whose only purpose was old orchestration compatibility.

**Verification commands:** Use Node >=22.12.0 (the earlier baseline used 24.18).
From `cli/`, `npm test` stages and runs CLI tests; from `apps/desktop/`, `npm test`
stages protocol, builds renderer and runs desktop tests. Build plugins using
`node cli/bin/workflow.js plugin build` with local candidate output options from
current help. Run affected Python helper tests from their owning test entry
points. Record exact commands and outputs; these commands are planned, not run
by this documentation turn.

### P9. Evaluate the complete rubric and prepare the review boundary

**Advances:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21.

This is the final verification step. Evaluate every row on the exact candidate;
record independent assessments and actual runtime evidence, reconcile issues,
triage decisions and prepare the normal closed-PR review packet when authorized.
Make limitations and exceptions explicit. Do not claim a test ran because an
operation was planned or merely launched.

Use the installed governing protocol while preparing this implementation; the
new implementation does not certify itself by rewriting this feature's journal.
If local cutover is subsequently authorized, resume through the reviewed current
entry, preserving this record. Publish/install/merge requires the applicable
separate authority. After actual project use, record concrete friction, escaped
defects and rework without a new pilot or fixed improvement gate.

## Delivery and verification boundaries

Recommend one coherent reviewable cutover for these mutually dependent contracts
and consumers. Local commits can be incremental; no per-commit gate is added.
If review size later warrants separate PRs, define coherent slices without
restoring a long-lived compatibility path or weakening the rubric. This plan
creates no PRs or runtime slices by itself.

The main engineering risks are incomplete consumer removal, unsafe resume
activation, overbroad evidence reuse, history leakage and inaccurate hook claims.
P1 identifies those interfaces; P2-P7 implement the contracts; P8/P9 verify the
assembled behavior. No external tracker posting, production action, public
release, remote activation or old-record cleanup is part of this planning turn.
