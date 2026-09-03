# GateReeve workflow modules

GateReeve keeps its feature and slice lifecycle fixed. Version 1 modules extend
only two named slots:

- `boundary.evaluation` for checks within a pinned PR-boundary attempt.
- `feature.finalization` for post-merge obligations before Complete.

The protocol ships built-in definitions. A repository may add declarative JSON
definitions under `.gatereeve/modules/` and selects exact definitions through
tracked `.gatereeve/workflow.json`. Merely checking out a manifest never executes
it.

## Definition contract

Each manifest file contains one module definition. This abbreviated boundary
example shows the complete common contract:

```json
{
  "schemaVersion": 1,
  "id": "example/license-audit",
  "version": "1.0.0",
  "digest": "sha256:<digest of this definition without the digest field>",
  "label": "License audit",
  "description": "Checks changed dependencies against project policy.",
  "slot": "boundary.evaluation",
  "dependsOn": ["gatereeve/verification"],
  "disposition": "required",
  "locked": false,
  "enabledByDefault": false,
  "waiverAllowed": true,
  "evidence": {
    "kind": "reference",
    "requiredFor": ["PASS", "FAIL"]
  },
  "fingerprint": {
    "kind": "boundary-gate-v1",
    "dependencyBinding": "event-ids"
  },
  "boundary": {
    "gateId": "example/license-audit",
    "evaluationScope": {
      "SLICE": "SLICE",
      "FEATURE_FINAL": "FEATURE"
    },
    "guards": ["boundary.context.current"]
  },
  "observe": {
    "providerId": "example/license-provider",
    "version": "1.0.0"
  }
}
```

IDs are lowercase namespaced identifiers. Versions are exact semantic versions.
The digest is SHA-256 over canonical, key-sorted JSON after removing only the
top-level `digest` field. Unknown fields, slots, guards, and adapter kinds fail
validation.

`dependsOn` identifies hard dependencies: an enabled module cannot resolve when
one is missing or disabled. `after` may identify conditional ordering
predecessors; those edges apply only when the predecessor is enabled. The latter
lets a locked aggregation step wait for every configured check without making
each check mandatory project policy.

Boundary modules declare a stable `boundary.gateId`. Built-ins use their
historical gate keys so existing journals and CLI invocations remain valid,
while policy and presentation use the namespaced module ID.

A finalization module omits `boundary`, uses fingerprint kind
`feature-finalization-v1`, and otherwise has the same common fields.

## Policy contract

The tracked policy selects an exact version and digest and records enablement:

```json
{
  "schemaVersion": 1,
  "modules": [
    {
      "id": "example/license-audit",
      "version": "1.0.0",
      "digest": "sha256:<exact manifest digest>",
      "enabled": true
    }
  ]
}
```

A repository policy must also select every shipped built-in, including disabled
configurable modules. Locked built-ins must remain enabled. Policy array order
has no meaning; dependency resolution produces stable topological order. A
missing policy uses the bundled default and does not auto-enable repository
manifests.

Resolution rejects duplicate IDs, mismatched versions or digests, missing
definitions or dependencies, cross-slot dependencies, disabled hard
dependencies, cycles, duplicate boundary gate keys, and symlinked manifest
inputs. The resolved definitions, enabled IDs, and policy digest are embedded
in the governed feature model lock. Each new boundary attempt also pins that
resolved graph so a later explicit model migration cannot reinterpret earlier
evidence.

## Adapter declarations

`run` and `observe` are independent. The schema recognizes:

- `run.kind: "skill"` with a skill ID and optional invocation hint.
- `run.kind: "manual"` with instructions.
- `run.kind: "command"` with an executable, argument array, working directory,
  optional entrypoint and support-file digests, disclosed effects, and timeout.
- `observe` with an installed provider ID and exact provider version.

These fields are declarative protocol data in the foundation slice. Provider
process supervision, command authorization, and task-terminal execution are
separate runtime layers. Repository manifests cannot provide provider
executables, and no command runs during discovery, resolution, project open, or
background observation.
