# Formal code review — PR84 / formal-pr84-1

**Verdict: FAIL — material correctness findings require remediation.**

Reviewed base `643e3ea2b03f19b66595219c4f8df934596aa436` through head `5724e5507b007c8c0558ece6bda4c95915016ad1`. Evidence was the supplied pinned read-only snapshot, its source patch inventory, approved spec/design, supplied boundary contexts, and retained verification artifacts. Supplementary `/tmp/gr-current-live.log` and `/tmp/gr-current-live-receipt.json` were explicitly supplied during evaluation. No source changes, network access, prior review reports, or independent history lookup were used. Later leads were checked against this snapshot rather than accepted as verdicts.

## Actionable findings

### CR-1 — [P1] Bind completion to the currently authorized commitments

**Location:** `plugin-src/shared/resources/protocol/current/core.js:275–287` (especially line 287); related `core.js:134–148`, `actions.js:91–113`. **Criteria:** R1, R4, R16, R17; AC1/AC2/AC6/AC7.

The milestone check verifies that *current* design/spec have implementation authorization, then completion loads the retained candidate with `live: false`. It never checks that this candidate's `authorization.subject` and requirements are the current commitments. An amendment preserves the previous candidate, decisions, results and integration references. After approving amended requirements, `integration.observe` can observe the old candidate again and enter INTEGRATED; finalization/release can be refreshed against that old source. Completion then evaluates old review results and old human acceptance/waivers against the old candidate while separately satisfying implementation authority with the new requirements. The newly promised behavior has never been accepted. Require the completion candidate to bind current approved commitments, and invalidate/supersede old candidate acceptance when commitments change. Keep historical results intact.

### CR-2 — [P1] Validate the complete canonical-home path on every operation

**Location:** `plugin-src/shared/resources/protocol/current/store.js:89–93`. **Criteria:** R5; AC2.

`CurrentStore.at` only `lstat`s the final feature directory, then makes its `realpath` the trusted root. A symlink in `docs` or `docs/issues` is therefore followed and converted into trusted storage. The resolver returns a lexical `workspaceRoot/docs/issues/<featureId>` (`context.js:333–348`), and ordinary status/decision/candidate/gate operations call `CurrentCore.at` without `ensureHome`; that ancestor check only runs for start/resume (`current/adapter.js:88–89`). Substituting an ancestor after creating a run allows reads and writes outside the configured workspace, and `readSafe` cannot detect it because its root is already the escaped directory. Validate ancestors and containment relative to the trusted workspace root before opening the store on every entry, rather than trusting the final component alone.

### CR-3 — [P1] Preserve the configured feature review base for FEATURE scope

**Location:** `plugin-src/shared/resources/protocol/current/evidence.js:87–95`, `:98–103`. **Criteria:** R4; AC2/AC4 and complete-feature acceptance in C1/C4.

The resolver explicitly supplies `repository.featureBaseSha` (`context.js:195–213`), but candidate preparation accepts any caller `pin.base` and treats FEATURE as complete merely when every rubric ID is selected. It also omits featureBaseSha from `repositoryIdentity`. A last-slice base, or even `base === head`, can therefore become the final FEATURE candidate despite an earlier configured feature base. Code/delta review receives that shortened comparison and completion treats the FEATURE label as whole-feature coverage. Enforce the original configured feature range (and its applicability identity), or require an explicit independently validated equivalent cumulative-coverage contract. Merely selecting all rubric IDs does not establish whole-feature change coverage.

### CR-4 — [P2] Include base-tree changes in delta coverage

**Location:** `plugin-src/shared/resources/protocol/current/execution.js:40–43`; admission at `:308–319`, `:212–214`. **Criteria:** R11, R12; AC4.

`changedPaths` compares only each repository's head `files`, while `contentIdentity` also binds `baseFiles`. A changed review base with an unchanged head produces a different required input identity but an empty delta path list. The delta preflight only compares requirements, criteria and scope, and PASS coverage checks are then vacuous for paths. A delta may supplement the former review without identifying files newly introduced into or removed from the comparison. A read-only pure-function probe with only a baseFiles hash changed returned `contentIdentityChanged: true` and `changedPaths: []`. Include review-range/base-tree changes in the declared delta or require a wider fresh review when the base changes.

### CR-5 — [P2] Validate retained approval evidence before implementation passage

**Location:** `plugin-src/shared/resources/protocol/current/core.js:280–283`. **Criteria:** R1, R6, R17; AC1/AC2/AC7.

The implementation check returns before `store.closure(state.decisions)`. Thus an approved interview or retained approval-document blob can be missing/corrupt while implementation is still reported allowed and `milestone.pass implementation` can append passage. Current file fingerprints plus a readable spec-validation receipt are insufficient to prove retained approval closure. This differs from later milestones, which correctly check the closure. A read-only in-memory control-flow probe with an unavailable decision closure returned `allowed: true`, `missing: []`, and zero closure checks. Apply the decision evidence integrity check to the implementation boundary too, while leaving ordinary repair work available.

### CR-6 — [P2] Bind installed dependencies for nested package checks

**Location:** `plugin-src/shared/resources/protocol/current/environment.js:43–52`. **Criteria:** R11; AC4.

Automatic runtime capture covers only `<repository>/node_modules` and `<repository>/.venv`; missing ones hash as null. An accepted normal check such as `npm --prefix cli test` uses `cli/node_modules`, and this repository explicitly documents nested package installation (`cli/README.md`, Setup; separate `cli/package.json` and `apps/desktop/package.json`). With omitted optional `runtimeInputs`, changing ignored nested installed dependency bytes changes neither source identity nor the environment fingerprint. `currentResult` therefore continues accepting/reusing old verification and its consuming assessments. There is no completeness check or conservative unknown-input outcome. Discover package roots from existing manifests/check configuration or require an explicit complete runtime-input scope before allowing reusable proof for such commands. The existing dependency regression at `cli/test/current-core.test.js:449–462` tests only root node_modules.

### CR-7 — [P1] Update the desktop package contract for newly staged Python resources

**Location:** `apps/desktop/scripts/stage-protocol.mjs:17–22`. **Criteria:** R18; AC7/AC8 local build/distribution integration.

The new staging list copies lint_spec.py, lint_issues.py, lint_tracker.py, pattern_tool.py, the pattern Python tree, and merge_verified.py. The package verifier rejects every Python file outside `STAGED_PYTHON_RUNTIME_PATHS` (`verify-macos-package.mjs:172–177`), whose unchanged list contains only pr_context.py, workflow_common.py and workflow_context.py (`macos-package-contract.mjs:63–67`). A normally staged desktop package therefore cannot pass its own verification. A read-only import probe confirmed all three added lint paths are unapproved. Update the governed package inventory and its test to cover the actual staged Python closure. This is a local packaging regression, not a request for publication or installation.

## Nonblocking documentation follow-up

`cli/README.md` still ends with the retired `advisory declare-readiness` command and claims readiness launches isolated discovery. The command has been removed and current readiness deliberately launches nothing. Remove/update this obsolete section; its existence is not evidence that a legacy execution path remains.

## Verification assessed and limits

- Retained CLI run: 240 passed, 0 failed, 1 live-provider test skipped. Desktop run: renderer build plus 172 passed. Python run: 62 passed. Native lint/build/contract validation and local Electron runtime smoke are retained.
- Explicit supplementary current-protocol live test: 1 passed, 0 failed/skipped. A real fresh Codex context `01a16b4e-1938-7020-b92a-0dc6a1226759`, model `gpt-6.1-sol`, high effort, produced a source/input/output-bound code result. This proves a fixture traversed the current native adapter; its PASS is about the trivial fixture, not this product change. Grouped code/spec and malformed/forged receipt cases remain contract-test coverage.
- Fresh read-only probes checked implementation closure control flow, base-only delta enumeration, and the desktop Python allowlist. Broad suites were not rerun or mutated by this evaluator.
- Host hooks have packaged subprocess tests and explicit limited coverage. Actual installed-host interception, arbitrary shell protection, deployment, public release, and project efficiency are not established or newly required.
- The supplied metadata reports a GitHub-reported SHA different from the explicit pinned head. This report is for the pinned head above; source/PR synchronization at any later authorized merge remains separate.

No fixes or milestone passage were performed. See the separate spec evaluation for all 21 rows and AC1–AC8.
