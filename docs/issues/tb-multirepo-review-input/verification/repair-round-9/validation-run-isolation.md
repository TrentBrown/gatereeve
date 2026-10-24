# Independent reproduction — delayed specification failure isolation

Preliminary read-only review evidence; this is not a formal verdict or protocol passage. No implementation source was changed by the reviewer.

The actual product source was imported exclusively from the immutable view `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-UevkOL/repository`, pinned to head `67197b4858ee3099f164d4a08d096aa5fc34ad40` and base `643e3ea2b03f19b66595219c4f8df934596aa436`. The mutable worktree repair is not assessed by the results below.

## Supported defect

`plugin-src/shared/resources/protocol/current/core.js:131` (`specProof`) retains an actual failed validator proof, then rereads `this.state()` at line 136 and appends `VALIDATION_FAILED` using that later state. Both `validateSpec` and combined amendment handling originally checked a different state. The projection at line 24 clears `specValidation` whenever this failure event is applied.

A delayed older validator can therefore erase a newer successful validation in the same run, or append its failure into an entirely different replacement run. This affects R1's planning/corrective-work authority, R6's repeat/concurrent evidence integrity and R20's run isolation. The defect blocks previously valid work; these probes do not claim unauthorized PASS.

## Standalone probe

Retained script: `/tmp/gr-validation-run-isolation-probe.mjs`.

The script imports the existing fixture and authorization helpers from the pinned test source via absolute protocol URLs. It uses real core operation entrypoints, a real Python child and the real retained journal/store. It creates temporary repositories, feature homes and a temporary helper root, then removes those fixtures. No network or model provider is involved.

```sh
node /tmp/gr-validation-run-isolation-probe.mjs /var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-UevkOL/repository replacement vulnerable
node /tmp/gr-validation-run-isolation-probe.mjs /var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-UevkOL/repository same-run vulnerable
```

Both commands exited 0, confirming their explicit vulnerable-behavior assertions.

## Exact operations

Common setup:

1. Start a disposable `run-one`, approve design, execute specification validation and authorize implementation.
2. Point the core's trusted test runtime options to a temporary `lint_spec.py`. It writes a start marker, waits for a release marker, prints `ORIGINAL-VALIDATOR-FAILED`, and exits 1.
3. Invoke `spec.validate` with operation ID `slow-old-validation`; wait until the actual child writes its start marker.
4. Restore the ordinary runtime options for subsequent operations. The already running child retains its original options.

Replacement-run case:

5. Corrupt both copies of the first old journal event **only inside the disposable fixture**, making old runtime state unsupported.
6. Invoke `run.resume-current` with run ID `replacement` through the product entrypoint.
7. Approve design, validate specification and authorize implementation for the replacement. Confirm implementation check allows work and capture its successful proof.

Same-run case, instead of steps 5–7:

5. Invoke another real `spec.validate` with operation ID `newer-successful-validation` in `run-one` using the ordinary trusted helper.
6. Confirm implementation check allows work and capture the newer successful proof.

For each case, release the older child, await its failure, and inspect the active state and journal.

## Actual results

| Case | Active run | Event count before → after | Newer proof preserved | Recorded validation failures | Final implementation check |
|---|---|---|---|---|---|
| Replacement | `replacement` | 4 → 5 | No; `specValidation` became null | 1 | Blocked |
| Same run | `run-one` | 5 → 6 | No; `specValidation` became null | 1 | Blocked |

In both cases the final event was `VALIDATION_FAILED`, and the older invocation returned `Specification validation failed; instruction and diagnostics remain retained` with a readable proof reference. Retaining the diagnostics was correct; attributing the failure to the later checked state was the defect.

## Repair expectation and limits

The intended repair must bind failure publication to the original run **and event count**, including validation invoked through combined amendments. On publication conflict, retain the actual failed proof and expose its references without changing the replacement/newer state.

The standalone script accepts `fixed` as its final argument for a later read-only repair check. That mode asserts no new event/failure, preservation of the newer proof, continued implementation authority, an error from the older invocation, and readable retained proof references attached to that error. This document records the vulnerable pinned results only; it does not assert that a subsequent implementation passes those repair checks.


## Independent fixed verification

After the repair, the same independent reviewer ran both standalone probes in fixed mode. Replacement state stayed eventCount4 to4 and same-run state5 to5; newer proof was preserved, validationFailures remained0, implementation stayed allowed, and the original failure error exposed readable retained proof. Five adjacent amendment/retry/failed-proof retention/refresh checks passed. Source inspection confirmed validateSpec and amend pass original checked state, including the exact pendingDecision result. This remains repair evidence, not formal gate passage.
