# GateReeve Desktop

GateReeve Desktop is an optional Electron application for observing a local
GateReeve feature worktree. It also provides an explicitly opened,
user-controlled project terminal. It consumes a staged copy of the canonical
GateReeve protocol directly; the optional Commander CLI is not a runtime
dependency.

The GateReeve Plugin is the required workflow-governance component. Desktop is
an optional native observation surface over the durable records that Plugin
governance creates; installing Desktop without the Plugin does not create a
useful workflow on its own.

The application displays the current seven-phase planning and delivery backbone,
milestone blockers, required validation obligations, exact retained evidence,
accepted exceptions, event history, and optional Session context. It opens old
feature folders into current-resume guidance; it does not replay historical
journals. The model chooses execution order. Desktop has no ordering editor,
module scheduler, automatic evaluator launcher, or manual PASS attestation.

Setup detects the selected native agents and prerequisites without installing
anything. Evidence reads remain available offline. The project terminal starts
only when opened and remains user-controlled; its transcript is not gate proof.
Local artifact previews retain their isolated renderer and sandboxed HTML policy.
Notifications remain opt-in. Model guidance and protected adapter enforcement
are shown separately; arbitrary terminal actions are not intercepted.

Release publication stays in the separately protected Release Conductor workflow.
Its provider mechanics remain available for actual release observations; this
cutover does not grant publication authority.

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
preference, recent and last worktree paths, window geometry, terminal panel
height, native notification preference, in a separate device-local file. It does not persist terminal visibility or content,
detection results, or cache
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

When a native Intel Mac is unavailable, an Apple Silicon developer can perform
a clearly non-authoritative x86_64 smoke under Rosetta:

```bash
arch -x86_64 node scripts/verify-macos-package.mjs \
  --dmg dist/macos/GateReeve-<version>-macos-universal.dmg \
  --version <version> \
  --fixture <governed-fixture-path> \
  --allow-rosetta-translated
```

This path forces the packaged application through its Intel slice and labels
the result as translated. It cannot emit the native release-evidence schema;
the hosted native Intel job remains preferred release authority.

For renderer-only visual review on a host without Electron runtime libraries,
run `npm run build:renderer`, serve this package directory, and open
`/visual/index.html`. The fixture uses
the production HTML, CSS, and renderer modules but is excluded from packages.

## Observation and terminal boundary

The renderer may request explicit worktree selection, canonical snapshot and
named-detail reads, refresh, clipboard copy, and open or reveal actions for
artifact IDs from the current snapshot. Trusted interactive explain-diff and
Whiteboard Defense HTML are served only by canonical artifact ID in the
artifact sandbox. Checkpoints and handoffs use a
separate exact-ID Session reader and never become workflow evidence. The
renderer cannot supply an arbitrary terminal executable, arguments, cwd,
environment, or process ID. It can send keystrokes only to an opaque project
shell session owned by the selected saved project. The trusted main process
creates that shell from the account login shell. Users can invoke the CLI, launch
agents, and run commands there. The model orchestrates work within the authorized
phase; passage requires the current protocol core to validate the retained
evidence and human decisions at the milestone boundary.
Setup checks remain separate, run only in the trusted main process, invoke
version/status/list operations for explicitly selected agents, and expose
native remediation as copyable text rather than executing it.
