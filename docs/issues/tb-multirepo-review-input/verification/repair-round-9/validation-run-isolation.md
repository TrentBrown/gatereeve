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

## Independent repair verification — core and public boundary

After the origin-state repair, the reviewer reran both modes of `/tmp/gr-validation-run-isolation-probe.mjs` against the actual working tree with `fixed` expectations. Both exited 0:

- Replacement run remained at event count 4; its proof was preserved, validation failures remained zero, and implementation remained allowed. The old invocation reported `Active run changed` and attached a readable retained proof.
- Same run remained at event count 5; its newer proof was preserved, validation failures remained zero, and implementation remained allowed. The old invocation reported the concurrent-update conflict and attached a readable retained proof.

The reviewer also independently ran five adjacent core tests: amendment authorization, interrupted combined-amendment retry, failed specification/reconciliation diagnostic retention, failed-proof loss and restoration, and validator-drift refresh/recovery. All five passed. Source inspection confirmed that both ordinary specification validation and amendment validation pass the checked origin state; the amendment uses the exact state returned by its own pending-instruction append.

### Follow-on public error discovery

An additional real `executeCurrentRequest` probe against immutable preliminary view `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-wfOoPk/repository` found that the core's custom `error.artifacts` did not survive public error formatting. After a delayed failed validation conflicted with a newer successful validation, the public response returned `INTERNAL_ERROR` with `details: null`. The active state's successful proof was correctly preserved and no failed-validation event was added. Inspection of the disposable object store confirmed that the original failed proof was present but its reference was absent from the public response. Without a journal event, that response had lost the caller's recovery reference.

This was reported as a narrow R6/R18 public-boundary gap, not a failure of the origin-state isolation repair. The fix changed the validation error to a `ContractError` with typed details containing the original run ID, operation ID and `retainedArtifacts`, while retaining the internal `.artifacts` field.

### Actual public repair probes

Standalone probe: `/tmp/gr-public-validation-run-isolation-probe.mjs`.

```sh
node /tmp/gr-public-validation-run-isolation-probe.mjs /Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input replacement
node /tmp/gr-public-validation-run-isolation-probe.mjs /Users/trent.brown/Code/tb/.worktrees/gatereeve-multirepo-review-input same-run
```

Both commands exited 0 against the subsequently repaired working tree. The probe establishes the real canonical workspace configuration and invokes the delayed validation through `executeCurrentRequest`, rather than catching an internal core exception.

Both public responses now had `code: CONTRACT_INVALID` and typed details with `runId: run-one`, `operationId: public-old-validation`, and one JSON evidence reference in `retainedArtifacts`. The reviewer retrieved and parsed the proof using that returned reference, verified `passed: false`, the original run and operation, and the actual child's printed diagnostic. The raw diagnostic was absent from the public error envelope. Both cases preserved the latest proof, unchanged event count, zero attributed validation failures and allowed implementation.

These are preliminary working-tree repair observations. They do not certify the identity of a future frozen candidate or replace full verification and formal review. Fixture files were removed; only these two standalone probe scripts and this evidence note were retained by the reviewer. No product source was edited.

### Pause-only publication interaction

After the public-reference repair, the reviewer ran an additional actual-operation control for the proposed narrower failure-publication policy. One unchanged temporary Python helper initially returned PASS; a control marker subsequently caused a delayed invocation to print an actual diagnostic and exit 1. The marker was outside the helper closure; the helper, interpreter, environment and requirement bytes remained unchanged. While the child waited, the core received `run.pause`. The child was then released, followed by `run.continue`.

Observed with strict original-event-count publication: pause remained set until the explicit continuation, the error exposed retained proof references, but no `VALIDATION_FAILED` event was recorded; the older successful proof remained selected and implementation was allowed after continuation. This demonstrates the core admission mechanism with a controlled mechanical-provider outcome. It does not claim that the shipped deterministic lint implementation naturally produces contradictory results for identical files.

This result supports distinguishing a newer validation generation or replacement run from unrelated journal changes. A safe pause-only reconciliation can record the original failed outcome against refreshed state while preserving pause, provided original run and requirement scope remain applicable and no newer successful validation superseded the original checked proof. The prior same-run/replacement controls must continue to pass. No repair of this narrower interaction is asserted by this observation.

### Final pause correction — independent verification

The reviewer inspected the narrowed retry predicate and independently ran `/tmp/gr-validation-pause-probe.mjs` against the repaired working tree. The probe retains one unchanged helper/environment/requirement set throughout its initial PASS, delayed controlled FAIL, pause and continuation, rather than switching helper implementations between validations.

Observed: the pause remained set; exactly one failure was recorded against the original run; the old validation was cleared; the error's retained proof matched the recorded failure and contained the actual child diagnostic. Explicit continuation alone left implementation blocked. Removing the control condition and executing a fresh specification validation restored implementation authority. The standalone probe exited 0.

The reviewer then reran both public entrypoint replacement/same-run probes. Both still exited 0: no stale failure event entered the later state, the newer proof and authority remained intact, and the public typed references resolved to original failed proof without exposing raw diagnostics in the error envelope.

Source inspection confirmed that failure-publication retry is restricted to the exact concurrent-update error and actual forward journal progress, requires the same run and unchanged selected validation identity, rejects intervening `SPEC_VALIDATED` or decisions carrying successful validation, and requires current specification/design hashes to match the original captured documents. The subsequent append still uses CAS on the refreshed state, preserving pause. No additional supported defect was found in this correction. These observations remain preliminary repair evidence pending a frozen formal candidate and its complete bound verification.
