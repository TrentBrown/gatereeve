# Plan - tb-gatereeve-release-trust-convergence

**Feature:** `tb-gatereeve-release-trust-convergence`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-30

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge
  cases.

## Strategy

Evolve the working GateReeve release implementation in repository-local,
testable layers. Preserve schema-v1 readers and current public records while
introducing a separate schema-v2 model and strict version dispatch. Build the
Apple attempt/recovery contract as pure, injected logic before wiring it into
GitHub-hosted macOS jobs. Extend the existing exact universal-DMG and native
verification flow rather than replacing it. Add hosted publication as a
consumer of the finalized packet and retain Cask as an immutably linked
downstream record.

Deliver the work through sequential reviewed slices. Contract and state-machine
changes land first; protected trust production and native evidence follow;
hosted primary/Cask publication and operator documentation land after the
trusted packet is stable. Only reviewed `main` is eligible for the final live
environment cutover and nonpublishing rehearsal. Any defects found by that
rehearsal return through a fresh reviewed slice and consume a new RC identity
when bytes change.

No slice merges or rebases a `development` or `development-*` branch. Apple
private material remains outside the Linux worktree. Environment mutation and
live Apple work are explicitly coordinated user operations, not ordinary local
implementation steps.

## Steps

- **P1. Implement strict schema-version dispatch and the schema-v2 lifecycle.**
  Refactor `cli/src/plugin/coordinated-release.js` behind explicit v1 and v2
  readers/validators while keeping valid v1 records read-only. Define the v2
  identity, ordered common anchors, GateReeve Plugin/universal-Desktop/trusted-
  DMG stages, transition guards, exact artifact identities, and immutable
  append semantics. Add positive and negative v1/v2 fixtures proving skipped,
  reordered, contradictory, mutated, and synthetic history is rejected.
  **Advances:** R1, R2.
- **P2. Add candidate reservation and durable notarization attempts.** Extract
  signing/notarization orchestration from the synchronous `--wait` path into
  testable submit, reconcile, poll, timeout, accept, reject, and supersede
  operations. Create the attempt record before submission, bind source/version/
  DMG identity, persist request history before polling, enforce the approved
  30-second/60-poll bound, and fail closed when interruption cannot be
  reconciled through Apple history. Add injected-command, clock, timeout,
  malformed-output, rejection, uncertainty, and prohibited-resubmission tests.
  **Advances:** R2, R4.
- **P3. Align trust evidence, native aggregation, and conformance fixtures.**
  Version the Apple and Desktop evidence contracts, preserve the authoritative
  universal DMG, and make aggregation accept exactly one create-once ARM64 and
  Intel record for the same source, candidate, request, and bytes. Retain all
  existing signature, universal-slice, staple, Gatekeeper, and real-app smoke
  checks. Add repository-local semantic fixtures for common PortReeve anchors
  and negative cases without copying PortReeve code or CLI/service topology.
  **Advances:** R1, R2, R5, R8.
- **P4. Rework protected trust production around `release-trust`.** Update
  `.github/workflows/coordinated-release-prepare.yml` and supporting tests so a
  fresh RC is pinned to the reviewed `main` SHA, serialized by version with
  cancellation disabled, and retained for at least 30 days. Move Apple access
  to a least-privileged `release-trust` job with unconditional cleanup, no
  publication authority, durable attempt/recovery transport, and the existing
  independent native jobs. Add workflow contract tests for source, permission,
  environment, retention, rerun, and secret-domain invariants.
  **Advances:** R2, R3, R4, R5.
- **P5. Add digest-bound hosted primary publication.** Extend coordinated
  finalization so it seals outputs only after v2 trust and native verification.
  Add a protected publication job that receives the exact retained packet and
  plan digest, cannot build/sign/notarize, supports a provably nonmutating dry
  run, and uses existing per-surface receipts for idempotent real recovery.
  Retain the repository-local publisher as an exact-record recovery surface,
  not an alternate authority that can change the plan.
  **Advances:** R3, R6.
- **P6. Bring linked Cask publication behind the hosted boundary.** Version the
  Cask record compatibly, retain the public-DMG install/launch prerequisite,
  bind the primary record and exact trusted DMG, and add a separately approved
  publication-only job with deterministic plan/receipt recovery. Expand Cask
  fixtures and partial-publication tests while allowing the primary record to
  remain complete when Cask is pending.
  **Advances:** R3, R7.
- **P7. Update operator contracts and migration safeguards.** Revise
  `APPLE-RELEASE-SETUP.md`, `RELEASING.md`, CLI documentation, and workflow
  assertions to describe one-time credential transfer, per-release approvals,
  source eligibility, version burn, 30-day retention, bounded recovery,
  prohibited generic reruns, hosted dry run/publication, Cask linkage, and
  immutable v1 history. Provide exact environment-name/secret-name audit and
  cutover checks without reading or transporting secret values.
  **Advances:** R1, R2, R3, R4, R6, R7.
- **P8. Complete reviewed delivery before live mutation.** At each sequential
  PR boundary, run build/lint/tests, scoped spec evaluation, independent judge,
  pattern review where applicable, code review, decision triage, and exact PR
  context validation. Merge only reviewed topic slices into `main`; never
  merge or rebase from `development*`. Confirm the assembled mainline satisfies
  all locally provable criteria before changing live environments.
  **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.
- **P9. Perform live cutover, rehearsal, and final rubric evaluation.**
  Coordinate the user's one-time secure population of `release-trust`, validate
  both environment protection/authority boundaries, remove Apple private
  material from `release-publication` after successful cutover, and dispatch a
  fresh unused RC from reviewed `main`. Retain the schema-v2 packet, real Apple
  request history, exact universal DMG, native ARM64/Intel evidence, sealed
  plan, hosted publication dry run, environment audit, and before/after public
  inventory proving zero mutation. If bytes change after failure, use a new RC.
  Run full spec evaluation and the final independent judge, then produce the
  completion report with zero `NOT YET` or `FAIL` criteria.
  **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.

## Proposed delivery boundaries

1. **Lifecycle and recovery contracts:** P1-P2, establishing v2 compatibility,
   candidate immutability, and testable Apple recovery without live secrets.
2. **Protected trust and native evidence:** P3-P4, wiring the exact universal
   DMG into separated protected production and independent native authority.
3. **Hosted publication, Cask, and operations:** P5-P7, completing the sealed
   publication boundary, linked Cask path, and migration documentation.
4. **Mainline acceptance:** P8-P9, merging reviewed code, performing the live
   environment cutover, and retaining nonpublishing acceptance evidence. Any
   code correction discovered here uses a new reviewed delivery slice.

The boundaries are proposed planning units, not pre-authorized implementation
slices. Each governed slice is proposed separately after plan authorization.

## Verification

- Run focused state-machine, attempt/recovery, evidence, publication, Cask, and
  workflow-contract tests in the slice that changes each surface.
- Run repository build/typecheck, changed-file lint/format, and the broad test
  suite at every PR boundary when feasible; record unrelated failures rather
  than silently skipping them.
- Exercise timeout, rejection, interruption, duplicate evidence, altered bytes,
  stale plan, authority overlap, partial publication, and version-reuse
  negatives before protected live work.
- Inspect live environment metadata by names and protection rules only; never
  read or expose secret values.
- **Final step:** P9 runs full rubric evaluation, independent judgment, and the
  workflow completion report against the assembled reviewed feature.
