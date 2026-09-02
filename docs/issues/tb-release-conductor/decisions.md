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
