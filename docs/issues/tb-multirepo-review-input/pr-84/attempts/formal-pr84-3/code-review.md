# Independent code review — formal-pr84-3

**Verdict: FAIL.** One supported P2 defect remains. This is an independent assessment, not implementation, passage, merge authorization, or publication evidence.

## Evaluated identity and method

- Base: `643e3ea2b03f19b66595219c4f8df934596aa436`.
- Candidate: `3dd128fc5dae29a7b6fa829fe23a5f32e0842b4c`.
- Source read only from `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-zVK5jy/repository` (called **snapshot** below), with `/tmp/gr-review-view-3.json` and `/tmp/gr-context3-codeReview.json` identifying scope. The closed PR's older hosted head is not substituted for this candidate.
- Requirements: `docs/issues/tb-multirepo-review-input/spec.md`, SHA256 `2b2f80e655e4a038ddfa77f88dd764a32a2ce8a41ae8678822a3d2f346e5446e`; `design.md`, SHA256 `7639b18419a60766a19aad4b3b90b5c92aa21120a03ea1518d8d3a7232698fd2`.
- Inspected the current core, source capture, independent execution, applicability, decisions, retention, merge adapters, current consumers, regression tests and supplied source patches. Earlier observations were leads only. No source changes, network calls or delegated agents were used. A read-only Node import probe checked the current exclusion function. Full-suite and native execution evidence was inspected from the supplied artifacts, not rerun by this reviewer.

## CR3-1 — P2: Classify reserved explanation reports at nested packet paths

**Location:** `plugin-src/shared/resources/protocol/current/evidence.js:30–33` (same staged implementation in `apps/desktop/resources/protocol/current/evidence.js`).

`REPORTS.has(local)` compares the complete feature-relative path, although `explain-diff.html` is a reserved report name. It therefore recognizes the root report but not established paths such as `docs/issues/other/pr-8/explain-diff.html` or `docs/issues/other/pr-8/attempts/a/explain-diff.html`. The subsequent artifact-extension check omits HTML and line 33 immediately returns false for these files. This is a concrete preserved workflow artifact, not a hypothetical arbitrary HTML application: the supplied source diff `.gatereeve-agent-evidence/patches/feature-20.patch:690,734` contains the former `pr-8/explain-diff.html` artifact path; `feature-45.patch:1302` shows the former formal explain-diff writer using the packet gate's output path.

The current function was imported without changing source. For bytes `<html>implementation commentary</html>` it returned:

| Path | `excluded(path, null, bytes)` |
| --- | --- |
| `docs/issues/other/explain-diff.html` | true |
| `docs/issues/other/pr-1/explain-diff.html` | false |
| `docs/issues/other/pr-1/attempts/a/explain-diff.html` | false |
| `docs/issues/other/pr-1/app.js` | false |

Consequences follow directly from callers: tree capture retains these ordinary files at line 91; candidate base/head/target snapshots are exported by `execution.js:64–69`, bypassing bounded and labeled history. Untracked reports fail the early bookkeeping predicate in `evidence.js:112` and then the dirty-source check at line 132. Tracked report-only changes alter `contentIdentity` at lines 164–167, forcing renewed evidence despite equivalent application inputs. A feature preserving an ordinary old PR explanation therefore either leaks implementation narrative into independent review or cannot continue with untracked local records.

This violates AC2/C2's explicit retained-history isolation and optional record-Git contract, AC4 equivalent-input reuse and AC5 bounded reviewer history. Fix the named report leaf within recognized artifact areas; retain arbitrary `app.html`, scripts and configuration as source. Extend the all-endpoint/history regression to cover tracked and untracked nested explanations, including another feature home. A blanket HTML or directory exemption is not required.

## Current repair assessment

The prior broad history defect is substantially narrowed: lifecycle Markdown/journals and recognized typed JSON evidence across feature homes are now excluded, while executable-mode files, ordinary scripts and arbitrary JSON/YAML remain source. The current test at `cli/test/current-core.test.js:946` covers those examples but omits the nested HTML case above.

The previously conflated original feature base and merge target are now separate. `evidence.js:145–156` retains original base/head and target files, `execution.js:40–48` includes target changes in delta paths, `execution.js:177` admits findings against target files, and `actions.js:36` binds the live target to the assessed target. The merge adapter rechecks core proof and PR identity after hosted checks and binds the source at the write. Tests cover target-only changes and prior target bytes. The hosted target cannot be atomically compare-and-swapped by the chosen API; the source comment and verification limit acknowledge the immediate pre-write recheck instead of asserting an unavailable guarantee.

Runner proof now hashes the complete captured inherited environment and passes that same object to command execution (`environment.js:51–68`, `execution.js:150–157,331–334`). Failed spec validation appends exact documents/diagnostics and clears current validation (`core.js:23,129–140`); failed reconciliation retains documents/proofs and a FAIL outcome (`execution.js:443–476`). Combined amendment and waiver continuations first retain a pending observed instruction and reconcile it on retry (`core.js:120–127,169–188`). Tests at `current-core.test.js:1019,1039,1066,1089` address those interactions. The Python importable legacy merge executor has been removed; its command entry now gives current-adapter guidance. The remaining Python integration verifier reads Git state.

The earlier current-commitment completion check, ancestor-symlink rejection, original feature-base binding, base-only delta coverage, decision closure, nested dependency capture and Python packaging closure remain present. No additional supported material defect was found in the examined interactions.

## Actual verification and limits

Supplied log endings confirm CLI 260 PASS / 0 FAIL / 1 optional live SKIP (261 total), desktop 172 PASS / 0 FAIL, and Python 58 PASS. The separate real evaluator run is 1 PASS without a skip. Its receipt identifies bundled Codex CLI 0.163.0-alpha.11.2, gpt-6.1-sol/high, fresh context `01a16b74-baab-7321-b1bf-d9e3f6cf3d68`, zero inherited turns, and bound input/instructions/output/snapshot digests. Its simple target-aware fixture demonstrates the adapter; it does not approve this feature or establish a live grouped code/spec assessment. Grouped semantics are exercised in deterministic provider-contract tests.

Plugin build/lint/native validation and the rebuilt universal macOS app/DMG have retained successful evidence. Mounted package verification and governed native ARM64 runtime passed, with development ad-hoc signing. The package digest is `44c2ab61d12ecb81a02a07da37109e426018fed7013361e16438282ffc82e887`. Intel binary slices were checked; native Intel execution, notarization, installation and publication were not claimed or required here.

Hosted merge tests use injected adapters; no live hosted merge was performed. Hooks have subprocess/direct-command routing coverage, with arbitrary shell execution and live installed-host activation explicitly outside demonstrated enforcement. Exact-current hosted CI is not claimed while the PR is closed. Empty pattern policy is not substantive pattern-rule coverage. None of those disclosed limits creates a new release, installation, benchmark or production requirement. They also do not override CR3-1.
