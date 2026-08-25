# GateReeve Protocol Adapter

The plugin packages its authoritative JavaScript protocol core under
`resources/protocol/`. A separately installed `gatereeve` command is optional;
skills use the plugin-local adapter directly.

Before a state-affecting workflow activity, inspect the current mode:

```bash
node "<plugin-root>/resources/protocol/plugin-adapter.js" status --cwd "$PWD"
```

The result is the stable protocol JSON envelope. A governed feature must use
the adapter for both preflight and passage. A feature reported as `legacy` may
finish under the legacy instructions and must not be silently adopted. An
`inconsistent` feature blocks ordinary passage.

## Direct request contract

The adapter accepts one JSON request on standard input or through
`--request-file <path>`. Skills should use a private temporary request file when
the operation contains structured evidence, then remove it after invocation.
The request selects a semantic operation, never an arbitrary transition from a
public user surface.

```json
{
  "operation": "feature.transition",
  "cwd": "/absolute/worktree",
  "transitionId": "approve-design",
  "input": {
    "actor": {
      "kind": "human-confirmed",
      "label": "user approval in the active conversation"
    },
    "eventId": "evt-example"
  }
}
```

Supported internal operations are `status`, `next`, `history`, `explain`,
`check`, `graph`, `graph.model`, `feature.init`, `feature.transition`,
`feature.abandon`, `feature.pause`, `feature.resume`, `feature.migration-impact`, `feature.migrate-model`,
`slice.propose`, `slice.transition`, `slice.abandon`, `slice.accept-review`, `boundary.request-review`,
`gate.record`, `gate.waive`, `gate.invalidate`, `change.propose`,
`change.transition`, and `change.reauthorize`.

The adapter does not authenticate actors. `human-confirmed` records that the
cooperative agent observed a human confirmation; it is not an identity or
security claim. Rejected mutations exit nonzero and append no event. Read-only
status remains successful when the feature is blocked or evidence is stale;
`check` exits nonzero when its assertion fails.
