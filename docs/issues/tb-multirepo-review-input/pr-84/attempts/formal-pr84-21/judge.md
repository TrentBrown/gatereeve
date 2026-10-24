**FAIL — pinned source `85125e4edae84a805d5e0d6334c3fd418038a328`.** Two supported defects remain. All 23 criteria were evaluated; 17 pass and 6 fail.

| Criterion | Result | Basis |
|---|---|---|
| R1 Planning and milestone authority | FAIL | Unjournaled input drift can pass admission. |
| R2 Model-led execution | PASS | Explicit execution, independent ordering and no round cap. |
| R3 Canonical layouts | PASS | Shared local records do not require evidence commits. |
| R4 Exact source and requirements | PASS | Frozen source, raw requirements, scope and authority bindings. |
| R5 Containment and isolation | PASS | Checked capture, selected exports and provider isolation contract. |
| R6 Publication and retention | PASS | Exclusive publication, integrity checks and recoverable recording. |
| R7 Local finalization | PASS | Core-derived packet/reference closure and separate PR checks. |
| R8 Independent grouped verdicts | PASS | Separate verdict admission and validated actual execution receipt. |
| R9 Complete obligation inventory | PASS | Required gates and actual runner proof remain represented. |
| R10 Equivalent-input reuse | PASS | Content-based applicability preserves original provenance. |
| R11 Relevant change and uncertainty | FAIL | Late input drift escapes same-operation invalidation. |
| R12 Targeted delta coverage | PASS | Qualified ancestry, changed paths and interactions required. |
| R13 Bounded history and dispositions | PASS | Claims, affected closures and carry-forward are distinguished. |
| R14 New discovery and blocking criteria | PASS | New supported defects remain reportable under approved rules. |
| R15 One scoped human decision | PASS | Observed provenance and repeat-safe combined decisions. |
| R16 Honest exceptions and integration | FAIL | Effective remote drift leaves standing authority applicable. |
| R17 Enforcement coverage | FAIL | Final milestone guard checks journal revision, not live inputs. |
| R18 Coherent consumers and low ceremony | PASS | Shared current core; ordering and automatic launch controls removed. |
| R19 Direct cutover | PASS | Current entry and explicit resume replace orchestration replay. |
| R20 Resume without false history | PASS | Durable replacement runs preserve old records without inherited passes. |
| R21 Practical observations | PASS | Available metrics retained; unknown values remain unknown. |
| R22 Scoped standing authority | FAIL | Effective remote redirection does not invalidate a grant. |
| R23 Standing surfaces and PR default | FAIL | Redirected grants remain displayed as active; draft defaults otherwise hold. |

**F1 — Passage can admit stale live inputs.** `current/core.js:503` checks the live candidate before the gate-validation loop. Subsequent result validation uses retained candidates with `live:false` (`:401`). Before appending passage, `:561-566` checks only run/event revision. A corrective edit, new local HEAD, or design/spec change during validation can leave that revision unchanged and permit acceptance using stale proof. The same issue affects requirement drift, not merely dirty application files. A read-only control-flow probe using the actual check/pass implementations with injected proof/store dependencies appended an acceptance milestone after simulated unjournaled drift: one live candidate read, `sourceClean=false`. This probe establishes the guard omission; it is not a filesystem integration test. The candidate-replacement fixture at `cli/test/current-core.test.js:1274` exercises journaled replacement and does not cover this path.

**F2 — Grants omit effective remote identity.** `current/authorization.js:50-54` binds the raw `remote.<name>.url`; `:80` compares the same value later. Git `url.<destination>.insteadOf` can change the destination without changing that value. If the redirected repository shares the assessed target commit, `:98-99` also passes. A read-only probe exercised actual grant capture/validity with local Git URL resolution and stubbed branch/target transport: the effective destination changed to another repository while validity remained `allowed:true`. This violates D11's remote-drift restriction. Shared status (`core.js:606`), CLI (`current.js:29`) and desktop (`current-view.js:12`) also report the grant as active instead of explaining its invalidity.

**Scope: PASS. Gaps: FAIL. Contradictions: FAIL.** The 327-entry inventory and full feature patch were considered, including canonical shared code and distributed consumers. No supported scope creep was identified. The missing final live-input guard and effective-remote binding contradict the approved current-proof and standing-authority requirements.

The supplied document, inventory, patch, Verification and image digests were verified. All 53 patch chunks validated and assembled to the declared material hash. The complete formal Verification report and `runtime.png` were inspected. Its composite test provenance and runtime/host limitations were preserved. The embedded actual fresh evaluator receipt/output passed the pinned public validators; that receipt proves execution transport, not this feature's quality. No files were changed, no network was used, and no full test-suite rerun or correction loop was performed.