# GateReeve Desktop

GateReeve Desktop is the optional, read-only Electron observer for a local
GateReeve feature worktree. It consumes a staged copy of the canonical
GateReeve protocol directly; the optional Commander CLI is not a runtime
dependency.

The GateReeve Plugin is the required workflow-governance component. Desktop is
an optional native observation surface over the durable records that Plugin
governance creates; installing Desktop without the Plugin does not create a
useful workflow on its own.

The application presents the pinned feature-state rail, subordinate
milestones, delivery slices, PR-boundary gate dependencies, blockers,
readiness-aware action guidance, complete artifact inventory, event and
attempt history, the full pinned model, and non-authoritative Session context.
Its persistent Setup surface remembers an explicit Codex, Claude Code, or both
selection, checks only those agents, and reports the selected native Plugin plus
shared workflow prerequisites. Compatibility comes only from exact
project-controlled tested pairs; Setup never infers it from nearby version
numbers and never invokes an installer or the optional GateReeve CLI.

Incomplete Setup blocks only the claim that new or active work is operationally
ready. The application still opens explicitly selected durable feature records
and labels that use as historical or offline observation.
Native notifications are off by default. A user can opt in to receive
transition-deduplicated attention, failed or stale gate, suspension,
inconsistency, pull-request merge, and feature-completion notices while the
app is running. Quitting Desktop stops its watchers, polling, and notices.

## Development

Requirements:

- Node.js 22.12 or later
- Python 3.10 or later for full workflow development and repository acceptance
- Git and, for optional pull-request enrichment, an authenticated `gh` CLI
- Electron runtime libraries for the host Ubuntu or macOS environment

From this directory:

```bash
npm ci
npm test
npm start
```

`npm start` stages the canonical protocol before launching the app. The Desktop
observation runtime itself does not require Python, a separate Node.js runtime,
or the optional GateReeve CLI. Desktop persists only the explicit selected-agent
preference, recent and last worktree paths, window geometry, and the native
notification preference. It does not persist detection results or cache
snapshots, workflow artifacts, GitHub responses, or governance state.

## macOS candidate packaging

On macOS, build the development candidate with:

```bash
npm ci
npm run package:mac
```

Coordinated RC preparation supplies the full release identity explicitly, for
example `npm run package:mac -- --version 0.1.0-rc.3`. That version is embedded
in the staged Desktop runtime, Setup compatibility, DMG filename, and native
evidence. The macOS bundle short version remains the Apple-compatible numeric
base (`0.1.0`).

The result is `dist/macos/GateReeve-<version>-macos-universal.dmg`. It contains
one universal `GateReeve.app`, the approved Rolling Vale icon, bundle identifier
`com.trentbrown.gatereeve.desktop`, and an Applications shortcut. Open the DMG
and drag GateReeve to Applications.

This command intentionally produces an ad-hoc signed development candidate. It
is suitable for identity, architecture, packaged-runtime, and local-install
verification, but it is not a public release. Developer ID signing,
notarization, stapling, Gatekeeper proof, and the direct RC are introduced only
through the later protected release slices.

The nonpublishing `Coordinated Release Preparation` workflow runs the exact DMG
on native Apple Silicon and Intel hosts. Each host can emit a JSON evidence file
with `verify-macos-package.mjs --evidence ... --source-tag ... --source-commit
...`; `gatereeve plugin release coordinate` accepts only a matching pair and
binds their common DMG checksum to the prepared Plugin candidate. This record is
recoverable release evidence, not permission to publish the ad-hoc candidate.

For renderer-only visual review on a host without Electron runtime libraries,
serve this package directory and open `/visual/index.html`. The fixture uses
the production HTML, CSS, and renderer modules but is excluded from packages.

## Read-only boundary

The renderer may request explicit worktree selection, canonical snapshot and
named-detail reads, refresh, clipboard copy, and open or reveal actions for
artifact IDs from the current snapshot. Trusted interactive explain-diff HTML
is served only by canonical artifact ID. Checkpoints and handoffs use a
separate exact-ID Session reader and never become workflow evidence. The
renderer cannot execute GateReeve transitions, invoke the CLI, launch agents,
read arbitrary paths, or run arbitrary processes. Setup checks run only in the
trusted main process, invoke version/status/list operations for explicitly
selected agents, and expose native remediation as copyable text rather than
executing it.
