# Interview - tb-release-conductor

**Feature start:** 2026-09-01
**Status:** complete

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

## Settled decisions

### D1 — Orchestrate the trusted release system

The first Release Conductor will orchestrate the existing GitHub Actions
workflows and their retained artifacts. It will not replace or redesign the
signing, notarization, sealing, publication, or recovery implementations.

The conductor must preserve the current security and audit boundaries:

- exact retained bytes and sealed-plan digests remain authoritative;
- Apple trust and publication remain separately protected approvals;
- dry runs remain nonpublishing and separately reviewable;
- recovery remains forward-only and retry-safe;
- the conductor removes clerical transfer of run IDs and digests without
  weakening the decisions those values bind.

Redesigning the underlying signing or publication machinery is explicitly out
of scope for this feature.

### D2 — Approve mutations, not rehearsals

Read-only dry runs will execute automatically. Their exact inputs, sealed-plan
digest, and results will be presented at the following protected publication
gate so the reviewer still evaluates the rehearsal before authorizing a
mutation.

Human approval remains mandatory immediately before:

- use of protected Apple trust credentials;
- primary public publication; and
- linked Homebrew Cask publication.

The conductor will not require a separate environment approval merely to run
a nonpublishing rehearsal. Rehearsals must remain incapable of receiving
publication credentials or mutating public state.

### D3 — One conductor with forward-safe resume

One Release Conductor workflow definition will expose two operator operations:

- `start` begins a fresh release and advances the normal path automatically;
- `resume` accepts the release tag, discovers previously validated stage
  evidence, and continues at the first incomplete stage.

The operator will not transfer preparation IDs, finalization IDs, publication
IDs, or plan digests between stages. Resume must validate the complete prior
identity and evidence chain, reject conflicts, and preserve already completed
history. It must never rebuild trusted bytes, silently repeat a protected
operation, or rely on GitHub's generic **Re-run jobs** behavior.

### D4 — Immutable state with generated dashboards

The conductor's authoritative state will be a sequence of immutable,
digest-chained GitHub Actions artifacts, with one state record emitted after
each completed stage. Each record must bind the release identity, predecessor
digest, evidence sources, completed stage, and next legal action.

The latest validated state will be rendered as:

- a human-readable GitHub Actions job summary showing completed, waiting,
  failed, and next stages; and
- a downloadable `release-status.json` suitable for automation and tag-only
  resume.

An editable GitHub issue or special state branch will not become a parallel
source of truth. In-progress state may use the configured release-artifact
retention window; completed releases continue to rely on their existing final
publication records for durable authority.

### D5 — Direct-install confirmation resumes the Cask chain

Successful primary publication will leave the conductor in an explicit
`WAITING_FOR_DIRECT_INSTALL` state. After installing the exact public DMG and
launching GateReeve, the operator will invoke the same conductor with:

- operation `resume`;
- the release tag; and
- an explicit installed-and-launched attestation.

The conductor will obtain the confirmer identity from the authenticated GitHub
actor and generate the confirmation timestamp itself. It will then
automatically perform linked Cask finalization and the read-only Cask rehearsal
before pausing at the protected Cask publication approval. No run ID, plan
digest, confirmer name, or timestamp will be copied by the operator.

### D6 — Completion includes public Cask acceptance

After approved Cask publication, the conductor will automatically run the
linked-packet and literal-public-tap smoke checks. A release reaches `COMPLETE`
only when those checks pass and their evidence is bound into the final status
record.

Apple Silicon runs natively. Because the maintainer does not have an Intel Mac,
GitHub's Intel macOS runner is acceptable release evidence; Rosetta-based local
verification is an acceptable substitute when a local cross-architecture check
is needed. This carries forward the acceptance constraint already settled
during the terminal release.

### D7 — Generated metadata transport bypasses full Plugin CI

A pull request whose sole changed path is
`workflow-site/releases/desktop.json` is transport for output already bound to
the sealed publication plan, not a general code change. Full Plugin CI will
ignore exactly that path-only case.

Before merging the generated PR, the publisher must independently verify its
deterministic branch identity, retained base commit, sole changed path, exact
file bytes, and sealed SHA-256 digest. Any additional path, changed identity,
or content mismatch fails closed. Mixed and ordinary pull requests continue to
run the complete CI matrix.

This exception must not relax the repository's contributor-approval policy,
auto-approve held workflow runs, or introduce another privileged token.

### D8 — Clean cutover to the conductor

GateReeve currently has one user and requires no backward-compatible release
operator interface. The feature will therefore make a complete cutover:

- `start` and `resume` on the Release Conductor are the only manual release
  entry points;
- preparation, finalization, primary publication, Cask finalization,
  Cask publication, smoke, and Apple trust recovery become reusable internal
  workflows without their own `workflow_dispatch` triggers;
- the runbook will not document or preserve an alternate manual phase path.

If the conductor itself fails, its code is repaired through the normal reviewed
development path and the release is resumed by tag from retained evidence. A
low-level dispatch will not bypass the conductor state chain.

### D9 — Release reviewed source; do not author it

The conductor begins only after version changes have been reviewed and merged
through the ordinary development process. `start` accepts the release tag,
pins the exact current `main` commit, and fails unless all coordinated version
fields agree with that tag.

The conductor will not edit version files, create a version-bump branch or pull
request, merge source changes, or choose the next version. This preserves the
boundary between deciding what source to release and publishing exact reviewed
bytes.

### Derived clean-cutover requirement

The legacy tag-triggered `Plugin Release` path is also an alternate publisher.
The clean cutover requires removing or disabling that path so a conductor-owned
tag cannot start a parallel publication outside the conductor ledger.
