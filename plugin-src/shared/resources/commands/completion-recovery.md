# Post-merge completion recovery

Use when all delivery is resolved, the last delivery merged at slice scope, and
an explicit whole-feature Judge waiver applies to the exact integrated source.
This is a completion path, not a new PR, merge, or Judge PASS. Use the normal
feature-final path when that final merge already exists.

Resolve the stable feature/repository context and its original feature base.
Fetch the configured integration ref before preflight. Reconcile binding
requirements into approved spec/design before making their hashes authoritative.
Older locks need explicit compatible model adoption: preview migration impact,
obtain or reuse the applicable authorization, then migrate through the core.
An installed upgrade does not adopt recovery semantics for an existing feature.

Prepare compact source-bound reports in the feature record, normally under
`runtime/completion-recovery/<recovery-id>/`. Bind files by actual SHA-256 bytes;
paths are relative to the feature home. Use completed whole-feature verification
and assessment, not renamed slice reports. Preserve historical waiver evidence
unchanged and quote the actual user confirmation. A historical waiver also
needs a bound surrounding passage explicitly establishing whole-feature or
feature-final scope. Ambiguous authority needs clarification; a tooling failure,
slice Judge PASS or generic proceed instruction is insufficient.

Read [the recovery evidence contract](../policy/COMPLETION-RECOVERY.md) for report
fields. Commit/retain the reports before claiming TRACKED retention. If records
remain untracked, retain the applicable explicit human workspace-retention
decision. Do not silently copy records or claim archival. Additional verification
or spec waivers require their own explicit source-bound confirmation and the
pinned module's waiver permission; Judge waiver does not waive another obligation.

Run the portable adapter with a structured request file:

```json
{
  "operation": "feature.recovery-preflight",
  "cwd": "/absolute/selected/repository",
  "input": {
    "recoveryId": "completion-1",
    "integrationSha": "<exact integrated source SHA>",
    "actor": {"kind": "agent", "label": "Observed applicable completion evidence"},
    "waiver": {"path": "runtime/completion-recovery/completion-1/waiver.json", "hash": "sha256:<actual digest>"},
    "evidence": {
      "verification": {"path": "runtime/completion-recovery/completion-1/verification.json", "hash": "sha256:<actual digest>"},
      "specEvaluation": {"path": "runtime/completion-recovery/completion-1/spec.json", "hash": "sha256:<actual digest>"},
      "retention": {"path": "runtime/completion-recovery/completion-1/retention.json", "hash": "sha256:<actual digest>"}
    }
  }
}
```

```bash
node "<plugin-root>/resources/protocol/plugin-adapter.js" --request-file /tmp/recovery-request.json
```

Preflight is read-only. Its `eligible`, `blockers`, `requestIdentity` and validated
receipt distinguish a prepared operation from passage. Resolve each blocker.
When eligible, use the same request with operation `feature.recover-finalization`.
The mutation freshly repeats validation and appends one dedicated
`FEATURE_FINALIZATION_RECOVERED` event. Repeating the same ID/bound request
reconciles the existing event without duplicating it; a different request under
that ID is rejected. Do not hand-edit old events or call generic begin-finalizing.

The optional CLI exposes the same operations:

```bash
gatereeve feature recovery-preflight --input-file /tmp/recovery-input.json
gatereeve feature recover-finalization --input-file /tmp/recovery-input.json
```

After recorded recovery, start ordinary finalization against that verified source
with `finalization.start`. Required configured modules still govern Complete;
recovery supplies their source anchor rather than waiving or marking them passed.
Any release/publication or external feature mutation still needs its applicable
authority. Finish retention/checkpointing under the existing closeout policy.
