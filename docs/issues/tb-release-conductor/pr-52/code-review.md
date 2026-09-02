# Code Review - PR #52

**Verdict:** PASS
**Diff:** `4744edf06e40c7ba9575855f9aa80c8cc612bbbc..a89b0bb534bf8c9e276cd67b2b4bf0fe9027dbbd`

## Findings

No findings remain in the pinned diff.

The review examined the production trigger topology, GitHub expression/job
routing, protected permission boundaries, cross-run artifact provenance,
state-chain validation, discovery ambiguity handling, same-stage failure
recording, direct-install attestation, metadata PR transport, CLI mutation
guards, dependency changes, exact-predecessor CI reduction, concurrency groups,
BuildKit cache semantics, bounded DMG retry classification, and tests.

Four issues found during superseded boundary attempts or GitHub integration
were fixed before this review was repinned:

1. Same-stage failure checkpoints now allocate a fresh temporary directory in
   `.github/actions/release-conductor-record/action.yml:67-103`, so recording a
   failure cannot collide with an earlier successful checkpoint at that stage.
2. Resume now rejects non-main or stale-main dispatches before discovery at
   `.github/workflows/release-conductor.yml:123-136`, preventing unreviewed
   conductor code from reaching protected jobs.
3. Pull-request Cask smoke now validates the pinned successful legacy
   publication artifact only for the read-only PR event, while reusable
   production smoke continues to require Release Conductor provenance.
4. Container acceptance now copies the workflow contract it tests, and the
   discovery CLI test creates its own minimal Git repository instead of
   depending on excluded host `.git` metadata.

The amended review also confirmed that evidence-only reduction cannot originate
from a failed or unknown head, every non-allowlisted delta falls back to full
coverage, `main` and reusable release calls use unique concurrency groups, and
checksum/signature/invalid-image errors retain immediate failure semantics.

## Residual Risks and Test Gaps

- GitHub protected environments, Apple notarization, release publication, and
  literal public Homebrew availability cannot be exercised safely before
  merge. AC8 explicitly makes the first fresh conductor RC the operational
  acceptance test.
- Workflow behavior is covered by actionlint and structural/contract tests,
  not a disposable GitHub repository simulation. The immutable state and
  publication logic underneath it has unit and integration coverage.
- State artifacts have a 30-day retention window. Resume correctly fails
  closed after expiry, so an abandoned release may require a new RC rather
  than indefinite recovery.
- BuildKit caching is a performance optimization rather than correctness
  evidence; deterministic `npm ci`, the container command, and full hosted
  execution remain authoritative when a cache is cold or unavailable.
