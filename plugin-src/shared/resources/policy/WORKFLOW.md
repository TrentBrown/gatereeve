# Software development workflow

GateReeve preserves a planning backbone and enforces required milestone gates.
Load `<plugin-root>/resources/PROTOCOL.md` for current operations. The protocol core is authoritative
for passage; a prose statement cannot replace missing evidence or authorization.

## Planning backbone

Interview the user on material design decisions, one question at a time where
needed. Maintain `interview.md`; synthesize `design.md` when the interview ends.
Obtain explicit design approval before drafting `spec.md`. Derive observable AC
and a binary rubric. Review semantic consistency and feasible evidence boundaries,
then validate its extracted identities and references. Produce useful `plan.md` steps
and `issues.md` work/status records. Trace coverage at feature level; supporting
tasks do not each need artificial rubric mappings. Existing independent reviews
assess completeness, testability and material decision dispositions. Record the user's implementation
approval against the exact current design/spec/plan/issues commitments.

Use the trusted workspace resolver. A parent folder may own shared documents for
several nested repositories without being a Git repository. Git tracking of
requirements/evidence is optional. Never create a repository or change ignore
policy to satisfy a gate. Preserve source control for the application itself.

## Authorized work

Within the authorized phase the model chooses execution order, batching, tests,
remediation and delegation consistent with user/host instructions. Readiness does
not launch review. Explicit execution requests do. There is no automatic retry
round cap; change approach when repeating a failure and respect human stop rules.
Keep issues, tracker and decision notes useful without generating ceremony on
each commit. Ordinary commits do not require milestone passage.

Required acceptance uses source/context, actual Verification, one fresh
independent acceptance assessment (`review`) and packet integrity. The assessment
covers code, approved requirements, evidence/CI scope, project rules, material
decisions, findings/fixes and the human explanation. Separate code/spec/Judge
sessions are supplemental choices. Whiteboard remains opt-in. Use actual runner
receipts and fresh evaluator execution, never implementer-authored PASS records.

The test pyramid guides agent decisions: quick focused checks early, broader
checks when changed behavior requires them, actual broad CI scope or an explicitly
assessed local alternative at acceptance. Agents may depart from this heuristic.
Encourage additional independent models for consequential changes, uncertainty,
repeated misses or divergent conclusions; do not run them automatically each round.
Batch supported findings before returning. Record strategy, rerun reasons, fixes
and friction in workflow memory during existing work, without a new approval gate.

Reuse exact qualifying proof while its relevant inputs remain equivalent. An
independent delta can supplement earlier proof only with changed-scope and
interaction coverage. Reviewers receive bounded prior findings and labeled claims;
they still search for new defects. Preserve original failures and limits. Unknown
scope needs fresh/wider evidence. Generate mechanical records through operations.

## Milestones and authority

- Begin implementation: approved design, validated spec, plan/issues and current
  implementation authority.
- Enter human acceptance: all required current gate proof or authorized scoped
  exceptions, plus validated retained review packet.
- Merge: current acceptance and expressly authorized exact source/target action,
  either directly approved or derived from a valid scoped standing merge grant.
  Respect PR closure and branch-direction policy; never reopen to help a reviewer.
- Completion: whole-feature acceptance, actual integration, required finalization
  proof and verified local evidence retention.

Record one concrete human decision with its actual quote/context and available
provenance. It may cover multiple expressly named actions. Do not ask again for
the same unchanged authorization. Waivers retain FAIL/UNAVAILABLE and accepted
risk separately. Amendments retain old/new requirements and refresh affected
proof. The latest amendment supersedes old direct approvals even after a byte rollback. Explanation exceptions require an explicit policy amendment; enabled Whiteboard ordinarily requires an explicit non-behavioral classification with retained evidence. Integrity, truth and authority cannot be waived. Merge/deploy/release
permission must be explicit; implementation approval does not imply them.

## Current resumption and reporting

Resume old work through `run.resume-current` using preserved documents and observed
approvals. Old runtime files stay intact as historical context; no old interpreter,
automatic converter or re-interview of unchanged planning is used. Missing authority
or unsupported evidence is reported precisely and refreshed under current rules.

Record decisions in scratchpad/decisions and checkpoint after milestones or before
context loss. Checkpoints are resumption aids, not extra phases. At a review
boundary, report actual build/lint/tests/runtime verification, rubric outcomes,
accepted exceptions and remaining limits. Do not claim completion with unfinished
scope. Install/publish/merge retains its separate authorization.

Use real-project experience to improve the workflow. Report available elapsed
execution time, token/cost data, friction, escaped defects and rework honestly;
unknown metrics are unknown. No benchmark threshold, pilot or extra audit gate is
required before adopting the current protocol.

## Standing permission for unattended delivery

Record explicit acceptance-only or acceptance-plus-merge permission through
`human.decide` (`authorize-standing`) with the scope in PROTOCOL.md. Apply it
per candidate through `authorization.apply` only after all required gates PASS.
This can cover slice and final PRs without repeating the same human question.
Keep merge permission explicit and deployment separately authorized. Revocation,
expiry and changed scope invalidate further use. Open drafts remain the default;
client-specific closed drafts are an explicit repository setting.

Execution profiles, reuse, recovery, source/artifact acceptance and safe upgrades
follow `resources/DELIVERY-EXECUTION.md`. Status observations cannot create proof.

## Measurement during implementation and validation

For agent-selected test/build commands, use the lightweight wrapper described in
`resources/PERFORMANCE.md` (CLI `metrics run`, or the plugin-local wrapper when
CLI is absent). Choose tests freely within the authorized phase. Do not rerun
checks just to obtain metrics. Measurement failure does not block the command;
report capture gaps. Formal runner jobs are already observed and need no extra
outer wrapper. Reports are advisory and never grant gate passage or reuse.
