# Software development workflow

GateReeve preserves a planning backbone and enforces required milestone gates.
Load `<plugin-root>/resources/PROTOCOL.md` for current operations. The protocol core is authoritative
for passage; a prose statement cannot replace missing evidence or authorization.

## Planning backbone

Interview the user on material design decisions, one question at a time where
needed. Maintain `interview.md`; synthesize `design.md` when the interview ends.
Obtain explicit design approval before drafting `spec.md`. Derive observable AC
and a binary rubric. Review semantic consistency and feasible evidence boundaries,
then validate the spec. Produce `plan.md` with stable steps mapped to rubric rows,
and `issues.md` with work/status mapping. Record the user's implementation
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

Preserve all required acceptance obligations: source/context, reconciliation,
Verification, spec assessment, pattern review, independent Judge, code review,
decision triage, explanation and packet integrity. One fresh evaluator independent
of the implementer may assess code and spec with separate verdicts. Judge remains
required. Optional whiteboard is selected by current run policy. Use actual runner
receipts and native evaluator execution, never implementer-authored PASS records.

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
- Merge: current acceptance and expressly authorized exact source/target action.
  Respect PR closure and branch-direction policy; never reopen to help a reviewer.
- Completion: whole-feature acceptance, actual integration, required finalization
  proof and verified local evidence retention.

Record one concrete human decision with its actual quote/context and available
provenance. It may cover multiple expressly named actions. Do not ask again for
the same unchanged authorization. Waivers retain FAIL/UNAVAILABLE and accepted
risk separately. Amendments retain old/new requirements and refresh affected
proof. Integrity, truth and authority cannot be waived. Merge/deploy/release
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
