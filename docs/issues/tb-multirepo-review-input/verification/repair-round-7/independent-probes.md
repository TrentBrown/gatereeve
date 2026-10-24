# Independent preliminary repair probes — round 7

This is preliminary read-only repair evidence, **not a formal code-review, spec-evaluation, Judge verdict, or protocol passage**. The independent reviewer inspected the changing, uncommitted working tree based on `b55399291d58475a5396ec94b1092a703749c149`. These results do not establish the identity or acceptance of a later frozen candidate. No implementation files were changed by the reviewer.

Source inspected: `/Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input`, principally the current core/execution modules, Python guard provider, public agent workflow contract, and local agent adapters. No network or real model invocation was used by these probes.

## F1 — capability admission

An inline Node probe imported the actual public Codex and Claude adapter constructors. For each adapter, it requested the `high-capability-v1` profile with `minimumReasoning: high`, then selected each of `low`, `medium`, and `unknown` reasoning. The supplied process runner incremented a counter if invoked.

Observed: all six calls rejected with a capability-contract error; runner count remained zero. These are actual adapter admission checks with a fake process runner, not native provider executions.

Read-only inspection also confirmed that current independent execution compares requested, descriptor, and returned receipt effort/profile, and that retained-result qualification checks the recorded evaluator against its input configuration and required profile. That retained-proof assessment was source inspection in this probe session; the independent inline probe did not manufacture historical persisted proofs.

## F3 — partial provider metrics

An inline Node probe invoked the actual public Codex adapter with a fake runner that wrote structured output to the adapter-provided output path and emitted a fresh thread event plus selected `turn.completed` usage events. Every returned envelope was passed through the public stage-result validator.

Four cases passed:

1. Usage `{input_tokens:12, output_tokens:2, cached_input_tokens:0}` followed by `{input_tokens:3, cached_input_tokens:0}` produced input `15`, output `null`, cached input `0`, cache creation `null`, and cost `null`.
2. One populated usage followed by a completed turn with no usage produced token metrics `null` and cost `null`.
3. No completed-turn usage contributions produced token metrics `null` and cost `null`.
4. One contribution with all four token fields explicitly zero preserved all four numeric zeros; cost remained `null`.

These controls test adapter aggregation and public receipt validation. They do not verify provider billing semantics, native usage-event completeness, or a live Claude response.

## F2 — executed diagnostics, applicability, refresh and recursive exception scope

The reviewer independently ran:

```sh
node --test --test-name-pattern='trusted validator drift|validator postflight drift' cli/test/current-core.test.js
```

Observed: **2 tests passed, 0 failed**. The first took approximately 3.18 seconds and the second approximately 0.22 seconds. The exercised assertions covered helper-closure drift invalidating specification and reconciliation proof, environment drift, successful refresh retaining the authorized phase, failed refresh remaining blocking, later recovery, retained executed stdout after postflight helper drift, inclusion of existing bytecode-cache paths in the runtime binding, and rejection of an additional runtime import.

Earlier inspection of the evolving repair found that the executed stdout was lost after postflight drift. The reviewer reproduced that intermediate behavior with a temporary `lint_spec.py` which printed `EXECUTED-VALIDATOR-DIAGNOSTIC` and appended a harmless comment to itself. That was reported and repaired before the final two-test run above. It is not an outstanding finding against the subsequently tested repair.

### Independent actual-operation exception probe

A separate inline Node probe extracted only the existing fixture/authorization/candidate/fake-evaluator helper declarations from `cli/test/current-core.test.js`, rewrote their protocol imports to absolute file URLs, and imported those declarations from a data URL. It created a disposable Git repository and feature home through the actual fixture and copied the three current lint helper scripts into a temporary `helperRoot`. The live core used that helper root and a frozen copy of the current environment. Source files were not altered.

Exact operations and assertions:

1. Start the fixture run, approve design, validate the specification, and authorize implementation using the actual operation entrypoints.
2. Prepare a FEATURE candidate for R1.
3. Execute `gate.execute` for `reconcile`; retain its result references.
4. Install the existing fake fresh evaluator, configured to return a supported blocking finding; execute `gate.execute` for `code` with the reconciliation references explicitly supplied as consumed proof.
5. Execute `human.decide` with `kind: waive`, the current candidate subject, and `gates: ['code']`. Assert that acceptance check reports the code obligation satisfied under this exception.
6. Add `dependency.py` containing a comment to the temporary helper closure.
7. Execute `spec.validate` again with a fresh operation ID. Assert that the phase equals the phase before the waiver, and that implementation check is allowed.
8. Check acceptance again. Assert that code is unsatisfied and its `exception` is `null`.

Observed output:

```text
PASS actual operations: recursive consumed-reconcile waiver invalidated after helper drift, despite successful phase-preserving spec refresh
```

This demonstrates that recursive waiver scope follows current validator binding even after independent specification refresh restores implementation authority. The probe used real core operations, real Python lint subprocesses, real retained store/journal data and a fake evaluator. It did not merely call the waiver-risk function in isolation. Temporary fixtures were removed after completion.

## Assessment and limits

The tested F1/F3 controls and F2 paths passed. No additional supported defect was found in those repaired paths during this inspection. This is deliberately narrower than full acceptance: no frozen source digest, full-suite rerun, native evaluator invocation, package build/runtime, installed host activation, formal rubric assessment, or independent Judge execution is claimed by this document. Parent-provided evidence and future formal evaluations remain separate.
