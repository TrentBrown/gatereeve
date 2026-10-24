# Independent workflow judgment: FAIL

Evaluated the complete feature from `643e3ea2b03f19b66595219c4f8df934596aa436` to `b55399291d58475a5396ec94b1092a703749c149` against the approved specification and design. Three supported defects affect six rubric criteria. Scope passes; gap and contradiction checks fail.

The specification, design, inventory, patch index, full Verification report and runtime attachment match their supplied hashes and lengths. All 49 patch chunks also match their hashes, offsets and assembled 3,145,810-byte material digest. The inventory contains 307 files: 100 modified, 157 deleted and 50 added, with no binary entries or recorded renames. Review included canonical shared code, distributed desktop projections, consumers, helpers and relevant tests.

Formal Verification reports 310 CLI passes plus one opt-in skip, 172 desktop passes, 58 Python passes, a separately successful live evaluator execution, plugin validation, universal packaging and ARM64 application smoke. I read the full bound report and inspected the bound `runtime.png`. Its native-host interception, Intel-runtime and hosted-CI limitations are stated honestly and do not introduce additional pre-merge requirements. Full mutating suites were not rerun in this read-only review. The reproductions below used in-memory inputs and injected transport; they did not launch evaluators or record gate passage.

## Supported findings

1. **F1 — Declared evaluator qualification is unenforced.** `current/execution.js:113` forwards caller-selected reasoning effort to either provider, while line 124 declares `minimumReasoning: high`. Receipt validation checks these fields as strings rather than enforcing the minimum (`protocol/agent-workflow.js:76`). Admission and subsequent applicability checks also omit that comparison (`current/execution.js:134`, `current/core.js:329`). A read-only reproduction requested `low`, obtained a receipt declaring minimum `high` and actual effort `low`, and successfully validated it as completed. Otherwise valid verdicts encounter no capability rejection. This affects grouped code/spec review, Judge, optional whiteboard and assessments using the same execution path. It violates the required qualifying-evaluator and proper-proof contracts.

2. **F2 — Internal validator changes do not invalidate retained proof.** `protocol/python-guards.js:74` fingerprints a guard name, script filename, arguments and output, excluding the helper contents, interpreter identity and execution assumptions. Core-role results use a constant environment identity (`current/environment.js:52`). Implementation eligibility checks specification document hashes and whether the old proof remains readable (`current/core.js:405`), without checking whether its validator still applies. Reconciliation similarly executes issue/tracker helpers without binding their implementation identity (`current/execution.js:502`). Consequently, an installed helper update or relevant Python change outside an unchanged application candidate can leave obsolete proof current. A read-only comparison confirmed identical core environment identities for different interpreter PATH assumptions. This violates C2/C4 and the requirement to refresh changed or uncertain execution inputs.

3. **F3 — Partial usage is presented without identifying missing data.** `protocol/local-agent-adapters.js:102` drops unknown values before summing; line 246 applies this across completed Codex turns. The receipt has no completeness marker. A read-only reproduction with usages `[{input_tokens:12, output_tokens:7}, undefined]` returned numeric totals of 12 and 7 without identifying the unknown contribution. Missing usage is therefore effectively treated as zero, contrary to R21's observation contract.

## Rubric

| ID | Result | Assessment and evidence |
|---|---|---|
| R1 | FAIL | Planning and authority checks exist, but stale internal specification proof can permit implementation and later passage. F2; `current/core.js:405`. |
| R2 | PASS | Readiness launches nothing; independent work has no incidental sequence or round cap. `current/core.js:219`; tests at `current-core.test.js:61,774`. |
| R3 | PASS | Canonical parent, repository-local, tracked, ignored and untracked records use local evidence without commits. Tests at `current-core.test.js:73,286,553`. |
| R4 | PASS | Exact source endpoints, requirement bytes, authority, repository scope and original feature base are bound and checked. `current/evidence.js:140,173`; tests at `503,848,1011`. |
| R5 | PASS | Safe capture rejects traversal and symlinks; reviewer exports select permitted inputs and providers request read-only/network-denied contexts. `current/store.js:10`; `current/execution.js:70`; tests at `833,957`. |
| R6 | PASS | Exclusive publication, mirrored journals, durable outcome markers, integrity checks and visible loss support recovery without inventing passage. `current/store.js:67`; tests at `1544,1671`. |
| R7 | PASS | Local packet closure and finalization retain application cleanliness, source/PR synchronization and reviewed integration protection. `current/execution.js:533`; `current/actions.js:21`; tests at `286,908`. |
| R8 | FAIL | Separate fresh verdicts are implemented, but below-minimum evaluator execution can qualify. F1; `current/execution.js:113–139`. |
| R9 | FAIL | The obligation inventory is complete and mechanical receipts are actual, but required independent gates do not enforce their declared evaluator qualification. F1; `current/contracts.js:40`; `current/core.js:329`. |
| R10 | PASS | Equivalent content reuses original results and provenance across commit and ordering changes. `current/execution.js:374`; tests at `540,1246,1262`. |
| R11 | FAIL | Application and runner mutation coverage is substantial, but internal validator/interpreter changes are omitted from applicability. F2; `python-guards.js:74`; `current/environment.js:52`. |
| R12 | PASS | Deltas bind prior/current proof and cover changed base/head/target paths and interactions. `current/execution.js:40,227,336`; tests at `503,864,1011`. |
| R13 | PASS | Claims, limits, open findings, affected closures and unavailable history are distinguished; unaffected applicable closures carry forward. `current/execution.js:184,277`; tests at `629,681,734,1738`. |
| R14 | PASS | New defects remain reportable; blocking findings require selected source and approved criteria or gate rules. `current/execution.js:51,194`; tests at `201,1498`. |
| R15 | PASS | One observed instruction can authorize named continuations, with pending-state recovery, provenance and old/new commitments retained. `current/core.js:120,163`; tests at `318,1079,1102`. |
| R16 | PASS | Exceptions preserve failures, bind risk and remain visible; merge authority and observed integration stay separate. `current/contracts.js:97`; `current/core.js:362`; tests at `485,1336,1387,1403`. |
| R17 | FAIL | Adapters consult the shared core and report hook limits honestly, but protected passage can consume the invalid proof admitted by F1/F2. `current/core.js:451`; `current/actions.js:51`. |
| R18 | PASS | CLI, plugins and desktop share current operations and views; incidental ordering controls are removed. Canonical and desktop protocol/release projections match. Consumer tests and bound package/runtime Verification support this result. |
| R19 | PASS | Legacy orchestration/replay is removed; unsupported versions receive current-run guidance without migration, pilot or benchmark prerequisites. Inventory; current exports; retired legacy merge entry. |
| R20 | PASS | Resume preserves historical files and authority provenance, durably establishes current activation and recovers interrupted copies without translating old passes. `current/core.js:79`; tests at `332,583,1619`. |
| R21 | FAIL | Available observations are retained without another gate, but partially missing provider usage becomes unmarked numeric totals. F3; `local-agent-adapters.js:100,246`. |

## Explicit checks

- **Scope: PASS.** Changes fit the approved core/helper/schema, CLI/native-plugin, desktop-consumer, packaging, test and documentation scope. No supported scope creep was identified.
- **Gaps: FAIL.** Capability enforcement, internal-validator applicability identity and partial-usage representation are missing.
- **Contradictions: FAIL.** A receipt can declare a high minimum while recording accepted low effort; current-proof claims omit relevant validator changes; usage totals conceal unknown contributions.

The reported mechanical successes do not resolve these reachable contract failures. No code was edited.