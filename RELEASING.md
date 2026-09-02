# Releasing GateReeve

This is the maintainer runbook for a coordinated GateReeve Plugin, signed
Desktop, update-manifest, and Homebrew Cask release. The source change and
version bump must already be reviewed and merged to `main`.

Complete [`APPLE-RELEASE-SETUP.md`](APPLE-RELEASE-SETUP.md) before the first
release. GitHub stores the Apple and publication credentials; a release never
requires copying those values into a dispatch form.

## Release model

`release-conductor.yml` is the only manual production release entry point. It
has two operations:

- `start` pins the exact current `main`, validates one fresh RC tag and every
  Plugin/Desktop version, then carries the release through primary publication.
- `resume` discovers the unique retained state for a tag and continues from
  its first incomplete stage. At the direct-install boundary it also records
  the authenticated installed-and-launched attestation.

The phase workflows are internal reusable workflows. Do not dispatch them,
create a release tag manually, invoke the marketplace or Cask publishers
locally, or use GitHub's generic **Re-run jobs** as a recovery mechanism.

The conductor pauses only before these real authority boundaries:

1. Apple signing and notarization in `release-trust`;
2. exact primary publication in `release-publication`;
3. exact linked Cask publication in `release-publication`.

Finalization and rehearsals are automatic and read-only. They receive no
publication credential and do not create protected deployments merely to
calculate a plan.

## 1. Prepare reviewed source

Choose the next RC identity in the normal source PR. The base version must agree
in all of these files before merge:

- `cli/package.json`;
- `apps/desktop/package.json`;
- `plugin-src/codex/.codex-plugin/plugin.json`;
- `plugin-src/claude/.claude-plugin/plugin.json`.

Update any other release notes or product metadata required by that source
change, run the ordinary verification ladder, and merge the PR. The conductor
does not edit version files or create a version-bump PR.

Confirm the local checkout sees the reviewed head:

```bash
git fetch origin main
git log -1 --oneline origin/main
```

## 2. Start the release

Set a fresh canonical RC tag and dispatch the conductor from `main`:

```bash
RC_TAG=v0.1.0-rc.9
gh workflow run release-conductor.yml \
  --repo TrentBrown/gatereeve \
  --ref main \
  -f operation=start \
  -f tag="$RC_TAG"
```

Open the run:

```bash
gh run list \
  --repo TrentBrown/gatereeve \
  --workflow release-conductor.yml \
  --limit 5
```

The preflight rejects a non-current source, malformed or existing RC tag, or
version disagreement before any credential or public mutation is reachable.

## 3. Approve Apple trust

At the `release-trust` deployment, verify the tag and pinned source shown by the
run, then approve the protected job. That job builds one universal DMG, signs
it with Developer ID, notarizes and staples it, and verifies the exact retained
bytes natively on Apple Silicon and Intel.

The first Plugin artifact is uploaded with hidden files, downloaded again, and
verified against its complete integrity manifest before Apple authority is
used. The trust artifacts also retain the submitted DMG, application archive,
notarization attempt, and Apple request history for bounded recovery.

## 4. Approve primary publication

The conductor automatically seals and rehearses the primary publication plan.
Review the job summary, exact plan SHA-256, source, Plugin tree, trusted DMG,
update-manifest bytes, and rehearsal result at the primary
`release-publication` deployment.

Approval publishes only the sealed plan and appends receipts as each surface
converges. The generated metadata pull request is restricted to
`workflow-site/releases/desktop.json`; its deterministic branch, retained base,
sole path, exact bytes, and digest are verified before merge. Because that is a
generated transport-only PR, full Plugin/Desktop CI is intentionally skipped
when it is the sole changed path. Mixed changes still run the full matrix.

After successful primary publication, the conductor records
`WAITING_FOR_DIRECT_INSTALL` and ends successfully. This is expected.

## 5. Install and launch the exact public DMG

On a machine other than the build runner, download the DMG from the GitHub
prerelease for the exact tag, install GateReeve, and launch it successfully.
Do not continue based on a locally rebuilt package.

You may inspect the public release before installation:

```bash
gh release view "$RC_TAG" \
  --repo TrentBrown/gatereeve \
  --json tagName,isPrerelease,assets
```

## 6. Resume and attest

Only after the exact public DMG has been installed and launched, resume by tag
with the explicit attestation:

```bash
gh workflow run release-conductor.yml \
  --repo TrentBrown/gatereeve \
  --ref main \
  -f operation=resume \
  -f tag="$RC_TAG" \
  -f direct_install_confirmed=true
```

The conductor supplies the authenticated GitHub actor and timestamp and binds
the attestation to the public DMG SHA-256 already in the retained state. No run
ID, plan digest, confirmer name, or timestamp is copied by hand.

It then automatically finalizes and rehearses the linked Cask plan, pauses at
the distinct Cask publication approval, publishes the exact Cask, and runs all
four required checks:

- linked-record install/upgrade on Apple Silicon;
- linked-record install/upgrade on Intel;
- literal public-tap install on Apple Silicon;
- literal public-tap install on Intel.

Approve Cask publication only after reviewing its separate plan and rehearsal.
`COMPLETE` is emitted only after all four smoke artifacts exist.

## Status and evidence

Every checkpoint uploads a 30-day retained artifact named for the tag, sequence,
and stage. It contains:

- `release-state.json` — latest canonical state;
- `release-state-chain.json` — the full SHA-256-linked chain;
- `release-state.sha256` — latest state digest;
- `release-status.json` — machine-readable dashboard projection;
- `release-summary.md` — the same status rendered in the Actions summary.

To find the current run without copying internal identifiers:

```bash
gh run list \
  --repo TrentBrown/gatereeve \
  --workflow release-conductor.yml \
  --limit 20
```

To download a particular run's conductor checkpoints for audit:

```bash
RUN_ID=<RUN_ID>
gh run download "$RUN_ID" \
  --repo TrentBrown/gatereeve \
  --pattern "gatereeve-$RC_TAG-release-conductor-*" \
  --dir "release-state-$RC_TAG"
```

## Failure and recovery

Use `resume` with the same tag after a failed or interrupted conductor run:

```bash
gh workflow run release-conductor.yml \
  --repo TrentBrown/gatereeve \
  --ref main \
  -f operation=resume \
  -f tag="$RC_TAG"
```

Resume validates every retained state record, digest link, source ancestor,
workflow identity, artifact name, and run conclusion. It rejects missing,
expired, malformed, or divergent histories rather than guessing.

When eligible Apple evidence exists, resume uses the retained submitted bytes
and request history through bounded trust recovery. It never rebuilds,
re-signs, or silently resubmits those bytes. Read-only phases may be recomputed;
publication phases converge from their persisted receipts and skip completed
surfaces.

If the latest state says `BURN_RC`, or trusted bytes must change, or immutable
public history conflicts, preserve the evidence, fix the source through normal
review, and start a new RC identity. Do not delete or retarget a tag, Apple
request, release, publication receipt, or Cask to make the old identity fit.

## Post-merge operational acceptance

Workflow contract tests can prove routing, permissions, schemas, and dry-run
behavior without credentials. A newly deployed conductor still needs one real
release rehearsal to prove the repository's external configuration:

```bash
gh api repos/TrentBrown/gatereeve/environments/release-trust
gh api repos/TrentBrown/gatereeve/environments/release-publication
```

Retain the real Actions evidence showing both protected waits, Apple trust,
primary publication, direct installation, Cask publication, and public ARM64
and Intel smoke. GitHub's native Intel runner is the hosted Intel authority;
Rosetta is an acceptable local substitute when no Intel Mac is available.

## Release checklist

- [ ] Version source PR reviewed, verified, and merged to current `main`.
- [ ] Fresh canonical RC tag selected; no tag or release already exists.
- [ ] Conductor `start` preflight passed.
- [ ] Apple trust deployment reviewed and approved.
- [ ] Automatic primary finalization and rehearsal passed.
- [ ] Primary publication deployment reviewed and approved.
- [ ] Exact public DMG installed and GateReeve launched.
- [ ] Conductor `resume` dispatched with the explicit attestation.
- [ ] Automatic Cask finalization and rehearsal passed.
- [ ] Cask publication deployment reviewed and approved.
- [ ] ARM64 and Intel linked/public Cask checks passed.
- [ ] Latest `release-status.json` reports `COMPLETE`.
