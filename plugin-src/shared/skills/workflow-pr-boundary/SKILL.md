---
name: workflow-pr-boundary
description: "Run the software workflow review boundary process. Use when a code slice is ready for a PR, a closed PR review, or a draft PR update; when reconciling issues.md and tracker.md; when running scoped verification; or when moving issues to in-review."
---

# Workflow Review Boundary

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Read:

- `<plugin-root>/resources/policy/WORKFLOW.md`
- `<plugin-root>/resources/commands/pr-boundary.md`
- `<plugin-root>/resources/PROTOCOL.md`

At a boundary, reconcile docs before presenting the work as ready. Keep review
log entries append-only unless correcting a clear mistake.

The formal boundary reads the repository's `keepPullRequestsClosed` preference,
prepares or reuses one draft PR through `pr_lifecycle.py prepare`, and persists
its exact context. When true, preparation immediately closes the PR and all
review/evidence work keeps it closed. Route every gate through
`boundary_gate.py`, finalize only declared evidence, and validate the packet
before requesting human review. Never reopen a PR for a helper. After explicit
human merge authorization, `pr_lifecycle.py merge` checks the accepted head,
reopens, satisfies normal GitHub protections, and re-closes on failure.

For advisory-capable governed features, the implementer first declares the
slice ready after fast/focused checks through `workflow-advisory-review`
(`resources/commands/advisory-review.md`). The helper automatically performs
isolated noncertifying discovery. Fix findings and review the defect class
before revised readiness, or retain a source-bound nonempty reason to proceed.
Track compact records and referenced focused evidence, and pass `readinessId`
to `begin-boundary`. Clean means ready for formal review with full Verification
pending. Keep formal Judge inputs, diff and repository blind to advisory history,
prior reports and raw decision journals. Existing models require explicit adoption;
formal gate dependencies, freshness and human authorization remain mandatory.

For governed features, begin a boundary attempt, record every gate result and
fingerprint, and request human review through the plugin protocol adapter.
Direct prose or artifact creation cannot advance boundary state.

For feature-final review, use a real PR. When `releaseBranch` differs from
`integrationBranch`, its head must be integration and its base must be release.
Resolve `feature_final.py` from that pinned PR context and pass `--scope
feature-final` to every gate. Preserve complete-feature evaluation alongside
focused final-slice review, and surface any required human retention decision.

When all delivery already merged at slice scope and an explicit whole-feature
Judge waiver applies, use `<plugin-root>/resources/commands/completion-recovery.md`
for the guarded recovery preflight and dedicated event. Do not create another
merge or reinterpret old slice evidence as feature-final certification.
