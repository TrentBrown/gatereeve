# Workflow Maintainer CLI

Repository-local QP CLI Core and CommanderJS tooling for composing, validating,
and releasing the Agentic Software Development Workflow plugin. It is not an
end-user prerequisite and is not published to npm.

Use [`../DEVELOPMENT.md`](../DEVELOPMENT.md) for the complete development
lifecycle and [`../RELEASING.md`](../RELEASING.md) for the guarded publication
runbook. This file is the concise CLI setup and command reference.

## Setup

```bash
cd cli
npm install
```

Node 22.12 or newer is required for maintainers.

The user-level `cli()` shell function finds the nearest ancestor containing a
`cli/package.json` with a `bin.cli` entry, so these commands work from anywhere
inside this checkout after setup. `npm start --` remains available from the
`cli` directory when the shell helper is not installed.

`qp-cli-core@1.7.1` declares an exact Node 23.3 engine even though its command
and help surfaces are verified on the supported Node 22.17 baseline. Npm emits
an advisory `EBADENGINE` warning during installation; the acceptance suite
proves the supported runtime directly.

## Current commands

```bash
# Compose both packages from plugin-src/shared plus platform overlays.
cli plugin build

# Compose one package with explicit provenance.
cli plugin build \
  --platform codex \
  --plugin-version 0.1.0 \
  --source-commit "$(git rev-parse HEAD)"

# Remove generated packages.
cli plugin clean

# Display the complete recursive command tree.
cli help --recurse

# Validate the workflow and platform contracts.
cli plugin validate

# Check canonical sources for inventory drift and non-portable content.
cli plugin lint

# Validate both native manifests, catalogs, and activation hooks.
cli plugin validate-native

# Inspect release tags, GitHub Actions runs, and the deployed marketplace.
cli plugin release list

# Verify the currently deployed marketplace release.
cli plugin release verify

# Create an offline ZIP and checksum for the deployed release.
cli plugin release bundle

# Run deterministic composition tests.
npm test
```

## Release commands

`release publish` is the normal maintainer entrypoint. The complete eligibility,
RC evidence, stable promotion, recovery, and post-release procedure lives in
[`../RELEASING.md`](../RELEASING.md).

```bash
# Interactively choose from proposed release versions.
cli plugin release publish

# Nonmutating preflight for the next release candidate.
cli plugin release publish --next-rc --dry-run

# Promote the deployed RC's exact source commit to stable.
cli plugin release publish --promote

# Begin a new patch, minor, or major line at rc.1.
cli plugin release publish --bump patch
cli plugin release publish --bump minor
cli plugin release publish --bump major

# Retain exact-tag control when needed.
cli plugin release publish --tag v0.1.0-rc.2

# Watch a release started elsewhere.
cli plugin release watch --tag v0.1.0-rc.2

# Bundle a verified release for repository-independent installation.
cli plugin release bundle --tag v0.1.0-rc.2 --output-dir ~/Downloads
```

Stable releases also require the Ubuntu RC evidence file; the default path is
`docs/releases/ubuntu-rc.json`. Automation can use `--yes --json`. A deliberately
asynchronous publication must use both `--no-wait` and `--no-verify`.

Computed versions use the currently deployed marketplace `RELEASE.json` as
their baseline, not merely the highest Git tag. Bare publication is interactive;
automation must provide `--tag`, `--next-rc`, `--promote`, or `--bump`. Patch,
minor, and major bumps begin a new RC line. Promotion tags and validates the
same source commit as the deployed RC, even when `main` has advanced.

`cli plugin release prepare` is the low-level, nonpublishing composer used by
the GitHub Actions release workflow. `cli plugin smoke-install` remains a
separate test of native-manager installation into disposable profiles.

`cli plugin release bundle` verifies the selected deployed release, archives
the exact marketplace commit, adds the repository's canonical `INSTALL.md` and
`USER-GUIDE.md`, and writes a SHA-256 sidecar. With no `--tag`, it selects the
currently deployed release. Existing artifacts are preserved unless `--force`
is supplied. The bundle contains both Codex and Claude packages and does not
require recipients to access this repository.

The build rejects symlinks and overlay collisions, removes stale package output,
sets the native manifest version, and records source provenance plus the shared
file inventory under `.workflow-build/` in each generated package.
