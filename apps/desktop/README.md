# GateReeve Desktop

GateReeve Desktop is the optional, read-only Electron observer for a local
GateReeve feature worktree. It consumes a staged copy of the canonical
GateReeve protocol directly; the optional Commander CLI is not a runtime
dependency.

The application presents the pinned feature-state rail, subordinate
milestones, delivery slices, PR-boundary gate dependencies, blockers,
readiness-aware action guidance, complete artifact inventory, event and
attempt history, the full pinned model, and non-authoritative Session context.
Notifications and final supported-platform hardening remain in a later slice.

## Development

Requirements:

- Node.js 22.12 or later
- Python 3 for the canonical workflow-context resolver
- Git and, for optional pull-request enrichment, an authenticated `gh` CLI
- Electron runtime libraries for the host Ubuntu or macOS environment

From this directory:

```bash
npm ci
npm test
npm start
```

`npm start` stages the canonical protocol before launching the app. Desktop
persists only recent and last worktree paths plus window geometry. It does not
cache snapshots, workflow artifacts, GitHub responses, or governance state.

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
read arbitrary paths, or run arbitrary processes.
