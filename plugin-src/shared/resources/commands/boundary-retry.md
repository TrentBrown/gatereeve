# Resume a review boundary

After implementer-owned fixes, defect-class review and revised readiness, invoke
`boundary.retry` through the portable protocol adapter. The optional CLI is
`gatereeve boundary retry --input-file request.json --json`. Codex and Claude
use the same coordinator; Desktop and a PATH CLI are optional. Read
`PROTOCOL.md` and `pr-boundary.md` first.

```json
{
  "operation": "boundary.retry",
  "cwd": "/absolute/repository",
  "input": {
    "retryId": "slice-2-ready-3",
    "sliceId": "slice-2",
    "readinessId": "slice-2-ready-3",
    "pullRequest": 42,
    "scope": "SLICE",
    "action": "advance",
    "actor": {"kind": "agent", "label": "implementer after revised readiness"}
  }
}
```

The first `advance` requires an active authorized IMPLEMENTING slice and an
exact existing unmerged PR. Commit/push reviewed inputs first. The coordinator
reuses that PR through `pr_lifecycle.py`, persists a fresh context, starts a
fresh formal attempt and records pin-context evidence through the core. It
creates no PR, never reopens or merges, grants no waiver, fixes no code and
copies no old formal PASS. Readiness admission remains the pinned model's
contract, including explicit compatible adoption for older features.

Repeat the same identity to resume. Checkpoints live in the worktree's Git
metadata as recoverable execution cursors; journal events and trusted live
PR/Git observations decide passage. A changed source/readiness/model or PR
requires a fresh retry ID after reconciliation. Concurrent requests are locked;
reconcile uncertain outcomes with recorded events before replay. Do not
fabricate a checkpoint or reuse an attempt ID after losing its cursor.
`action: status` observes progress without establishing live source currentness.

`advance` returns `RUN_GATE` with exact module, protocol preparation, gate
context and output directory. Execute that skill/command on those pinned
inputs. Code review and spec assessment run as early eligible defect finders.
Formal Judge retains Verification, configured native capability and independent
history exclusions. Native agent-workflow modules publish/record through their
shared independent runtime; return to `advance` to reconcile that actual result.
This helper refuses manual native PASS recording.

For skill/manual/command results, use `action: record`, `gateId`, `outcome`
(`PASS`, `FAIL`, or permitted `NOT_APPLICABLE`), a feature-relative
`evidencePath`, and any required `reason`. The helper validates current
preparation, bytes and predecessor events, derives hashes/fingerprints and
records through the core. Artifact existence never implies substantive PASS.
Explicit human waivers still use the existing waiver operation and policy;
`advance` reconciles them.

`REMEDIATION_REQUIRED` returns failing/stale gates for implementer action.
There is no default halt based on retry count. Repeated underlying findings
require a changed remediation approach and passing focused regressions before
revised readiness. Project stop/escalation requirements still apply. Enter
remediation through the core before revised readiness; the helper does not
declare your fixes ready.

Final Explain Diff, narrative and consolidated summaries wait for all
substantive gates to be current and nonblocking under existing policies,
including explicit applicable waivers. Decision triage precedes Explain Diff,
matching the graph. After `PREPARE_PACKET`, use `action: packet` to construct
the digest-bound manifest from recorded gates. Reconcile the tracker packet
link, commit/push only returned declared evidence paths, then `action: finalize`
performs trusted clean-checkout synchronization, Git-derived packet validation
and core passage. Each `COMMIT_AND_PUSH_EVIDENCE` requires committing/pushing
that bookkeeping before resuming `finalize`, including packet-validation and
human-review events. The final call makes no journal mutation and returns
`AWAITING_HUMAN_REVIEW` with the exact final head. Request human approval for
that head; authorized merge and protection remain the existing procedure.

Use `FEATURE_FINAL` for the last slice. Verification, spec assessment and Judge
cover the whole feature; code/pattern review and Explain Diff use the final
slice range. Retention and post-merge finalization requirements govern Complete.
`completion-recovery.md` remains the distinct sanctioned path for already
merged slice-only final delivery with explicit applicable authority.

Repository-specific draft CI suppression and check sharding are optional,
never plugin-wide defaults. Applicable checks must run on later source changes
and the exact reviewed head. Packaging/fixture success establishes neither
installed activation nor live provider proof.
