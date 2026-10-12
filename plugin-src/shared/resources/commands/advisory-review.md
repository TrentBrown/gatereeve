# Slice Readiness Advisory

Use after the implementer explicitly declares the active slice ready, having
completed fast checks and focused tests. Apply wherever the pinned formal Judge
applies, with its exact slice/whole-feature criteria, capability and isolation.
Ordinary edits and read-only status checks never launch a provider.

Inspect protocol status first. The feature must be authorized, unpaused,
unblocked and IMPLEMENTING. Existing features keep their pinned model;
advisory requires explicit compatible adoption (model 1.7, core 1.3). Preview
`feature.migration-impact` and use `feature.migrate-model` only with observed
human authorization. Preserve every historical attempt and formal requirement.

Commit intended source, tests, build/config/dependencies and approved binding
requirements. Use the selected configured repository, never infer another
checkout. Do not declare readiness with dirty production changes.

Submit `advisory.declare-readiness` to the plugin-local protocol adapter with a
stable `readinessId`, `sliceId`, `actor`, `scope` (`SLICE` or `FEATURE_FINAL`),
`checks` and `execution`. The adapter supplies `repositoryRoot` from the selected
context. Checks include both `fast` and `focused`, each with exact `command`,
`outcome: PASS` and nonempty feature-relative `{path, hash}` evidence. Execution
selects an installed `codex` or `claude-code` provider, explicit model and high
reasoning. Example request shape:

```json
{
  "operation": "advisory.declare-readiness",
  "cwd": "/absolute/selected/worktree",
  "input": {
    "readinessId": "slice-3-ready-1",
    "sliceId": "slice-3",
    "scope": "SLICE",
    "actor": {"kind": "agent", "label": "implementer readiness declaration"},
    "checks": [
      {"kind": "fast", "command": "project fast check", "outcome": "PASS", "evidence": [{"path": "runtime/fast.log", "hash": "sha256:<64 hex characters>"}]},
      {"kind": "focused", "command": "project focused tests", "outcome": "PASS", "evidence": [{"path": "runtime/focused.log", "hash": "sha256:<64 hex characters>"}]}
    ],
    "execution": {"provider": "codex", "model": "configured high-capability model", "reasoningEffort": "high"}
  }
}
```

Run the adapter with `--request-file /private/temporary/request.json`. The
optional CLI exposes the same operations as `gatereeve advisory
declare-readiness|proceed|check --input-file ...`. Consult its help for feature
and repository selection. Delete private request files after use.

The helper persists compact immutable records under
`docs/issues/{featureId}/advisory/{readinessId}/`: readiness inputs, execution
claim, structured result and isolation receipt, and any proceed reason. No
provider transcripts are retained. Repeat the same ID to inspect/reconcile its
existing disposition; changed reviewed inputs require a new ID. An execution
claim without a result is IN_PROGRESS. Reconcile the claim before another
provider launch; never relaunch under that ID. The approved reasoned-bypass
policy also permits formal entry while a claimed execution remains pending.
Retain that reason and the claim, and assess its eventual findings. A pending
claim is neither a clean review nor an UNAVAILABLE result.

READY_FOR_FORMAL_REVIEW means full Verification remains PENDING. FINDINGS
requires implementation work or an explicitly retained proceed reason.
UNAVAILABLE means configuration, isolation, schema or publication could not
be established; the helper retries a transient execution error once and does
not retry persistent failures. NOT_APPLICABLE follows the formal Judge's
applicability. No result certifies or waives a formal gate.

After advisory or formal Judge code failure, review the entire defect class
before declaring revised readiness. `remediation` must cover every bound prior
finding exactly once. Each entry contains `findingIds`, the violated
`invariant`, `examinedPaths` for affected mutation/transition paths, the changed
`approach`, and passing `regressions` with scenario, command and digest-bound
evidence. A finding that recurs after a claimed fix also requires a
`failedFixExplanation` and a different approach. Match the underlying invariant
and paths; renaming a rubric row is not remediation. No default failure-count
halt is added. Explicit project stop rules and escalation requirements apply.

Reruns receive earlier advisory and formal findings as a fix checklist and
still assess the complete in-scope slice. Operational failure alone creates no
code-defect remediation requirement. Promote binding decisions into the
approved spec/design; never silently turn raw journals or prior reports into
formal Judge requirements.

Existing formal FAIL reports can express the failure in rubric or independent
check rows without a separate concern list. The helper consumes those rows.
When exact affected paths were not reported, it marks complete-scope
reconciliation areas; examine all in-scope mutation/transition paths in those
areas and provide regression coverage before revised readiness.

To proceed without a clean advisory, submit `advisory.proceed` with
`readinessId`, `actor` and a bounded nonempty `reason`. The helper checks current
reviewed inputs and retains a source-bound reason. `advisory.check` performs a
read-only deterministic check. Source/test/config/dependency/requirement,
focused evidence, scope, provider capability, prompt/resource or policy changes
invalidate reuse. Evidence-only commits can preserve a clean result only when
all reviewed inputs remain identical. Ambiguous configuration-shaped data in
record namespaces requires classification, regardless of commit labels.

Track every compact advisory record and referenced check/regression evidence
before beginning the formal boundary, and pass the same `readinessId` to
`slice.transition` (`begin-boundary`). The core checks the disposition itself;
caller-supplied facts cannot manufacture it. Formal Verification, independent
Judge, gate dependencies, freshness and exact-head human review remain intact.
The formal Judge's input, diff and read-only repository exclude advisory
records, proceed reasons, prior review reports and raw decision journals.
