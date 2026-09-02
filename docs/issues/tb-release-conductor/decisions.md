# Decisions - tb-release-conductor

**Feature start:** 2026-09-01

Permanent record of decisions promoted from `scratchpad.md`.

---

## Replace qp-cli-core instead of adopting its exact Node runtime

**Confidence:** HIGH

**Blast Radius:** CLI imports, dependency lockfile, command-tree help, and all
Node-based CI/release jobs

GateReeve uses `qp-cli-core@1.7.1` only for Commander exports and
`addTreeCommand`, but that package declares `engineStrict` with exact Node
`23.3.0`, has no newer published release, and brings unrelated AWS dependencies.
GateReeve will depend directly on `commander` and preserve its tested command-
tree behavior in a small repository-local helper. Jobs will use Node 24 LTS.

**Triggered by:** The approved requirement to eliminate engine warnings while
retaining an active LTS product runtime.

**Alternatives considered:**
- Run all jobs on Node 23.3.0 - rejected because Node 23 is non-LTS and obsolete.
- Wait for or publish a new `qp-cli-core` - rejected because no compatible
  release/source repository is available inside this feature and publication
  would create a separate external dependency release.
- Hide npm engine warnings - rejected because it conceals rather than resolves
  the declared incompatibility.

**Promoted:** 2026-09-01.

---

## Deliver the clean workflow cutover atomically

**Confidence:** HIGH

**Blast Radius:** Release workflow triggers, publication authority, runbook,
and feature PR structure

P1-P7 will use one feature-final delivery slice. Internal commits remain
layered, but reusable-only phase workflows, the conductor, removal of the
legacy publisher, and the runbook change must reach `main` together.

**Triggered by:** The user-approved full cutover with no backward-compatible
manual entry points.

**Alternatives considered:**
- Merge phase conversions before the conductor - rejected because production
  would temporarily lose a complete operator path.
- Merge the conductor before removing alternate publishers - rejected because
  tag and manual paths could bypass or race the conductor ledger.

**Promoted:** 2026-09-01.

---

## Remove legacy local publication commands and bind retained mutation commands

**Confidence:** HIGH

**Blast Radius:** Public CLI command tree, release documentation, and hosted
publication command authorization

The old local `publish`, schema-v1 `publish-coordinated`, and schema-v1
`publish-cask` commands are removed from the CLI. The schema-v2
`publish-hosted` and `publish-cask-hosted` commands remain because reusable
workflows execute them, but confirmation now fails unless the runtime is a
dispatched GitHub Actions Release Conductor. Read-only inspection, dry runs,
listing, watching, verification, and bundling remain available.

**Triggered by:** The user-approved clean jump with no backward-compatible
manual production entry points.

**Alternatives considered:**
- Remove only workflow dispatches - rejected because the old local command
  would still create tags and then wait for a tag-triggered workflow that no
  longer exists.
- Keep schema-v1 mutation for historical compatibility - rejected because
  immutable schema-v1 history remains readable without retaining a second
  publication path.
- Hide internal schema-v2 commands without authorization checks - rejected
  because help visibility is not an execution boundary.

**Promoted:** 2026-09-01.

---

## Require both conductor operations to execute from exact current main

**Confidence:** HIGH

**Blast Radius:** Release Conductor dispatch preflight and protected release
authority

Both `start` and `resume` must prove that the selected workflow ref and checked
out implementation are the exact current `origin/main` commit before any phase
job can run. Retained release state may pin an older product source commit, but
the orchestration code that interprets that state must itself be reviewed
mainline code.

**Triggered by:** Pinned-diff code review found that only `start` rejected a
topic-branch dispatch, allowing `resume` to use unreviewed conductor code.

**Alternatives considered:**
- Trust environment approval to catch a topic-branch resume - rejected because
  approval is an authority boundary, not source-code validation.
- Allow any branch whose source commit is an ancestor of main - rejected
  because that validates released product bytes, not the conductor code that
  is asking for authority.

**Promoted:** 2026-09-01. PR: https://github.com/TrentBrown/gatereeve/pull/52.

---

## Separate PR Cask rehearsal provenance from production provenance

**Confidence:** HIGH

**Blast Radius:** `.github/workflows/homebrew-cask-smoke.yml` pull-request
smoke and conductor-called production smoke

Allow the `pull_request` rehearsal to validate and consume the pinned last
successful legacy `homebrew-cask-publish.yml` artifact, because that path is
read-only and exists to regression-test installation before the first conductor
release. For `workflow_call`, require the supplied run to be the current owning
Release Conductor run, preserving strict production provenance. The
event-specific distinction must be explicit in the guard rather than weakening
both paths.

**Triggered by:** PR #52 Homebrew Cask Smoke rejected the last successful
pre-conductor publication run after the production provenance guard was
tightened.

**Alternatives considered:**
- Require a conductor artifact for PR smoke - rejected because it is impossible
  before the conductor is merged and run.
- Disable PR Cask smoke - rejected because it loses native install regression
  coverage.
- Accept either workflow for every event - rejected because it weakens
  production provenance.

**Promoted:** 2026-09-02. PR: https://github.com/TrentBrown/gatereeve/pull/52.

---

## Keep container acceptance hermetic for workflow and Git fixtures

**Confidence:** HIGH

**Blast Radius:** `Dockerfile.acceptance` and Release Conductor CLI discovery
tests in Ubuntu 22.04/24.04 container CI

Copy `plugin-ci.yml` into the acceptance image because it is now an explicit
workflow contract input. Keep `.git` excluded; the discovery CLI test must
initialize its own minimal repository and commit, then execute discovery from
that repository so ancestry behavior is tested without coupling the image to
host Git metadata.

**Triggered by:** PR #52 container jobs could not read the newly asserted
`plugin-ci.yml` contract and the discovery CLI test assumed the checkout's
excluded `.git` directory.

**Alternatives considered:**
- Copy the entire `.github` tree - rejected because the image should declare
  its contract inputs narrowly.
- Include the host `.git` directory - rejected because it is large,
  non-hermetic, and leaks checkout-specific metadata.
- Bypass ancestry in containers - rejected because that weakens the
  production-relevant test.

**Promoted:** 2026-09-02. PR: https://github.com/TrentBrown/gatereeve/pull/52.

---

## Chain evidence-only CI skips to the immediately preceding successful head

**PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

**Confidence:** HIGH

**Blast Radius:** Plugin CI and Homebrew Cask Smoke pull-request execution

Classify only the `synchronize` event's predecessor-to-current commit delta,
not the cumulative PR diff, and permit the reduced review-artifact path only
when the same workflow completed successfully for the exact predecessor SHA.
This creates a transitive success chain back to a fully tested source head while
allowing later evidence-only commits to remain cheap. Non-PR runs, unrecognized
paths, a non-ancestral delta, or a missing predecessor success always receive
the full workflow. Cancellation is limited to pull-request concurrency groups.

**Triggered by:** Evidence-only boundary commits reran the complete Plugin CI
and four-job Cask smoke matrices after their source head had already passed.

**Alternatives considered:**
- Add broad `paths-ignore` rules - rejected because PR path filters evaluate the
  cumulative PR diff and because broad documentation exclusions could hide
  requirement or implementation changes.
- Trust the evidence-only filename allowlist alone - rejected because a failing
  source head could otherwise gain a green successor without executing tests.
- Move evidence outside Git - rejected because durable review records are part
  of the approved workflow and should remain reviewable with the change.

**Promoted:** 2026-09-02. PR: https://github.com/TrentBrown/gatereeve/pull/52.

---

## Retry only the observed transient hdiutil verification error

**PR:** [#52](https://github.com/TrentBrown/gatereeve/pull/52)

**Confidence:** HIGH

**Blast Radius:** Development and release DMG creation and package verification

Route both DMG verification call sites through one helper that makes at most
three attempts with one- and two-second backoff. Retry only when the command's
message, stdout, or stderr contains Apple's observed `Resource temporarily
unavailable` result. Preserve the original error object after the bound and
fail every checksum, signature, malformed-image, or other error immediately.

**Triggered by:** The otherwise valid macOS package job failed once with
transient `hdiutil` resource contention and passed unchanged on rerun.

**Alternatives considered:**
- Retry the entire packaging job - rejected because it repeats far more work
  and obscures which operation was transient.
- Retry every `hdiutil` error - rejected because invalid or corrupted DMGs must
  fail immediately.
- Retry create, attach, and detach too - rejected because only `verify` has
  observed evidence supporting this narrowly bounded exception.

**Promoted:** 2026-09-02. PR: https://github.com/TrentBrown/gatereeve/pull/52.

---

## Isolate hosted-command rejection tests from the parent CI context

**PR:** [#54](https://github.com/TrentBrown/gatereeve/pull/54)

**Confidence:** HIGH

**Blast Radius:** Release Conductor plugin-candidate validation and the CLI
hosted-mutation guard regression test

Run the rejection test's child processes with the three Release Conductor
authorization variables removed. The production guard remains unchanged; the
test now constructs the outside-conductor context it claims to exercise even
when its parent test suite is itself running inside the conductor.

**Triggered by:** RC.9 candidate validation inherited `GITHUB_ACTIONS=true`,
`GITHUB_WORKFLOW=Release Conductor`, and
`GITHUB_EVENT_NAME=workflow_dispatch`, causing the negative test to pass the
production guard and fail later on its intentionally nonexistent fixture.

**Alternatives considered:**
- Weaken or reorder the production guard - rejected because its behavior was
  correct under the real hosted context.
- Skip this test inside the conductor - rejected because candidate validation
  should retain the negative authorization regression coverage.
- Replace the nonexistent fixture with a valid release record - rejected
  because that would test a different, authority-bearing path.

**Promoted:** 2026-09-02. PR: https://github.com/TrentBrown/gatereeve/pull/54.

---

## Extend bounded hdiutil retries to observed creation contention

**Confidence:** HIGH

**Blast Radius:** macOS DMG creation in pull-request CI and trusted release
packaging

Apply the existing three-attempt exponential-backoff helper to both `hdiutil
create` and `hdiutil verify`, and recognize only Apple's two observed resource
contention messages: `Resource busy` and `Resource temporarily unavailable`.
Remove the exact destination before each creation attempt so a partial failed
image cannot poison the retry. All other creation, integrity, and signing
errors continue to fail on the first attempt.

**Triggered by:** PR #54's universal macOS package failed during `hdiutil
create` with `Resource busy`, providing the concrete evidence that the earlier
verify-only retry decision required.

**Alternatives considered:**
- Rerun the failed job without changing the implementation - rejected because
  the same transient can abort trusted RC packaging.
- Retry the entire package job - rejected because it repeats universal app
  assembly and makes the failing operation less visible.
- Retry every `hdiutil` failure - rejected because invalid inputs and corrupted
  images must remain immediate failures.

**Promoted:** 2026-09-02. PR: https://github.com/TrentBrown/gatereeve/pull/54.

---

## Forward only declared Apple secrets into reusable trust workflows

**Confidence:** HIGH

**Blast Radius:** Release Conductor Apple trust preparation and bounded trust
recovery

Declare the three preparation secrets and the single recovery secret in their
respective `workflow_call` contracts, then map only those names from the
conductor. Do not use `secrets: inherit`; unrelated repository credentials must
not become available to the reusable trust workflows. Protected environment
approval, read-only token permissions, and secret use inside only the native
trust jobs remain unchanged.

**Triggered by:** RC.10 reached protected Desktop trust with valid environment
variables but empty certificate, password, and notary-key values because the
caller had not forwarded repository secrets across the reusable-workflow
boundary.

**Alternatives considered:**
- Use `secrets: inherit` - rejected because it forwards every available
  repository secret, including credentials unrelated to Apple trust.
- Copy the signing steps into the conductor - rejected because it duplicates
  the protected reusable phase and weakens the single trust implementation.
- Move the existing repository secrets into the environment without changing
  the call contract - rejected because reusable workflows still require an
  explicit secret-passing boundary and the existing names are already valid.

**Promoted:** 2026-09-02. PR: https://github.com/TrentBrown/gatereeve/pull/55.

---

## Read primary publication identity from the schema-v2 lifecycle

**Confidence:** HIGH

**Blast Radius:** Release Conductor state checkpoint immediately after hosted
primary publication

Require the hosted publication result to be a published schema-v2 lifecycle,
then read the exact public DMG digest from its single `distribution-finalized`
stage. Keep the raw release-record SHA-256 as the immutable publication receipt
identity. Put this logic in an executable, unit-tested reader instead of an
inline workflow expression.

**Triggered by:** RC.11 published all primary surfaces successfully, but the
following `primary-published-state` job attempted to read the old schema-v1
projection path `record.candidates.desktop.artifact.sha256` from the schema-v2
lifecycle record and stopped before recording `PRIMARY_PUBLISHED`.

**Alternatives considered:**
- Restore a schema-v1 record as the publication result - rejected because the
  schema-v2 lifecycle and receipt journal are the authoritative resumable
  publication evidence.
- Read the nested stage with another inline `node -e` block - rejected because
  the production schema mismatch needs executable regression coverage.
- Rebuild or republish RC.11 - rejected because every primary surface already
  converged successfully and the retained result artifact is complete.

**Promoted:** 2026-09-02. PR: https://github.com/TrentBrown/gatereeve/pull/57.

---

## Use an explicit status guard after direct-install resume

**Confidence:** HIGH

**Blast Radius:** Release Conductor transition from a retained
`WAITING_FOR_DIRECT_INSTALL` checkpoint into Homebrew Cask finalization

Evaluate Cask finalization under `always()` and then require the direct
`require-direct-install` dependency to have succeeded. This preserves the
intended fail-closed condition while preventing GitHub's implicit `success()`
status function from propagating an intentionally skipped same-run ancestor.

**Triggered by:** RC.11 accepted the exact public-DMG installation attestation,
but skipped `cask-finalize` because the current resume run intentionally
skipped `waiting-for-direct-install`; the downstream reusable-workflow call
lacked the explicit status guard used by the surrounding recovery jobs.

**Alternatives considered:**
- Dispatch Cask finalization directly - rejected because the Release Conductor
  is the sole production entry point and must retain the attestation chain.
- Record another waiting checkpoint before accepting the attestation - rejected
  because the existing retained checkpoint is already authoritative and a
  duplicate state transition is invalid.
- Remove the success check entirely - rejected because Cask finalization must
  remain blocked unless the exact direct-install attestation succeeds.

**Promoted:** 2026-09-02.
