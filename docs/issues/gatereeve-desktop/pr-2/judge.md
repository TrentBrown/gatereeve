# Judge Evaluation - PR #2, attempt 1

**Verdict:** FAIL

## Rubric Evaluation

| # | Criterion | Result | Evidence |
|---|---|---|---|
| R1 | Shared observational contract | FAIL | `plugin-src/shared/resources/protocol/snapshot.js:750-785` validates only a small outer subset of the snapshot and does not validate `events`, `model`, `projection`, milestones, blocker shapes, or kind-specific fields. `snapshot.js:879-887` accepts any `data` value for every named-read kind. Direct probes confirm that artifact detail with `data: null` and a snapshot with `events: null` are accepted. This does not satisfy P1's runtime-validated schema requirement. |
| R2 | Readiness semantics | PASS WITH CONCERNS | `snapshot.js:381-587` provides the intended three readiness states, inputs, commands, and prerequisites. Stronger validation is still needed to keep malformed readiness payloads from crossing future IPC boundaries. |
| R3 | Workspace and diagnostics | PASS WITH CONCERNS | Diagnostic modes and independent source statuses exist, but their nested shapes are not fully runtime-validated. |
| R4 | State visualization contract | PASS WITH CONCERNS | Pinned projection, provenance, milestones, and boundary data are exposed, but the consumer-facing topology contract is only shallowly checked. |
| R5 | Artifact inspection contract | PASS WITH CONCERNS | Allow-listed reads, realpath containment, size limit, structured JSON, and unchanged HTML are present. Kind-specific artifact result structure is not validated. |
| R6 | History and action guidance | PASS WITH CONCERNS | Full events, attempts, model graph, and copyable actions are present, but named-read result shapes are not validated. |

## Scope Check

- **Scope creep found:** No.
- **Details:** Changed product code is confined to P1-P3: canonical observer contracts, CLI/plugin exposure, staging, tests, and documentation.

## Gap Check

- **Unaddressed AC:** The P1/R1 requirement for runtime-validated snapshot and lazy-read schemas is not met. A future Electron preload could accept malformed payloads that these validators claim are valid.

## Contradiction Check

- **Contradictions found:** The implementation and documentation call these contracts validated, while the exported validators accept structurally invalid nested data.

## Concerns

The validator gap is directly testable and central to the slice's purpose, so it is blocking rather than a documentation-only concern. Add complete nested validation for snapshots and kind-specific detail results, add rejection tests, then rerun the pinned boundary on the new source head.
