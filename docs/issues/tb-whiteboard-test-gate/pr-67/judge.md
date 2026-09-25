# Independent Workflow Judge Report

**Verdict: FAIL**

The pinned change implements the broad architecture: explicit Whiteboard module selection, conditional Judge ordering, reusable staged agent runtime, Codex and Claude Code adapters, Desktop/headless integration, digest-bound stage outputs, and Judge v2 artifact binding. However, several approved requirements are not actually enforced at passage time.

## Failing Criteria

- **R4 - Defense experience and coverage: FAIL.** The Whiteboard validator checks semantic marker strings but does not require or exercise progressive-reveal controls. Evidence: `plugin-src/plugins/whiteboard-test/shared/resources/whiteboard-test/validator.js:97-140`; representative interaction smoke is fixture-only at `apps/desktop/test/whiteboard-browser-smoke.test.js:12-29`.

- **R5 - Outcome semantics: FAIL.** Broken required interactions are supposed to prevent Whiteboard PASS, but marker-only validation means a static non-interactive artifact can pass. Evidence: `plugin-src/plugins/whiteboard-test/shared/resources/whiteboard-test/validator.js:97-140` and `plugin-src/plugins/whiteboard-test/shared/resources/whiteboard-test/validator.js:241-270`.

- **R6 - Artifact provenance and containment: FAIL.** HTML, stage outputs, and receipts are bound, and Desktop sandboxing is strong, but the authoritative `whiteboard-defense.json` has no validation digest/receipt and controls are not validated before passage. Evidence: `plugin-src/plugins/whiteboard-test/shared/resources/whiteboard-test/schemas/whiteboard-defense.schema.json:4`, `plugin-src/plugins/whiteboard-test/shared/resources/whiteboard-test/validator.js:256-261`, and `plugin-src/plugins/whiteboard-test/shared/resources/whiteboard-test/validator.js:261`.

- **R8 - Judge correction and compatibility: FAIL.** Judge isolation and artifact binding are implemented, but the bounded Judge stage input omits required Verification evidence. The prompt says Verification evidence is supplied, while the input schema allows no dependencies and the runtime builds only source, boundary, and change inputs. Evidence: `plugin-src/shared/resources/agent-workflows/judge/agent.md:4`, `plugin-src/shared/resources/agent-workflows/judge/stage-input.schema.json:4-7`, `plugin-src/shared/resources/protocol/execution-preparation.js:72-82`, and `plugin-src/shared/resources/protocol/agent-workflow-service.js:101-113`.

## Passing Criteria

- **R1: PASS.** Whiteboard is disabled-by-default for explicit activation, required when enabled, depends on Verification, and conditionally orders after Judge. Human gate waivers require human confirmation and a nonempty reason.
- **R2: PASS.** Slice vs feature-final ranges, patch sidecars, fingerprints, and stale invalidation are represented.
- **R3: PASS.** Challenger and Defender/Publisher are separate stages with receipt-enforced fresh contexts and context reuse rejection.
- **R7: PASS.** The generic runtime, scheduler, read-only snapshots, fail-closed behavior, CLI/Desktop paths, and Codex/Claude adapters are present.

## Checks

- **Scope creep: PASS.** The changed files stay within the approved Whiteboard/Judge/runtime/plugin/Desktop/CLI/documentation scope.
- **Gap check: FAIL.** Missing deterministic reveal-control validation, missing validation binding, and missing Judge Verification evidence are material gaps.
- **Contradiction check: FAIL.** The Judge prompt and approved design say Verification evidence is supplied, but the runtime input contract omits it; the approved design says controls are validated before passage, but the validator only checks marker presence.