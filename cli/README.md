# GateReeve CLI

Commander.js tooling for observing and enforcing the GateReeve
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

The command tree uses pinned `commander` plus a repository-local recursive help
renderer. It has no exact non-LTS engine dependency and installs without an
expected `EBADENGINE` advisory.

## Workflow commands

```bash
gatereeve status --json
gatereeve run resume-current --implementer <context> --planning approvals.json
gatereeve validate-spec
gatereeve candidate --pin app=<base-sha>..<head-sha> --criterion R1 --scope SLICE
gatereeve ready
gatereeve evaluate verification --configuration verification.json
gatereeve evaluate code spec --provider claude-code --model opus --consume verification.json
gatereeve evaluate judge --provider claude-code --model opus --consume verification.json
gatereeve milestone check acceptance --json
gatereeve decide --help
gatereeve merge prepare --help
```

The planning backbone remains interview, approved design, validated spec,
plan/issues, and explicit implementation authority. The model chooses work order
inside that phase. Ready declares intent; evaluation runs only when requested.
Required proof, accepted exceptions and authority govern milestone passage.
No fixed remediation limit or per-commit gate exists.

Use `gatereeve help --recurse` for exact options. Native plugins call the same
current core directly; the CLI is optional. Historical journals remain untouched.
Resume records observed approvals without replaying an old state machine.
Parent-folder requirements and retained evidence need not be Git tracked.

For example, `verification.json` for a repository aliased `app` can contain:

```json
{
  "checks": [{ "repository": "app", "command": "npm", "args": ["test"], "purpose": "Project tests" }],
  "externalRuntimeInputs": { "app": [] }
}
```

Use an empty list only after establishing that the checks have no additional
external dependencies beyond the inputs captured automatically. Otherwise list
the absolute dependency files or roots. The old `--checks` shortcut is retired;
it cannot express this scope commitment. Use `--configuration` for runner checks.

Runner checks contain command, args, repository and purpose. The native operation
requires `configuration.externalRuntimeInputs` for each checked repository, listing absolute external dependency roots/files (an explicit empty array declares no additional external inputs). Executable/shebang chains, known package trees and resolvable argument files are bound automatically; opaque dependencies must be declared conservatively. The runner
also accepts configuration.runtimeInputs (repository alias to relative paths) for
additional runtime dependencies/configuration, and explicit external validUntil
conditions. All inherited environment values are hashed and the runner receives that frozen environment; values are not logged. Environment differences conservatively invalidate runner proof. Installed
node_modules and .venv bytes and executable identity are included automatically.
Unknown external state requires fresh evidence or an explicit scoped exception.

A human decision records the actual instruction and scope. It does not authenticate
the speaker. Merge preparation produces an exact action for authorization; the
protected adapter rechecks evidence, branch direction, PR identity and hosted
checks. SessionStart guides the model; arbitrary shell actions are not intercepted.

## Maintainer commands

```bash
# Compose every registered plugin for both native platforms.
gatereeve plugin build

# Compose every registered Codex package with explicit provenance.
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

New coordinated releases use schema-v2 hosted preparation, read-only
finalization, protected dry run, and separately approved publication. Local CLI
commands inspect retained packets and support exact-record recovery; they are
not an alternate production authority. The complete procedure lives in
[`../RELEASING.md`](../RELEASING.md).

```bash
# Inspect candidate checksums, trust, approval, and per-surface state.
gatereeve plugin release inspect-record \
  --release-record /path/to/coordinated-release/release-record.json

# Inspect the sealed schema-v2 primary publication packet.
gatereeve plugin release inspect-hosted \
  --release-record /path/to/hosted-publication/release-record.json

# Run read-only preflights against the exact sealed primary plan.
gatereeve plugin release publish-hosted \
  --release-record /path/to/hosted-publication/release-record.json \
  --plan-sha256 <PLAN_SHA256> \
  --dry-run

# Create a record locally from already verified candidate inputs.
gatereeve plugin release coordinate --help

# Watch a release started elsewhere.
gatereeve plugin release watch --tag v0.1.0-rc.2

# Bundle a verified release for repository-independent installation.
gatereeve plugin release bundle --tag v0.1.0-rc.2 --output-dir ~/Downloads

# Inspect the separate Cask record linked to completed primary publication.
gatereeve plugin release inspect-cask-hosted \
  --cask-record /path/to/linked-cask/cask-record.json

# Run read-only Cask preflights against its separately sealed plan.
gatereeve plugin release publish-cask-hosted \
  --cask-record /path/to/linked-cask/cask-record.json \
  --plan-sha256 <CASK_PLAN_SHA256> \
  --dry-run
```

An ad-hoc development record is intentionally not publishable. Hosted
publication requires complete Developer ID trust evidence, both native
verification authorities, exact finalization, the inspected plan digest, and
approval from `release-publication`. A dry run records no approval and has no
write token.

`gatereeve plugin release prepare`, `coordinate`, `finalize-hosted`, and
`prepare-cask-hosted` are low-level nonpublishing workflow operations.
`finalize-hosted` rejects Plugin, DMG, or native evidence inputs that differ
from the trusted lifecycle. `prepare-cask-hosted` accepts only a completed
primary record and binds direct public-DMG installation and launch proof.
Schema-v1 coordinated and Cask commands remain readable for immutable history;
their publication commands are no longer exposed. New release mutation is
reachable only through `release-conductor.yml` `start` or `resume`.
`gatereeve plugin smoke-install` remains a separate native-manager test.

`gatereeve plugin release bundle` verifies the selected deployed release, archives
the exact marketplace commit, adds the repository's canonical `INSTALL.md` and
`USER-GUIDE.md`, and writes a SHA-256 sidecar. With no `--tag`, it selects the
currently deployed release. Existing artifacts are preserved unless `--force`
is supplied. The bundle contains both Codex and Claude packages and does not
require recipients to access this repository.

The build rejects symlinks and overlay collisions, removes stale package output,
sets the native manifest version, and records source provenance plus the shared
file inventory under `.workflow-build/` in each generated package.

### Candidate readiness and explicit evaluation

`gatereeve candidate --pin <alias=base..head> --criterion <id> --scope FEATURE`
retains the selected source and approved local requirements. FEATURE scope uses
each repository's configured original `featureBaseSha`. `gatereeve ready`
records readiness without launching a reviewer. The model requests evaluations
explicitly with `gatereeve evaluate <gates...>` and chooses their order within
the authorized phase. Code and spec may share one fresh independent evaluator;
each retains its own verdict. Judge remains independently required.

`gatereeve status` shows milestone blockers and any accepted exceptions with
their original outcomes and consequences. `--json` retains full structured
detail. The installed plugin exposes the same current protocol without requiring
this optional CLI. See `resources/commands/advisory-review.md` for readiness and
`resources/commands/pr-boundary.md` for the required milestone obligations.

When the merge target has advanced since the original feature base, fetch its full
commit and include `--target app=<target-sha>` with `gatereeve candidate`. Keep
`--pin app=<original-feature-base>..<head>` for a FEATURE assessment. GateReeve exports
the target snapshot for interaction review, invalidates affected proof when it changes,
and requires the protected merge action to match that assessed target.
