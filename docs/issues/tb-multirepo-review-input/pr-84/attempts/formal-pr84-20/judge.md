# Independent workflow judgment: FAIL

Reviewed FEATURE_FINAL scope from `643e3ea2b03f19b66595219c4f8df934596aa436` to `3463e054dcbfa46833b7907f9f36ce3a8dd38e89`, including all 23 frozen criteria.

The bound specification, design, inventory, patch index, all 52 patch chunks, full Verification report and `runtime.png` matched their declared hashes. The assembled patch matched its material digest. The inventory contains 327 changes: 105 modified, 157 deleted and 65 added, with no binary entries. All 170 surviving changed files matched their declared Git blob identities.

The full Verification report and runtime image were inspected. Verification distinguishes local fixtures, packaged CLI/plugin checks and actual ARM64 desktop runtime from unverified native-host interception, hosted CI, Intel runtime and publication. Its embedded live evaluator receipt establishes execution/transport evidence, not this feature's independent quality verdict. No network tools, repository edits or correction loop were used.

## Supported findings

### F1 — Superseded direct authority can revive

`plugin-src/shared/resources/protocol/current/core.js:58` selects any historical decision matching the requested kind and subject. The implementation check at `core.js:484` does not reject that approval when a later amendment supersedes it.

A reachable sequence is: authorize commitments A; record amendment B without implementation continuation; restore A's requirement bytes; refresh specification validation. Validation can reuse the historical design approval (`core.js:246`). The old implementation approval then qualifies, and candidate preparation can return the feature to IMPLEMENTING (`core.js:258`).

A read-only in-memory probe using the pinned projection/check functions and a current trusted Python binding returned `allowed: true`, `missing: []`, with phase PLANNING and amendment B as the latest commitment decision. Storage and document observations were supplied in memory; this was not an end-to-end merge test.

The related direct acceptance/merge path has the same omission: `current/authorization.js:138` applies supersession qualification only to standing-derived decisions. An identical restored candidate can therefore recover older direct decisions. No hosted merge was performed.

This violates current milestone authority and approval of commitment changes. It affects R1, R4, R15, R16 and R17.

### F2 — Existing exception restrictions are weakened

The bound deletion of the canonical explain-diff definition records a required, enabled obligation with `waiverAllowed: false` (`.gatereeve-agent-evidence/patches/feature-45.patch:118`). Its replacement has `waivable: true` (`current/contracts.js:49`). An ordinary waiver therefore bypasses the preserved policy-amendment requirement. A read-only probe of `waiverFor` confirmed qualification without any policy-amend decision.

The related enabled-Whiteboard scenario loses its prior `non-behavioral-only` waiver restriction (`feature-44.patch:1825` versus `current/contracts.js:54`). The current waiver path has no equivalent restriction.

Specification C1 preserves gate obligations and exception-policy authority; C5 explicitly requires an applicable policy amendment for non-waivable gates (`spec.md:175`). Removing scheduling choreography does not authorize these policy expansions. This affects R9, R15, R16 and R17, and fails the scope and contradiction checks.

## Criterion results

Paths below beginning `current/` refer to `plugin-src/shared/resources/protocol/current/`. Test references refer to `cli/test/current-core.test.js` unless otherwise stated.

| ID | Result | Assessment and evidence |
|---|---|---|
| R1 | FAIL | F1 permits historical implementation authority after a superseding amendment. `current/core.js:58`, `:258`, `:484`; read-only rollback probe. |
| R2 | PASS | Readiness launches no evaluator; execution is explicit and has no remediation-round cap. `current/core.js:266`; `current/execution.js:250`; tests `:61`, `:817`. |
| R3 | PASS | Canonical local storage supports repository-local and parent tracked/ignored/untracked records without evidence commits. `current/adapter.js:11`; tests `:71`, `:286`, `:591`. |
| R4 | FAIL | Byte/source pinning exists, but F1 can bind a candidate to superseded approval of restored requirements. `current/core.js:251`, `:262`, `:484`. |
| R5 | PASS | Safe canonical reads, scoped reviewer export, history exclusion and declared provider isolation are implemented. `current/store.js:10`, `:33`; `current/execution.js:70`; tests `:103`, `:2072`. |
| R6 | PASS | Exclusive object publication, mirrored journals, durable outcomes and evidence-loss barriers preserve integrity and recovery. `current/store.js:65`, `:236`; tests `:1412`, `:1717`. |
| R7 | PASS | Packet/reference closure is derived locally while source cleanliness and integration protection remain. `current/execution.js:569`; `current/evidence.js:121`; tests `:951`, `:1039`. |
| R8 | PASS | Separate grouped verdict validation and fresh evaluator receipt checks prevent missing/self-certified verdicts. `current/execution.js:111`, `:453`; test `:179`; Verification's embedded live execution records. |
| R9 | FAIL | F2 changes preserved explanation and enabled-Whiteboard exception contracts. `current/contracts.js:49`, `:54`; bound removed definitions in patch chunks 44–45. |
| R10 | PASS | Equivalent content reuses original proof and provenance across new commit identities and reordered inputs. `current/evidence.js:179`; tests `:579`, `:1290`, `:1307`. |
| R11 | PASS | Source, dependency, environment, support, consumed-proof and validity changes invalidate affected proof. `current/core.js:393`; `current/environment.js:191`; tests `:508`, `:2241`, `:2253`, `:2280`. |
| R12 | PASS | Qualified deltas require prior proof, changed-path coverage and examined interactions, including base/target changes. `current/execution.js:243`, `:373`; tests `:201`, `:907`, `:1054`. |
| R13 | PASS | Relevant history, labeled claims, affected dispositions and justified closure carry-forward are retained without raw session history. `current/execution.js:211`, `:283`; tests `:724`, `:1784`, `:2072`. |
| R14 | PASS | New defects remain reportable; blockers require approved criterion/gate-rule and current-source support. `current/execution.js:53`, `:199`; tests `:201`, `:1544`, `:2030`. |
| R15 | FAIL | F1 permits an unapproved commitment rollback; F2 bypasses the required policy-amendment decision. `current/core.js:235`, `:484`; `current/contracts.js:98`. |
| R16 | FAIL | Outcomes remain truthful, but F1 revives superseded direct authority and F2 broadens exception eligibility. `current/authorization.js:138`; `current/contracts.js:98`. |
| R17 | FAIL | Adapters consult the shared core, but F1/F2 make invalid authority/policy states eligible for protected passage. `current/core.js:475`, `:548`; `current/actions.js:52`. Native-host interception is honestly labeled unverified. |
| R18 | PASS | Native, CLI and desktop share current operations; incidental ordering and old execution entry points are removed. `cli/src/index.js:1`; desktop protocol adapter/current renderer; bound packaged/runtime Verification. |
| R19 | PASS | Old scheduler/replay execution is deleted; unsupported records receive current-run guidance without automatic conversion or benchmark prerequisites. Inventory; `current/store.js:184`; `current/adapter.js:43`. |
| R20 | PASS | Resume retains old state, durably establishes current authority and recovers activation interruption without converting old passes. `current/core.js:98`; `current/store.js:192`; tests `:371`, `:622`, `:1981`. |
| R21 | PASS | Available usage/timing remains inspectable, unknown metrics stay null, and observations add no metrics gate. `local-agent-adapters.js:100`; `current/execution.js:495`; workflow observation guidance. |
| R22 | PASS | Standing grants require actual PASS, explicit scope/actions and live qualification through hosted waits. Their latest-implementation check correctly blocks amendment drift. `current/authorization.js:7`, `:71`, `:113`; tests `:2374`, `:2407`. |
| R23 | PASS | Consumers expose grant scope/provenance/applications and inactive reasons; open drafts default and explicit closed policy is enforced. `current/core.js:592`; `current/actions.js:41`; CLI/current-view tests. |

## Explicit checks

- **Scope: FAIL.** File categories are in scope, but F2 introduces an unauthorized exception-policy expansion.
- **Gaps: FAIL.** Direct authority lacks amendment-supersession checks; explanation/Whiteboard exception restrictions lack equivalent current enforcement. The existing standing-grant drift tests do not cover the direct-authority rollback sequence.
- **Contradictions: FAIL.** F1 conflicts with current milestone/commitment authority; F2 conflicts with preservation of exception policy and the explicit policy-amendment requirement.

Overall acceptance fails despite the substantial passing implementation and Verification evidence. The two findings are supported scenarios, not a claim of exhaustive defect discovery.