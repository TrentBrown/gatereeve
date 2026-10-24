**FAIL — 18 criteria pass and 5 fail.** One supported defect affects R1, R11, R16, R17 and R22: protected operations retain stale workspace configuration during execution.

The assessment covers the complete FEATURE_FINAL source from `643e3ea2b03f19b66595219c4f8df934596aa436` to `6d36117b1ad007141647b2739b4b6a1af9f45269`, all 23 approved rubric rows, the specification/design including D11, and the full bound Verification report.

Evidence integrity checks passed: the inventory contains 327 changes (105 modified, 157 deleted, 65 added), no binary entries, and all present changed files match their declared Git blob identities. All 53 patch chunks and their assembled digest matched. Desktop's 24 protocol files and canonical non-test Python helpers match their staged copies. `runtime.png` was verified and inspected. The embedded actual evaluator receipt passed the pinned public validator, including its output digest. The broader implementation suites were assessed through supplied Verification evidence, not rerun.

For the references below, `P/` means `plugin-src/shared/resources/protocol/current/`, and `T` means `cli/test/current-core.test.js`.

**F1 — Cached workspace configuration permits stale-policy merge execution.**

The native adapter resolves `.agentic-workflow.json` once when a request starts (`P/adapter.js:92`). `CurrentCore` stores that result and later returns copies of the same repository configuration (`P/core.js:70`). Candidate checks compare against this cached configuration (`P/evidence.js:203`), as do standing-grant bindings (`P/authorization.js:47`).

A reachable case is a valid protected merge waiting in `gh pr checks --watch`. During that wait, change the selected repository's integration/release branch or `keepPullRequestsClosed` policy in `.agentic-workflow.json`. The subsequent checks at `P/actions.js:83` still use the old configuration and can reach `gh pr merge` at line 104. Removing the repository or reassigning its configured path is similarly invisible to the in-flight core. A shared-parent configuration need not belong to Git; a repository-root configuration is explicitly excluded from source checks (`P/evidence.js:26`).

This is an omitted live-input check throughout the operation, rather than merely the unavoidable interval after a final filesystem observation. D11 explicitly requires repository configuration drift to invalidate further use, including already derived but unexecuted merges (`design.md:344`; `spec.md:299`). The existing configuration test changes `f.context.repositories` directly (`T:2395`), so it does not establish detection of the actual file-change scenario. This finding follows the pinned source path; no hosted or destructive reproduction was performed.

| ID | Result | Assessment and evidence |
|---|---|---|
| R1 | FAIL | Planning and milestone checks exist, but F1 allows merge passage under stale repository policy. `P/core.js:187`, `P/core.js:541`, `P/actions.js:83`. |
| R2 | PASS | Readiness launches no evaluator; explicit execution retains typed input requirements without a round cap or scheduling DAG. `P/core.js:282`, `P/execution.js:250`, `T:61`, `T:817`. |
| R3 | PASS | Canonical local storage supports single-repository/shared-parent and tracked/ignored/untracked records without evidence commits. `P/store.js:87`, `T:71`, `T:286`, `T:591`. |
| R4 | PASS | Exact requirements, approvals and base/head/target source are retained and validated; FEATURE requires the original base and full rubric. `P/evidence.js:61`, `P/evidence.js:151`, `P/evidence.js:195`, `T:891`. |
| R5 | PASS | Safe reads reject traversal/symlink substitution; reviewer exports restrict supplied content and filter history. Fresh evaluator requests declare read-only/network-deny policy. `P/store.js:33`, `P/execution.js:70`, `T:685`, `T:2072`. |
| R6 | PASS | Exclusive publication, mirrored journals and outcome markers preserve repeat/crash behavior; missing/corrupt proof cannot qualify. Retention does not claim backup. `P/store.js:67`, `P/store.js:236`, `P/execution.js:502`, `P/execution.js:577`, `T:1717`. |
| R7 | PASS | Packet/reference closure is local and core-derived; dirty application code and configuration cannot hide behind evidence-directory labels. `P/execution.js:569`, `P/evidence.js:121`, `T:286`, `T:1039`. |
| R8 | PASS | Grouped code/spec produces separately validated verdicts; missing output and inherited contexts remain unavailable. Embedded actual execution receipt independently validated. `P/execution.js:111`, `P/execution.js:453`, `T:179`, bound Verification live-evaluator records. |
| R9 | PASS | C1 obligations and evaluator roles remain explicit, including separate Judge and actual runner receipts. `P/contracts.js:40`, `P/core.js:325`, `P/core.js:432`, inspected prior-model deletion patch. |
| R10 | PASS | Equivalent content can reuse original proof across commit/bookkeeping changes without rewriting provenance. `P/evidence.js:179`, `P/execution.js:405`, `T:164`, `T:579`. |
| R11 | FAIL | Extensive mutation checks omit live workspace-configuration changes: cached repository identity can remain equivalent after actual policy/scope drift. `P/core.js:74`, `P/evidence.js:203`, `P/authorization.js:43`, `T:2395`. |
| R12 | PASS | Qualified delta ancestry, changed-path coverage and interaction claims are required, including base-only and target-only changes. `P/execution.js:40`, `P/execution.js:192`, `P/execution.js:369`, `T:907`, `T:1054`. |
| R13 | PASS | Claims, prior reports, limits and history gaps remain distinct. Open/claimed findings require dispositions; affected closures require independent assessment. `P/execution.js:192`, `P/execution.js:287`, `T:672`, `T:724`, `T:2030`. |
| R14 | PASS | New defects and old-class instances remain reportable; blocking findings require approved criteria or gate rules and current in-scope evidence. `P/execution.js:51`, `P/execution.js:202`, `T:1544`, `T:1784`. |
| R15 | PASS | One observed instruction supports repeat-safe combined decisions, retained provenance and old/new commitments, with visible pending state after interruption. `P/contracts.js:62`, `P/core.js:136`, `P/core.js:187`, `T:1124`, `T:1147`. |
| R16 | FAIL | Verdicts/exceptions/integration are honestly separated, but F1 permits previously authorized actions after policy/scope drift should invalidate their applicability. `P/contracts.js:123`, `P/actions.js:97`, `P/authorization.js:83`. |
| R17 | FAIL | Host coverage is honestly labeled and direct merge hooks route to the protected adapter, but that adapter retains the stale-configuration path. `P/contracts.js:131`, `P/pre-tool-use.js:6`, `P/actions.js:83`, `cli/test/current-hook.test.js:8`. |
| R18 | PASS | CLI/native/Desktop consume the current view, generate routine records and remove obsolete ordering controls. Supplied consumer/build smoke and runtime image support distribution. `cli/src/commands/current.js`, `apps/desktop/main/protocol-adapter.js`, `apps/desktop/renderer/current-view.js`, Verification lines 15–18. |
| R19 | PASS | Current entrypoints replace old orchestration; unsupported operations/receipts receive current-entry guidance. No staged pilot or benchmark gate is introduced. `protocol/index.js`, `P/core.js:715`, inventory deletions, public adapter rejection tests. |
| R20 | PASS | Resume establishes durable current authority without replaying old journals or manufacturing historical passes; interrupted activation/outcomes reconcile. `P/core.js:90`, `P/core.js:105`, `P/store.js:157`, `T:371`, `T:622`, `T:1665`. |
| R21 | PASS | Receipts expose timestamps, outcomes and available metrics; incomplete contributions remain unknown. Real-project observation guidance adds no benchmark requirement. `protocol/local-agent-adapters.js:98`, `P/execution.js:494`, `P/adapter.js:82`, `policy/WORKFLOW.md:76`. |
| R22 | FAIL | Explicit scope, actual PASS, expiry/revocation and exact actions are checked, but on-disk repository-configuration drift is not requalified during execution. `P/authorization.js:43`, `P/authorization.js:73`, `P/actions.js:83`; D11. |
| R23 | PASS | Grant scope, applications and inactive reasons are exposed; open drafts default and explicit closed policy remain represented. `P/core.js:664`, `apps/desktop/renderer/current-view.js:12`, `P/actions.js:41`, `T:2348`. |

**Scope check: PASS.** Changed work remains within the approved core, helpers, schemas, consumers, tests, documentation and generated projections. Whole-feature scope was retained.

**Gap check: FAIL.** Protected operations lack live workspace-configuration revalidation. The configuration test mutates an in-memory object, and the formal final mutation matrix does not cover the configuration-file change during hosted waiting.

**Contradiction check: FAIL.** Cached configuration after hosted waiting contradicts approved D11's required invalidation on repository configuration drift.

The Verification report is explicitly composite. Its actual ARM64 application smoke and retained evaluator execution are useful evidence; its fixture transports and historical checks do not establish a real hosted merge, installed-host interception, native Intel execution or publication. Those disclosed limits are not additional pre-merge failures.