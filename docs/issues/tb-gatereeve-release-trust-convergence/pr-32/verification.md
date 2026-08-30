# PR 32 Verification

**Verdict:** PASS

**Pinned diff:** `4a6a680be51b5b0c2b9454497a8950df739e1805..6641b2842a94100a3a72d1e8806ddc7f3f05cbcf`

## Verification Matrix

| Category | Result | Command and evidence |
|---|---|---|
| Build/typecheck | PASS | No repository build or typecheck script applies. `node --check` passed for every changed executable module. |
| Lint/format | PASS | `git diff --check` passed. The repository defines no ESLint or formatter command for Desktop or CLI. |
| Unit tests | PASS | Focused lifecycle, attempt, and Apple-orchestration tests passed, including transition/history consistency, exact tag/version pairing, and mandatory Apple response request identity. |
| Desktop suite | PASS | `npm test` in `apps/desktop` passed 121 tests with 0 failures. |
| CLI suite | PASS | `env TMPDIR=/home/trent/code/tb/gatereeve-cli-tests.QYTpRW npm test` in `cli` passed 142 tests with 0 failures. The dedicated directory was deleted afterward. |
| Integration | PASS | `apple-trust.test.js` exercises durable files and injected Apple command sequencing through submit, poll, timeout, recovery, uncertainty, malformed output, rejection, response identity, and changed-byte refusal. CLI tests exercise real v1/v2 dispatch and the committed RC.2 record. |
| End-to-end/browser | NOT APPLICABLE | This slice has no product UI or browser flow. |
| Application runtime | NOT APPLICABLE | No running GateReeve screen or service changes. Protected Apple runner integration is intentionally assigned to P3-P4 and final rehearsal P9. |

## Environment Notes

- The isolated worktree initially had no `node_modules`. `npm ci` restored the
  committed lockfile dependencies for Desktop and CLI; no dependency or
  lockfile changed and both audits reported zero vulnerabilities.
- Repeated full-suite execution filled the host's 16 GB `/tmp` tmpfs with
  test fixtures. One CLI invocation failed with `ENOSPC`; rerunning the exact
  suite alone with a dedicated disk-backed `TMPDIR` passed 142/142. This was an
  environment-capacity failure, not a test assertion failure.

## Negative Coverage

- Skipped, duplicated, reordered, unknown, and tampered lifecycle stages.
- Source/reservation/artifact identity drift and changed DMG bytes under one
  candidate version.
- Durable `submitting` before Apple invocation, ambiguous runner loss,
  malformed submission output, and prohibited automatic resubmission.
- Exactly 60 pending polls at the 30-second policy interval, durable timeout,
  and recovery against the original request ID.
- Apple rejection; missing/mismatched response request IDs; impossible attempt
  transitions; polling/session/history drift; rewritten reconciliation or
  supersession summaries; mismatched tag/version pairs; and fresh-version
  supersession.
- Byte-for-byte preservation and read-only dispatch of the published RC.2 v1
  record.

## Boundary Remediation

- Attempt 1 added explicit transition-graph and materialized-summary/history
  consistency validation (`106b7e5`).
- Attempt 2 required exact tag/version pairing and mandatory request identity
  in Apple status responses (`6641b28`).
- Attempt 3 pins and evaluates the complete remediated diff.

## Known Failures

None.
