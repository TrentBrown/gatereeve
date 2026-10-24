# Independent standing-status repair review

Reviewer: continuing independent nonimplementer agent `/root/formal_code_spec`. This is a bounded repair assessment, not a formal gate passage or a fresh history-blind Judge. Product reviewed: `78327bd5b3f58e52712446fbaf8beadc77f0e3d0`. Prior formal reports and Judge failures remain unchanged.

## Result

Both Judge19 issues are independently supported and repaired. No additional supported blocker was found in the changed status/documentation paths and the adjacent semantics exercised below. This assessment covers R23 standing-permission visibility and related R18 CLI consumption, with R15–R17/R22 authority, integration and proof-readiness controls. It does not independently reassess every historical finding or all rubric rows.

## Before and after: candidate-aware status

The original `core.inspect()` called standing validity without the current candidate. Seven actual status-operation probes returned `allowed:true, reason:null` despite a FEATURE candidate outside a SLICE grant, a repository outside the grant, a source branch outside the literal prefix, an advanced assessed target, a missing candidate object, a corrupt candidate object, or a missing captured source input. These results are retained in `independent-status-before.log`; the first four exercise the original scope omission and the last three its unavailable-evidence consequence.

The same seven disposable Git/core probes with `EXPECT_FIXED=1` pass against the repair. Scope, repository, source prefix and target cases now return their specific rejection reasons. Missing/corrupt candidate roots and the missing captured input return the safe reason “Current candidate evidence is unavailable or invalid.” See `independent-status-after.log` and `independent-status-probe.txt`. This is an actual operation test, not a mocked standingValidity call. Local bare remotes and Git URL rewriting avoid external contact.

Source: `plugin-src/shared/resources/protocol/current/core.js:585–597` validates the recorded candidate closure before passing it to `standingValidity`; failure does not silently become a null candidate. The guard avoids extra candidate reads where there are no standing grants. `authorization.js:71–111` still checks run, pause, revocation, expiry, approved commitments, implementation identity and repository bindings before candidate constraints.

Two adjacent distinctions remain correct:

- A grant before candidate preparation describes scoped permission. A separate actual probe returns grantAllowed=true, candidate=null and acceptanceAllowed=false; application rejects “Prepare a candidate,” and status leaves the journal unchanged. See `independent-pre-candidate.log` and its probe.
- After a nonempty verified integration, status may retain a matching grant for completion. The existing real-operation final-merge test passes with the new postintegration status assertion. The exception requires the same candidate, authorized branch and retained receipt (`authorization.js:89–95`); it follows the revocation/expiry/configuration checks. New acceptance application does not receive this exception. This fixture uses local Git and simulated GitHub/provider responses, not a hosted merge. It does not prove full completion: its remaining finalization/release obligations stay blocked.

The explicit/run-scoped/revocable standing-authority control also passes, preserving the distinction between permission and required proof. Complete-phase status remains explicitly inactive at `core.js:595`. Read-only status is a current observation, not an atomic guarantee that later external state cannot change; application and merge retain their own qualification.

## Before and after: documented CLI evidence sequencing

An actual CLI subprocess first executes Verification with a valid configuration object. Both old README review commands, when given that object through `--consume`, fail with “Consumed proof must be an array” before provider launch. The repair removes the wrong option from both commands and explains configuration versus retained-result references in `cli/README.md:38–40,71–74`.

The adapter already omits the consumed field when the option is absent (`cli/src/commands/current.js:89–94`). Grouped code/spec and Judge then automatically select applicable retained Verification (`execution.js:265–279`). A positive actual core-operation probe, using a synthetic evaluator, passes for both and verifies the selected runner result reference in both recorded inputs. Retained ref in this run: `sha256:010b227f575e600e0f4dece5d86c49d1ae092b318479613b0a3de15e10364a87`. See `independent-cli-consumption.log` and `independent-cli-consume-probe.txt`.

This proves the actual CLI negative and the actual core automatic-consumption positive. It does not claim a new successful external Claude/OpenAI launch through the edited README commands. The documented sequence runs Verification before its consuming reviews; omission does not synthesize proof or remove the current-result qualification.

## Reproduction and results

Probe scripts are retained as non-executable .txt evidence. Copy to a temporary .mjs file to run with Node; imports target this worktree, so pin the reported source before reproducing.

```sh
EXPECT_FIXED=1 node --test /tmp/gr-standing-status-probe.mjs
node --test /tmp/gr-standing-cli-consume-probe.mjs
node --test /tmp/gr-standing-pre-candidate-probe.mjs
node --test --test-name-pattern='standing authority protected merge: final$|standing authority is explicit' cli/test/current-core.test.js
```

Independent current-source outcomes: seven status cases PASS; one CLI/automatic-consumption case PASS; one pre-candidate case PASS; two existing standing/integration controls PASS. Total 11 passing tests, plus seven earlier probes that asserted the original incorrect behavior. Exact stdout and durations are retained in the five independent log files. These runs create and remove disposable local fixtures; they neither mutate product source nor record events in the real feature.

No broad-suite, new desktop renderer, package, Intel runtime, installation, live hosted merge, release or external-provider quality claim is made by this delta review. Parent verification for those separately exercised surfaces is not recast as this reviewer's execution. Product fixes are limited to candidate-aware status and documentation, plus tests and synchronized desktop projection. Final formal assessment requires its separately pinned context and bound verification.
