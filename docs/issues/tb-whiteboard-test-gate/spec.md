# Spec - tb-whiteboard-test-gate

**Feature:** `tb-whiteboard-test-gate`
**Created:** 2026-09-24

## Summary

Deliver the repository-activated Whiteboard Test plugin, its interactive
Whiteboard Defense artifact, and the reusable isolated agent-workflow runtime
needed to execute it credibly. In the same feature and pull request, upgrade
LLM-as-Judge to use that runtime so every Judge attempt is performed in a fresh,
read-only context. Preserve separate Whiteboard and Judge responsibilities,
support Codex and Claude Code through headless and Desktop surfaces, and retain
digest-bound evidence without rewriting historical gate records.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** **Activation and ordering.** A repository can explicitly activate a
  digest-pinned `whiteboard-test/defense` module. Once activated, it is required
  after current Verification evidence. When Judge is enabled, Whiteboard waits
  for its current nonblocking outcome; when Judge is disabled, Whiteboard
  proceeds without it. Only an explicit human waiver can exempt a
  non-behavioral change.

- **AC2.** **Correct evaluation scope.** At an ordinary PR boundary, the defense
  covers the exact pinned slice plus necessary context. At feature-final, it
  covers the assembled feature from its configured base through the pinned head
  while identifying the final slice where useful. Changed inputs invalidate
  stale outcomes.

- **AC3.** **Independent challenge workflow.** Whiteboard automatically runs an
  isolated Challenger followed by an independently isolated Defender/Publisher.
  Neither inherits implementation conversation. The Challenger's required
  primary and Push Harder questions cannot be removed or softened. Unverifiable
  isolation leaves the gate `UNSET` and Unavailable.

- **AC4.** **Rich standalone defense.** The resulting artifact stands alone and
  uses open-ended progressive reveal. Each primary challenge supplies a concise
  defense, deep defense, and pinned evidence; appropriate challenges add
  revealable Push Harder responses. Coverage is adaptive, includes a meaningful
  evidence-linked visual with a text alternative, and presents typed findings
  both inline and in a linked summary. It contains no multiple-choice grading,
  audio assessment, or Explain Diff dependency.

- **AC5.** **Whiteboard outcome integrity.** An honestly disclosed weakness in the
  implementation does not cause Whiteboard failure. Wrong scope, omitted
  required challenges, unsupported factual assertions, missing evidence,
  broken required interactions, or incomplete generation do. PASS requires
  Defender/Publisher attestation plus deterministic artifact validation and
  never certifies human understanding.

- **AC6.** **Governed artifact bundle.** `whiteboard-defense.json` is the
  authoritative evidence root and digest-binds the stage outputs, receipts,
  validation, and self-contained `whiteboard-defense.html`. The HTML may use
  free-form embedded HTML, CSS, JavaScript, SVG, and animation, but runs without
  network, filesystem, parent-window, navigation, or external-resource
  authority. GateReeve validates semantic linkage and required controls before
  passage.

- **AC7.** **Portable agent-workflow runtime.** GateReeve provides a reusable
  staged-agent module primitive with bounded inputs, typed outputs,
  fresh-context requirements, automatic eligible execution, read-only pinned
  repository access, disposable scratch space, network denied by default,
  portable capability profiles, and auditable metadata-and-digest receipts.
  Equivalent behavior works through Codex and Claude Code adapters and through
  headless and Desktop surfaces. Unsupported capability or provider execution
  fails closed without an unbounded retry loop.

- **AC8.** **Isolated Judge upgrade.** The versioned Judge module runs each attempt
  in a new isolated, read-only context with no implementation conversation,
  prior self-evaluation, or Whiteboard artifact. `judge.json` binds its inputs,
  execution receipt, structured result, and `judge.md`. Judge failure blocks
  but cannot modify code; remediation is followed by a newly pinned, newly
  isolated attempt. Historical Judge evidence remains valid under its pinned
  module version.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Activation and graph behavior | Exact module selection, required disposition, Verification prerequisite, conditional Judge ordering, and human waiver behavior all work. | Activation mutates policy implicitly, disabled Judge blocks Whiteboard, or model self-exemption is possible. | Module fixtures, graph-resolution tests, and boundary-eligibility tests. |
| R2 | Scope and freshness | Slice and feature-final fixtures resolve the correct pinned ranges and stale results invalidate. | An artifact uses the wrong range, expands to unrelated behavior, or survives changed inputs. | Boundary fixtures, manifest scope fields, and fingerprint/invalidation tests. |
| R3 | Challenger/Publisher isolation | Two fresh contexts run in order and every Challenger question survives into the final artifact. | A context inherits implementation history, stages share hidden history, or a required question disappears. | Codex and Claude Code adapter receipts, isolation tests, and challenge-set comparison. |
| R4 | Defense experience and coverage | Representative artifacts satisfy layered reveal, evidence, adaptive challenge, visual, accessibility, and finding-summary requirements. | Required layers are missing, visuals are decorative or inaccessible, or the artifact depends on Explain Diff or grading. | Manifest fixtures, rendered browser tests, and accessibility checks. |
| R5 | Outcome semantics | Work deficiencies can coexist with PASS when honestly exposed; artifact deficiencies prevent PASS. | Whiteboard validates implementation quality, passes malformed evidence, or claims human understanding. | Validator tests covering PASS, FAIL, findings, and waiver cases. |
| R6 | Artifact provenance and containment | The JSON root verifies every required digest and sandboxed HTML works without external authority. | Unbound or mutated output passes, external resources load, or required controls fail. | Schema and digest tests, sandbox tests, and browser error and interaction tests. |
| R7 | Reusable runtime and parity | Generic stages, receipts, capability mapping, read-only execution, automatic scheduling, Codex and Claude Code support, and headless/Desktop parity work. | Gate-specific shortcuts, silent model downgrade, repository mutation, same-context fallback, or surface divergence occurs. | Protocol, CLI, Desktop, and adapter conformance tests plus execution receipts. |
| R8 | Judge correction and compatibility | New Judge runs are isolated and manifest-bound; failures block; reruns are fresh; old evidence remains readable. | Same-thread Judge remains possible, Judge edits code, reruns reuse context, or historical records are reinterpreted. | Judge integration tests, migration fixtures, and historical model-lock tests. |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
