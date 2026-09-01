# Spec - tb-release-conductor

**Feature:** `tb-release-conductor`
**Created:** 2026-09-01
**Status:** approved and validated (gate passed 2026-09-01)

## Summary

Replace GateReeve's manually stitched coordinated-release workflows with one
operator-facing Release Conductor. The conductor starts or resumes a release by
tag, derives and validates all phase identities, pauses only at real authority
or external-attestation boundaries, and reports immutable machine-readable
state without weakening the proven exact-byte or forward-only release model.

The change is a clean cutover: low-level production dispatches and the legacy
tag-triggered publisher cease to be alternate entry points. It also removes the
generated-metadata PR CI catch-22 and current Node/action compatibility noise.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** Single entry point and source preflight. The Release Conductor is the
  only manual production release entry point and offers `start` and `resume`.
  `start` accepts a fresh RC tag, pins the exact current reviewed `main` commit,
  and rejects a malformed/reused tag, a non-current source, or disagreement
  among coordinated Plugin/Desktop release versions before any credential,
  immutable tag, or public mutation is possible. Phase workflows expose no
  independent manual dispatch, and creating a release tag cannot invoke a
  legacy parallel publisher.
- **AC2.** Automatic ordered orchestration. For a valid `start`, the conductor
  invokes the existing preparation, trust, finalization, rehearsal, publication,
  Cask, recovery, and smoke implementations as reusable workflows in the
  approved order. It derives and verifies source SHAs, run/artifact identities,
  and plan digests rather than accepting them from the operator. It cannot skip
  a prerequisite stage, rebuild finalized/trusted bytes, or advance when a
  referenced phase or artifact does not match the pinned release identity.
- **AC3.** Least-privilege approval boundaries. Apple credential use, primary
  publication, and linked Cask publication each wait at their protected
  deployment immediately before the authorized operation. Read-only
  finalization and primary/Cask rehearsals run automatically, receive no
  publication credential or mutating permission, and present their exact plan,
  digest, and result at the following publication approval. Approval of one
  boundary cannot authorize another boundary or a different release identity.
- **AC4.** Immutable state and usable status. Every completed stage appends one
  schema-validated, SHA-256-linked state record binding the release tag, source,
  predecessor, stage, evidence references, actor/time, and legal next action.
  Each run emits a human-readable Actions summary and a downloadable
  `release-status.json` that agree with the latest valid record. Given only the
  tag, `resume` selects the unique latest valid chain without operator-supplied
  run IDs or digests and rejects missing, expired, divergent, malformed, or
  identity-inconsistent state.
- **AC5.** Forward-safe retry and recovery. A failed or interrupted attempt
  records actionable failure/recovery status without claiming stage completion.
  `resume` reuses retained bytes, Apple request history, sealed plans, and
  completed publication receipts; invokes bounded trust recovery when eligible;
  and skips already completed idempotent surfaces. Generic job reruns are not a
  supported recovery path. Changed trusted bytes, conflicting immutable public
  history, ambiguous Apple submission state, or reuse of an incompatible RC
  fails closed and requires a new RC identity where the existing rules require
  one.
- **AC6.** Attested Cask continuation and completion. Successful primary
  publication produces `WAITING_FOR_DIRECT_INSTALL`. Only an authenticated
  `resume` with an explicit installed-and-launched attestation for the exact
  public DMG can continue; the conductor supplies the GitHub actor and timestamp
  and rejects premature, duplicate-conflicting, or wrong-release attestations.
  It then automatically finalizes and rehearses the linked Cask, pauses for Cask
  publication approval, publishes, and runs linked-record plus literal-public-
  tap smoke checks. `COMPLETE` requires successful Apple Silicon and Intel
  evidence for all required Cask checks.
- **AC7.** Safe generated-metadata transport. A PR whose only changed path is
  `workflow-site/releases/desktop.json` does not trigger full Plugin/Desktop CI.
  Before merge, the publisher verifies its deterministic branch, retained base,
  sole path, exact bytes, and sealed digest. Any extra path or mismatch rejects
  publication; ordinary or mixed PRs retain the full CI matrix. The behavior
  requires neither workflow auto-approval, a relaxed contributor policy, nor a
  new privileged token.
- **AC8.** Compatibility and verification boundaries. Official GitHub actions
  used by GateReeve run on supported Node-24 action runtimes where an official
  compatible major exists, while GateReeve jobs use an active LTS Node version
  accepted by all declared package engines, including `qp-cli-core`, without
  engine/deprecation warnings. Pre-merge automated fixtures cover the complete
  conductor happy path, every legal resume point, approval isolation, malformed
  and divergent state, retry/idempotence, metadata-only filtering, and
  credential-free dry runs. Real protected deployments, Apple credentials,
  notarization, public publication, and public Cask availability are explicitly
  post-merge operational acceptance evidence and are not fabricated or required
  as pre-merge feature-gate evidence.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Entry point and preflight | Only conductor `start`/`resume` can manually begin production; exact current `main`, fresh RC identity, and all versions validate before authority is reachable. | A low-level/manual/tag-triggered alternate remains, or invalid source/version/tag reaches a credentialed or mutating job. | Workflow trigger tests, static workflow inspection, and positive/negative preflight fixtures. |
| R2 | Ordered derivation | All approved phases execute in order and every internal identity/digest is derived and rebound to the pinned release. | An operator must copy an internal identifier, a phase can be skipped, or mismatched/rebuilt evidence is accepted. | Reusable-workflow contract tests, orchestration fixtures, and artifact/provenance assertions. |
| R3 | Approval isolation | Only the three authorized operations receive their protected deployment and required authority; automatic rehearsals are demonstrably read-only and their result reaches the gate. | Rehearsal needs approval/credentials, publication can occur without its gate, or one approval crosses releases/boundaries. | Workflow permission/environment inspection and authority-boundary tests. |
| R4 | State and dashboard | Digest-chained state validates; summary and JSON agree; tag-only resume selects one valid head and rejects all invalid/ambiguous chains. | State can be overwritten, projections disagree, manual IDs are required, or corrupt/divergent/expired evidence is guessed through. | State-schema, chain, discovery, rendering, and negative fixture tests. |
| R5 | Recovery semantics | Every supported interruption resumes from retained authority without duplicate protected work or lost receipts; prohibited conflicts fail closed. | Resume rebuilds/resubmits/repeats incorrectly, generic rerun is required, or immutable conflicts are repaired destructively. | Failure injection, trust-recovery, idempotence, receipt, and conflict tests. |
| R6 | Direct install and Cask completion | Exact-DMG attestation captures actor/time, launches the automatic linked Cask chain, and `COMPLETE` requires all four native/public smoke results. | Attestation is forgeable/misbound, clerical fields are required, Cask needs another dispatch, or completion omits required smoke evidence. | Attestation/state tests, Cask orchestration fixtures, and ARM64/Intel smoke aggregation tests. |
| R7 | Metadata-only CI | Exact generated metadata transport skips full product CI but receives strict sealed-output validation; any wider change receives full CI or fails. | Bot approval still blocks publication, unrelated builds run, validation is weakened, or extra changes bypass CI. | Path-filter tests, generated-PR fixtures, publisher validation tests, and workflow inspection. |
| R8 | Runtime and lifecycle verification | Supported action majors and LTS package engines run without compatibility warnings; automated pre-merge evidence covers all specified contracts and post-merge-only proof is labeled honestly. | Deprecated action runtimes, engine mismatches, uncovered resume/authority paths, fabricated external evidence, or credentialed/public acceptance as a pre-merge dependency remains. | Dependency metadata, CI logs, contract suites, coverage matrix, and post-merge acceptance checklist. |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.

- **2026-09-01 clarification for AC8:** `qp-cli-core@1.7.1` exposed only
  Commander and help-tree behavior while imposing an exact obsolete Node 23.3
  engine and unrelated transitive dependencies. Removing it in favor of pinned
  direct `commander` plus an equivalent local help renderer satisfies the
  compatibility intent more completely than retaining an incompatible declared
  engine. The public command behavior remains covered by the same tests.
