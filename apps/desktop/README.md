# GateReeve Desktop

GateReeve Desktop is the optional, read-only Electron observer for a local
GateReeve feature worktree. It consumes a staged copy of the canonical
GateReeve protocol directly; the optional Commander CLI is not a runtime
dependency.

This package currently contains the application shell and observation
lifecycle. Later feature slices add the complete state, artifact, history,
model, and notification experiences.

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

## Read-only boundary

The renderer may request explicit worktree selection, canonical snapshot and
named-detail reads, refresh, and open or reveal actions for artifact IDs from
the current snapshot. It cannot execute GateReeve transitions, invoke the CLI,
launch agents, read arbitrary paths, or run arbitrary processes.
