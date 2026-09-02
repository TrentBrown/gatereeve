# Design - tb-release-conductor

**Status:** approved (gate passed 2026-09-01)

## Problem

GateReeve's coordinated release pipeline now protects exact Plugin and Desktop
bytes, Apple trust, ordered primary publication, direct-install attestation,
linked Homebrew publication, and native smoke evidence. The guarantees are
strong, but the operator must manually transfer run IDs, source SHAs, plan
digests, confirmer identity, and timestamps through several workflows. Read-only
rehearsals also require their own approvals. A held workflow on a generated
metadata PR can interrupt publication, and metadata-only changes run the full
multi-platform product matrix.

This makes a correct release feel like manually operating the implementation
details of the trust model. The process is slow, easy to lose track of, and
difficult to resume confidently even though each underlying phase is already
machine-verifiable.

## Intent

Provide one operator-facing Release Conductor that carries a reviewed release
from exact `main` source through trusted artifacts, primary publication, direct
install confirmation, linked Cask publication, and public smoke acceptance.
The operator supplies intent and approves real authority boundaries; the
conductor derives and validates clerical identifiers.

The design simplifies orchestration without weakening the exact-byte,
separate-approval, or forward-only recovery guarantees proven by the existing
release machinery.

## Operator contract

The Release Conductor is the only manually dispatched release workflow. It has
two operations:

- `start` accepts a fresh RC tag, pins the current reviewed `main`, validates
  coordinated version metadata, and begins the release.
- `resume` accepts a tag, discovers and verifies its latest conductor state,
  and continues from the first legal incomplete stage. When the release is
  waiting for the direct-install test, `resume` also requires an explicit
  installed-and-launched attestation.

The ordinary operator experience is:

1. start the release with its tag;
2. approve protected Apple trust work;
3. review the automatic primary rehearsal and approve primary publication;
4. install and launch the public DMG, then resume with the attestation;
5. review the automatic Cask rehearsal and approve Cask publication.

The workflow captures source commits, run and artifact identities, sealed plan
digests, GitHub actor identities, and timestamps. None are manually copied.

## Release lifecycle

The conductor projects each release into the following ordered stages:

```text
INITIALIZED
  -> TRUST_PENDING
  -> TRUSTED
  -> PRIMARY_FINALIZED
  -> PRIMARY_REHEARSED
  -> PRIMARY_PUBLISHED
  -> WAITING_FOR_DIRECT_INSTALL
  -> CASK_FINALIZED
  -> CASK_REHEARSED
  -> CASK_PUBLISHED
  -> SMOKE_VERIFIED
  -> COMPLETE
```

A failed stage records failure evidence and its legal next action rather than
pretending the release has moved forward. A resume recomputes state from the
validated evidence chain and either continues, invokes bounded Apple trust
recovery, or fails closed with an actionable conflict.

Primary publication deliberately completes before the off-computer direct
install test. The first run may therefore end at
`WAITING_FOR_DIRECT_INSTALL`; the attested resume owns the complete linked Cask
chain through public smoke acceptance.

## Orchestration shape

The existing phase implementations remain the source of truth for building,
signing, notarizing, sealing, rehearsing, publishing, and smoke testing. They
become reusable workflows called only by the conductor. The conductor does not
duplicate or replace their release logic.

As a clean cutover:

- preparation, finalization, primary publication, Apple trust recovery, Cask
  finalization, Cask publication, and release smoke lose their independent
  `workflow_dispatch` entry points;
- release smoke may retain automatic pull-request coverage for changes to its
  implementation, but not a manual production dispatch;
- the legacy tag-triggered Plugin Release publisher is removed or disabled;
- the release runbook documents only conductor `start` and `resume`.

There is no backward-compatible manual phase path. A defect in the conductor is
fixed through normal review and the release then resumes from retained evidence.

## State and dashboard contract

After every completed stage, the conductor emits a new immutable state artifact.
State records are digest-chained and include at least:

- schema version, release tag, source commit, and conductor run identity;
- current stage and the only legal next actions;
- predecessor state digest;
- referenced phase workflow, run, artifact, plan, and receipt identities;
- approval, attestation, failure, or recovery evidence relevant to the stage;
- creation actor and timestamp.

Resume enumerates records for the tag, verifies their schemas, digests,
predecessor chain, release identity, source ancestry, and referenced GitHub
evidence, then selects the unique latest valid state. Missing, divergent,
expired, or conflicting evidence is an error; the conductor does not guess.

Each run also produces:

- a GitHub Actions job summary showing completed, waiting, failed, and next
  stages with links to supporting evidence; and
- a downloadable `release-status.json` containing the machine-readable latest
  projection.

Editable issues, comments, repository files, or special state branches are not
authoritative conductor state. In-progress recovery is bounded by configured
artifact retention. Completed releases continue to use their sealed primary
and linked Cask publication records as durable authority.

## Authority and approval boundaries

Human review is required immediately before authority is exercised:

- the Apple trust job uses the protected trust environment;
- primary publication uses a protected publication deployment;
- linked Cask publication uses a distinct protected publication deployment.

Read-only finalization and rehearsals run automatically. Rehearsal jobs receive
read-only permissions, no publication credentials, and no environment capable
of granting mutation authority. Their exact plan and result are rendered at
the following protected publication gate.

Direct-install confirmation is an explicit `resume` attestation, not a generic
environment approval. The authenticated GitHub actor becomes the confirmer and
the conductor generates the timestamp. The attestation is accepted only from
`WAITING_FOR_DIRECT_INSTALL` and is bound to the exact public primary record
and DMG.

## Recovery and idempotence

Generic **Re-run jobs** remains forbidden after protected trust work begins.
`resume` is the recovery interface and must:

- use the tag to discover run IDs and digests;
- validate all retained inputs before invoking a phase;
- reuse trusted bytes and Apple request history;
- route eligible incomplete trust work through bounded trust recovery;
- skip already receipted publication surfaces;
- reject a reused tag, changed source, conflicting plan, divergent state chain,
  or history that would require deleting or replacing immutable output.

If trusted bytes must change or immutable public history conflicts, the RC is
burned and a new identity is required. The conductor automates recovery rules;
it does not relax them.

## Generated metadata PR handling

`workflow-site/releases/desktop.json` is generated output whose exact bytes are
already committed by the sealed primary plan. A pull request changing only that
path does not run full Plugin CI.

Before merging it, the publisher verifies the deterministic branch identity,
retained base commit, sole changed path, exact file bytes, and sealed digest.
Any extra path or mismatch fails closed. A mixed or ordinary pull request still
runs the complete CI matrix.

This design does not change the repository's contributor-approval policy,
approve held workflow runs, add a privileged automation identity, or expose a
new token. Avoiding the irrelevant PR-triggered workflow removes the observed
`action_required` catch-22.

## CI runtime maintenance

The implementation also removes release-time compatibility noise:

- update official GitHub actions to their current Node-24-compatible major
  releases where supported;
- retain an active LTS Node runtime for GateReeve jobs;
- update or otherwise align `qp-cli-core` so its declared engine supports that
  LTS runtime instead of requiring an exact non-LTS Node version;
- use precise path filters so release-metadata transport does not rebuild the
  unrelated Plugin and Desktop matrices.

Dependency and action upgrades must be verified independently from the
conductor behavior so a maintenance regression cannot be mistaken for an
orchestration failure.

## Completion contract

A release is complete only after:

- primary publication receipts validate;
- the exact public DMG is attested as installed and launched;
- linked Cask publication receipts validate;
- linked-packet Cask install/upgrade passes on Apple Silicon and Intel; and
- the literal public-tap install passes on Apple Silicon and Intel.

GitHub's native Intel macOS runner is acceptable Intel release evidence.
Rosetta-based local verification is an acceptable substitute when local
cross-architecture evidence is needed and no Intel Mac is available.

The final state record binds the smoke evidence and projects `COMPLETE` only
when every required check passes.

## Version and source boundary

The conductor publishes source; it does not author source. Before `start`, the
version bump must be reviewed and merged normally. The conductor pins current
`main` and validates that all coordinated Plugin, Desktop, update, and Cask
inputs agree with the requested tag.

It never chooses a version, edits version files, creates a version branch or
pull request, or merges source changes. A mismatch fails before credentials,
tags, or public state can be touched.

## Alternatives considered

- Keep all phase dispatches during rollout: rejected because there is one user,
  no backward-compatibility requirement, and two operator paths can diverge or
  bypass the conductor ledger.
- Keep only manual Apple trust recovery: rejected in favor of one consistent
  tag-only resume contract; the conductor must own bounded recovery too.
- Store live status in an issue or state branch: rejected because mutable state
  would become a second control plane and require additional write authority.
- Require approvals for read-only rehearsals: rejected because the real
  publication gate can review the exact rehearsal result without granting
  credentials merely to compute it.
- Auto-approve the generated bot PR's held CI or use a broader token: rejected
  because sealed metadata needs exact transport validation, not unrelated
  product builds or expanded authority.
- Have the conductor create version-bump PRs: rejected to preserve the boundary
  between reviewed source selection and publication.

## Constraints

- Existing exact-byte manifests, Apple trust evidence, sealed plans, receipts,
  and deterministic PR validation remain authoritative.
- Trust, primary publication, and Cask publication retain least-privilege job
  permissions and distinct protected deployments.
- No phase may infer an identity from mutable `main` after the conductor pins
  its source commit.
- Artifacts and state records must include hidden files where the underlying
  integrity manifest includes them.
- No implementation step may merge or rebase a development branch into this
  topic branch or `main`.

## Open risks

- Reusable workflows share a caller run identity, while existing validators
  currently recognize separate `workflow_dispatch` runs. Their provenance
  checks and artifact lookup rules need careful migration without accepting
  ambiguous evidence.
- A run can fail before emitting its next state record. Resume discovery must
  distinguish an incomplete attempt from a competing valid chain and recover
  required always-uploaded trust evidence.
- Artifact retention bounds how long an incomplete release can be resumed. The
  dashboard must make the deadline visible rather than silently losing state.
- Removing every low-level dispatch makes conductor correctness essential;
  contract and fixture coverage must exercise every legal resume point before
  production use.
- GitHub environment approvals, reusable-workflow permissions, and artifact
  visibility must be proven in a nonpublishing rehearsal before the first real
  conductor release.

## Changes
