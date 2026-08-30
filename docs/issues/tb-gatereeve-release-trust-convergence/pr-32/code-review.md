# PR 32 Code Review

**Verdict:** PASS

**Pinned diff:** `4a6a680be51b5b0c2b9454497a8950df739e1805..6641b2842a94100a3a72d1e8806ddc7f3f05cbcf`

## Findings

No blocking or nonblocking code findings remain.

Two findings discovered during earlier boundary attempts were fixed before this
pinned review:

1. Attempt 1 found that valid event hashes did not independently prevent an
   impossible transition or a rewritten materialized summary. The explicit
   graph and history cross-checks now start at
   `apps/desktop/scripts/notarization-attempt.mjs:23` and
   `apps/desktop/scripts/notarization-attempt.mjs:276`.
2. Attempt 2 found that tag/version identity and Apple `info` response request
   identity were insufficiently strict. Exact tag/version validation is at
   `apps/desktop/scripts/notarization-attempt.mjs:76` and
   `apps/desktop/scripts/notarization-attempt.mjs:560`; mandatory response
   identity is at `apps/desktop/scripts/notarize-macos.mjs:249`.

## Contract Review

- The pre-submit durable `submitting` transition prevents an abrupt runner exit
  from making an ambiguous Apple request appear safe to submit again.
- Atomic attempt writes occur before submission, after request creation, at
  polling start, and after each poll.
- The attempt graph preserves timeout, rejection, uncertainty, reconciliation,
  and supersession as attempt facts rather than successful release stages.
- V2 stages form the exact GateReeve ordered prefix and bind source/evidence/
  prior-stage digests. Candidate Apple bytes bind once after qualification.
- Version dispatch admits the real RC.2 v1 fixture for inspection while
  `assertMutableReleaseRecord` rejects v1 mutation. Existing publication
  adapters explicitly retain their v1 validator until later migration.
- No Apple secret value is read into or emitted by the new records.

## Residual Risks and Test Gaps

- The old operational producer still creates v1 records. Later slices must
  switch new-candidate authority to the complete v2 packet before this feature
  can pass AC1/R1 globally.
- Apple command behavior is injected on Linux. Real notarization response
  shapes, protected persistence/retention, and native macOS behavior require
  the planned P3-P4/P9 hosted evidence.
- Timestamp monotonicity is established by transition APIs but is not treated
  as a cryptographic trust primitive; exact source/artifact/request identities
  and append hashes remain the operative invariants.
