# Decision Scratchpad - tb-release-conductor

**Feature start:** 2026-09-01

Working record of decisions made during this feature's lifetime. Append entries
across delivery sessions. Triage at the PR boundary; promoted entries are
appended to `decisions.md`.

## [1] Replace qp-cli-core instead of adopting its exact Node runtime

[x] **Promote**

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

## [2] Deliver the clean workflow cutover atomically

[x] **Promote**

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

## [3] Remove legacy local publication commands and bind retained mutation commands

[x] **Promote**

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

## [4] Require both conductor operations to execute from exact current main

[x] **Promote**

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

## [5] Separate PR Cask rehearsal provenance from production provenance

[x] **Promote**

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

## [6] Keep container acceptance hermetic for workflow and Git fixtures

[x] **Promote**

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
