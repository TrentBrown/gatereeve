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

Repository manifests cannot provide provider executables, and no command runs
during discovery, resolution, project open, readiness calculation, or
background observation.

## Runtime and consent

A skill adapter exposes copyable invocation context and can open the persistent
project terminal, but GateReeve does not launch the agent. A manual adapter uses
an explicit outcome, evidence summary, and human confirmation. A command adapter
is previewed as its exact executable, argument array, repository working
directory, effects, and timeout before the user chooses `Run once` or
`Always allow this command version`.

Durable command consent is device-local and bound to the Git common repository,
module identity/version/manifest digest, executable, arguments, working
directory, and observed declared entrypoint/support-file digests. Linked
worktrees therefore share an unchanged grant; another clone does not. A changed
declared input invalidates the grant. Run-once consent remains possible after
the changed input is disclosed. Consent is not a sandbox or complete provenance
claim: the process has the user's ordinary authority and may invoke changed
PATH tools, dependencies, files, credentials, network services, or downloaded
code.

Commands run directly—never through an implicit shell string—in dedicated named
PTY sessions. The persistent user shell remains separate. Task sessions support
selection, input, resize, cancellation, a declared timeout, and a bounded
transcript. Providerless exit `0` maps to `PASS`; nonzero exit, signal, or timeout
maps to `FAIL`; explicit cancellation retains the attempt and leaves the gate
`UNSET`. Optional structured JSON output can enrich evidence but cannot declare
or override an outcome.

## Observation providers

Providers are GateReeve-installed executables whose manifest ID, exact version,
and manifest digest match the application allowlist. Repository definitions can
only reference them. Each observation is an out-of-process, bounded, version-1
JSON-over-stdio exchange tied to one request ID, provider identity, module
identity, and input fingerprint. Missing implementations, process errors,
timeouts, nonzero exits, excess output, missing or duplicate responses,
malformed JSON, and identity or fingerprint drift fail closed.

Normalized provider progress uses `pending`, `running`, `waiting`, `blocked`, or
`unavailable` and remains observational. A command result or terminal provider
outcome reaches the journal only through a fresh protocol-core check of the
pinned boundary context, module identity, dependency event IDs, input
fingerprint, and retained evidence reference.

Installed provider manifests also bind the SHA-256 digest of their entrypoint
bytes. Packaged JavaScript providers are self-contained bundles launched with
GateReeve's trusted Electron runtime in Node mode; they do not depend on a
separately installed Node executable or on imports crossing the ASAR boundary.

## Feature finalization

After the feature-final PR is accepted and its exact integration commit is
recorded, GateReeve enters Finalizing. Starting finalization pins a new attempt
to that merge commit, the active model hash, the complete module graph, and the
recorded event IDs of module dependencies. Required enabled modules must have a
current `PASS`, `WAIVED`, or permitted `NOT_APPLICABLE` outcome before Complete
is available. A pause, model migration, blocking change, invalidation, or fresh
dependency result prevents stale evidence from completing the feature.

Finalization waivers require an explicit human confirmation and nonempty risk
acceptance reason. They apply only to one feature attempt and become stale with
its fingerprint. If a project enables no finalization modules, it can complete
without creating an empty attempt, and GateReeve omits the module card.

The bundled GateReeve policy enables one product-specific module,
`gatereeve/release`, observed by the installed
`gatereeve/release-conductor` provider. The generic protocol core knows neither
release nor deployment semantics. The provider downloads retained Release
Conductor evidence, validates its immutable chain and GitHub workflow identity,
and proves that the released source contains the feature-final merge. Only a
terminal, failure-free `COMPLETE` chain records `PASS`; intermediate stages and
failures remain live observational status with safe links back to the protected
workflow.
