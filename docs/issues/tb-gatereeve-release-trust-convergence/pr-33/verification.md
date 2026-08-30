# PR 33 Verification

**Verdict:** PASS

**Pinned diff:** `a01361aaf3c5779129e49972a33539c5984d0da0..dcabb44f49c251ae3126c072200a4b9163ed8a8a`

## Verification Matrix

| Category | Result | Command and evidence |
|---|---|---|
| Build/typecheck | PASS | No repository-wide build or typecheck script applies. `node --check` passed for every changed executable JavaScript module. |
| Lint/format | PASS | `git diff --check` and `npx --yes yaml-lint` for both changed workflows passed. The repository defines no ESLint or formatter command for these packages. |
| Unit tests | PASS | Focused Apple trust, DMG verification, history reconciliation, native evidence, lifecycle-v2, workflow contract, and documentation-example suites passed. |
| Desktop suite | PASS | `npm test` in `apps/desktop` passed 125 tests with 0 failures. |
| CLI suite | PASS | `npm test` in `cli` passed 148 tests with 0 failures. |
| Integration | PASS | Tests exercise exact submitted/final DMG identities, request-history reconciliation, bounded recovery, source pinning, generic-rerun rejection, native architecture aggregation, Rosetta rejection, lifecycle stage construction, retention, and credential-boundary workflow contracts. |
| End-to-end/browser | NOT APPLICABLE | This slice changes release automation and evidence contracts; it has no product UI or browser flow. |
| Live protected Apple run | DEFERRED | This PR boundary has no Apple secrets and does not mutate protected environments. A fresh GitHub-hosted macOS notarization/native rehearsal is explicitly assigned to P9/I-9 after user-authorized environment cutover. |

## Trust and Recovery Coverage

- Preparation accepts only a candidate tag, pins the workflow dispatch SHA to
  exact current `origin/main`, serializes per candidate, and rejects generic
  workflow reruns after protected trust starts.
- Apple secrets are available only to the protected `release-trust` job and
  only at the individual signing/notarization steps that require them.
- The submitted signed DMG and final stapled DMG have separate immutable
  identities. The Apple request remains bound to the submitted artifact;
  native verification and lifecycle trust bind the final artifact.
- Recovery consumes retained exact bytes and the original attempt. An
  uncertain submission is resumed only when Apple history has exactly one
  matching request; zero or multiple matches fail closed without resubmission.
- Independent macOS ARM64 and Intel jobs reject translated execution and must
  aggregate to exactly one authoritative result per architecture.
- Schema-v2 trust evidence and lifecycle history are create-once, while the
  published schema-v1 reader remains compatibility-only.

## Environment Notes

- The full suites initially exhausted `/tmp` inodes because more than 500
  abandoned GateReeve test-fixture directories were present. Only exact
  GateReeve temporary fixture patterns were removed; both complete suites then
  passed. No repository or user document was deleted.
- Workflow syntax was checked locally, but GitHub-hosted runner behavior and
  Apple service behavior require the protected nonpublishing rehearsal.

## Known Failures

None in the pinned, locally executable scope.
