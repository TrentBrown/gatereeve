# GateReeve CLI

Commander.js and QP CLI Core tooling for observing and enforcing the GateReeve
workflow protocol. The same executable retains plugin composition, validation,
and release operations under the `plugin` namespace. It is optional: installed
native plugins invoke their packaged copy of the same protocol core directly.

Use [`../DEVELOPMENT.md`](../DEVELOPMENT.md) for the complete development
lifecycle and [`../RELEASING.md`](../RELEASING.md) for the guarded publication
runbook. This file is the concise CLI setup and command reference.

## Setup

```bash
cd cli
npm install
```

Node 22.12 or newer is required.

From the repository root, use `npm start --prefix cli -- <arguments>`. A local
or global installation of this package exposes `gatereeve <arguments>`. The
package stages an exact projection of the canonical plugin resources during
packing; do not edit the generated `cli/resources/` directory.

`qp-cli-core@1.7.1` declares an exact Node 23.3 engine even though its command
and help surfaces are verified on the supported Node 22.17 baseline. Npm emits
an advisory `EBADENGINE` warning during installation; the acceptance suite
proves the supported runtime directly.

## Workflow commands

```bash
# Concise current position, blockers, and next actions.
gatereeve status

# Focus on eligible and blocked semantic actions.
gatereeve next

# Explain a slice, gate, change, or current feature state.
gatereeve explain verification

# Read the append-only event history.
gatereeve history

# Render the current or complete state model as Mermaid.
gatereeve graph
gatereeve graph --model

# Assert an invariant for hooks or CI.
gatereeve check boundary-ready
```

All workflow commands accept `--json`. Queries exit zero whenever a projection
can be produced, including a blocked or stale projection. `check` exits nonzero
when its named assertion fails. Current boundary fingerprints and external
facts can be supplied to observer commands with `--fingerprints-file` and
`--facts-file`.

Mutation families are semantic: `feature`, `slice`, `boundary`, `gate`, and
`change`. Use recursive help for their exact evidence and guard-input options:

```bash
gatereeve help feature --recurse 2
gatereeve help slice --recurse 2
gatereeve help gate --recurse 2
```

`--human-confirmed <label>` records an explicit human confirmation observed in
conversation or at the terminal. It is an audit statement for cooperative
agents, not identity authentication. There is no generic `advance` or workflow
force switch.

## Maintainer commands

```bash
# Compose both packages from plugin-src/shared plus platform overlays.
gatereeve plugin build

# Compose one package with explicit provenance.
gatereeve plugin build \
  --platform codex \
  --plugin-version 0.1.0 \
  --source-commit "$(git rev-parse HEAD)"

# Remove generated packages.
gatereeve plugin clean

# Display the complete recursive command tree.
gatereeve help --recurse

# Validate the workflow and platform contracts.
gatereeve plugin validate

# Check canonical sources for inventory drift and non-portable content.
gatereeve plugin lint

# Validate both native manifests, catalogs, and activation hooks.
gatereeve plugin validate-native

# Inspect release tags, GitHub Actions runs, and the deployed marketplace.
gatereeve plugin release list

# Verify the currently deployed marketplace release.
gatereeve plugin release verify

# Create an offline ZIP and checksum for the deployed release.
gatereeve plugin release bundle

# Run deterministic composition tests.
npm test
```

## Release commands

`release publish` is the normal maintainer entrypoint. The complete eligibility,
RC evidence, stable promotion, recovery, and post-release procedure lives in
[`../RELEASING.md`](../RELEASING.md).

```bash
# Interactively choose from proposed release versions.
gatereeve plugin release publish

# Nonmutating preflight for the next release candidate.
gatereeve plugin release publish --next-rc --dry-run

# Promote the deployed RC's exact source commit to stable.
gatereeve plugin release publish --promote

# Begin a new patch, minor, or major line at rc.1.
gatereeve plugin release publish --bump patch
gatereeve plugin release publish --bump minor
gatereeve plugin release publish --bump major

# Retain exact-tag control when needed.
gatereeve plugin release publish --tag v0.1.0-rc.2

# Watch a release started elsewhere.
gatereeve plugin release watch --tag v0.1.0-rc.2

# Bundle a verified release for repository-independent installation.
gatereeve plugin release bundle --tag v0.1.0-rc.2 --output-dir ~/Downloads
```

Stable releases also require the Ubuntu RC evidence file; the default path is
`docs/releases/ubuntu-rc.json`. Automation can use `--yes --json`. A deliberately
asynchronous publication must use both `--no-wait` and `--no-verify`.

Computed versions use the currently deployed marketplace `RELEASE.json` as
their baseline, not merely the highest Git tag. Bare publication is interactive;
automation must provide `--tag`, `--next-rc`, `--promote`, or `--bump`. Patch,
minor, and major bumps begin a new RC line. Promotion tags and validates the
same source commit as the deployed RC, even when `main` has advanced.

`gatereeve plugin release prepare` is the low-level, nonpublishing composer used by
the GitHub Actions release workflow. `gatereeve plugin smoke-install` remains a
separate test of native-manager installation into disposable profiles.

`gatereeve plugin release bundle` verifies the selected deployed release, archives
the exact marketplace commit, adds the repository's canonical `INSTALL.md` and
`USER-GUIDE.md`, and writes a SHA-256 sidecar. With no `--tag`, it selects the
currently deployed release. Existing artifacts are preserved unless `--force`
is supplied. The bundle contains both Codex and Claude packages and does not
require recipients to access this repository.

The build rejects symlinks and overlay collisions, removes stale package output,
sets the native manifest version, and records source provenance plus the shared
file inventory under `.workflow-build/` in each generated package.
