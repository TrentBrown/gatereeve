# Pr Boundary

Read `<plugin-root>/resources/PROTOCOL.md` for the current operation/input contract.

Prepare a pinned candidate from clean application source and current approved
requirements. Declare readiness explicitly; this launches no evaluator. Choose
the order of requested checks and reviews. Execute every required obligation
through `gate.execute`; spec and Judge consume actual Verification evidence.
One fresh code/spec execution may return both separate verdicts. Judge remains
separate. Reuse applicable proof or request targeted independent delta review
covering changed code and interactions. Preserve supported new findings.
Reconcile records, triage decisions, produce the explanation and validate packet
reference closure. `milestone.check/pass` acceptance enforces required proof or
scoped exceptions. Present exact candidate and risks for human acceptance unless
an applicable recorded standing acceptance grant already covers this work.
When all required gates PASS, use `authorization.apply` with that grant's event
hash to record exact candidate acceptance. A standing grant never waives a gate.
Use configured PR closure policy; only reopen inside an explicitly authorized
protected merge. `merge.prepare` produces the action; `human.decide` records the
actual authorization, or `authorization.apply` derives the exact action from an
explicitly permitted standing merge grant. Acceptance-only permission cannot
merge. `merge.execute` rechecks gates and authority before execution, including
slice PRs and the final PR. Deployment remains separately authorized. Open
drafts are default; closed drafts require explicit repository configuration. No automatic
remediation-round limit or evidence-commit requirement applies.
