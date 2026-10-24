**FAIL — R4, R6, R12 and R13 fail; the other 17 criteria pass.**

Reviewed the complete FEATURE_FINAL change from `643e3ea2b03f19b66595219c4f8df934596aa436` to `3dd128fc5dae29a7b6fa829fe23a5f32e0842b4c`, using the approved specification and design. Their digests, the inventory, all 47 patch chunks, assembled patch material, formal Verification and `runtime.png` matched their supplied bindings. The inventory contains 306 text changes: 50 additions, 99 modifications and 157 deletions; no binary entries or renames. All 11 current protocol files match the staged desktop copies.

**Supported findings**

1. **F1 — Reviewer inputs lose ordinary executable modes (R4, R12).** Capture retains `100644`/`100755`, but reviewer assembly writes every base, head, target and prior file as `0400`. Packet metadata includes modes only for special `entryKind` entries. Consequently, adding or removing an ordinary executable bit is invisible, including during delta assessment: the changed path can be named without exposing its actual transition. A read-only in-memory execution harness confirmed identical exported bytes, modes `[400,400,400]`, empty source-entry metadata, and admission of a structurally valid fixture PASS. Evidence: `current/evidence.js:91`; `current/execution.js:64`, `:81`, `:217`, `:381`, under `plugin-src/shared/resources/protocol/`.

2. **F2 — Later runner preflight errors strand earlier check receipts (R6).** The runner accumulates completed receipts in memory. A later invalid repository, purpose, argument list or checkout preflight can throw before the aggregate returns. The outer handler then retains an UNAVAILABLE gate result without the earlier check receipts. Output objects may remain orphaned, without their command/outcome provenance. The shared function affects both Verification and finalization and can strand earlier successful or failed checks. A read-only dependency-injected probe confirmed one invoked check followed by an unselected-repository error, `artifacts=[]`, and no retained check-receipt object. Passage remains blocked, but required evidence retention fails. Evidence: `current/execution.js:139`, `:142`, `:155`, `:163`, `:397`, `:422`.

3. **F3 — Present dispositions do not reopen automatic finding state (R13).** The output contract accepts `present`, but automatic history projection updates state only for `resolved` and `unsupported`. After FAIL → resolved PASS → supported present FAIL, it still treats the finding as closed. With equivalent inputs, the next review can receive no history or required disposition; with changed inputs, it receives the older finding/closure pair without the reopening report. A read-only selection probe confirmed empty automatic history and reconsideration lists. The latest FAIL initially blocks, but a later PASS can be admitted without reconciling the reopened finding. Evidence: `current/execution.js:186`, `:264`, `:273`, `:280`.

**Criterion assessment**

Paths beginning `current/` below refer to `plugin-src/shared/resources/protocol/current/`; test references refer to `cli/test/current-core.test.js` unless otherwise named.

| ID | Result | Assessment and evidence |
|---|---|---|
| R1 | PASS | Planning authority and all four milestone predicates are enforced; corrective work remains available. `current/core.js:142`, `:294`; tests `:50`, `:283`. |
| R2 | PASS | Readiness launches no reviewer; independent work has no scheduling graph or round cap. `current/core.js:209`; `current/execution.js:224`; tests `:61`. |
| R3 | PASS | Canonical local and parent records do not require evidence commits. `current/adapter.js:12`; tests `:72`, `:283`, `:490`, `:946`. |
| R4 | FAIL | Ordinary executable-mode changes are absent from reviewer-visible evidence. Finding F1. |
| R5 | PASS | Safe canonical reads, selected-scope exports and fresh read-only/network-denied provider contracts are present. `current/store.js:11`; `current/execution.js:61`, `:122`; tests `:104`, `:653`, `:946`. |
| R6 | FAIL | Later runner preflight failure leaves earlier executed checks without retained receipt bindings. Finding F2. |
| R7 | PASS | Core-generated packet closure retains application cleanliness and PR/integration protections. `current/evidence.js:107`; `current/execution.js:483`; `current/actions.js:21`, `:99`. |
| R8 | PASS | Code/spec verdicts are validated independently; missing verdicts and inherited contexts remain unavailable. `current/execution.js:122`, `:385`; tests `:180`; bound Verification `:18`, `:24`. |
| R9 | PASS | Required gate inventory and evaluator roles remain represented, including separate Judge and completion obligations. `current/contracts.js:39`; `current/execution.js:396`, `:402`; tests `:283`. |
| R10 | PASS | Equivalent content can reuse intact proof without rewriting original execution provenance. `current/evidence.js:164`; `current/execution.js:343`; tests `:527`, `:915`. |
| R11 | PASS | Relevant source, target, requirement, environment and evidence changes invalidate applicability; evidence loss creates a freshness barrier. `current/core.js:256`, `:274`; tests `:689`, `:998`, `:1019`. |
| R12 | FAIL | Delta path assertions cannot cover executable-mode transitions omitted from current/prior reviewer inputs. Finding F1. |
| R13 | FAIL | Reopened present dispositions are omitted from automatic finding reconciliation. Finding F3. |
| R14 | PASS | New findings and old-class instances remain reportable; blocking requires an approved criterion or gate rule. `current/execution.js:178`, `:214`; tests `:202`. |
| R15 | PASS | Scoped decisions preserve provenance and amendment versions, with repeat-safe pending continuations. `current/core.js:120`, `:159`; tests `:315`, `:1066`, `:1089`. |
| R16 | PASS | Exceptions remain distinct from original outcomes and merge authority; integration is separately observed. `current/contracts.js:90`; `current/core.js:175`; tests `:472`, `:915`. |
| R17 | PASS | Protected actions recheck the core and exact action; hook coverage and cooperative limits are explicit. `current/actions.js:45`; `current/contracts.js:96`; `cli/test/current-hook.test.js:9`. |
| R18 | PASS | CLI, plugins and desktop use the current core; obsolete ordering and automatic review launch are removed. `current/adapter.js:45`; `apps/desktop/renderer/current-view.js:48`; bound Verification `:10`. |
| R19 | PASS | Current distribution removes old orchestration and provides resume guidance without conversion or benchmark prerequisites. Inventory; `cli/src/index.js:1`; `current/adapter.js:45`. |
| R20 | PASS | Resume preserves old files, durably establishes current authority and does not translate old events into passes. `current/core.js:75`, `:90`; `current/store.js:142`; tests `:329`, `:570`. |
| R21 | PASS | Receipts expose available execution metrics honestly, retaining unknown values without a metrics gate. `local-agent-adapters.js:100`; `current/execution.js:427`; `current/adapter.js:79`. |

**Explicit checks:** Scope PASS: changed work fits the approved core, consumer, packaging, test and documentation scope. Gaps FAIL: the three demonstrated paths lack required behavior and are not established by the passing formal matrix. Contradictions FAIL: reviewer input fidelity, retained execution provenance and automatic open-finding reconciliation contradict approved C2/C3 contracts.

The full bound Verification reports 260 CLI passes, 172 desktop passes, 58 Python passes, separate live code-evaluator evidence and an actual ARM64 package runtime. Its screenshot was inspected. Those results do not cover the demonstrated defects. Live grouped evaluation, installed-host interception, native Intel runtime and live hosted merge are not claimed. Review probes used in-memory dependency doubles; no repository files were changed and the full suites were not rerun.