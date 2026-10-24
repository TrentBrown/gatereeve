# Independent code review — formal-pr84-4

**Verdict: FAIL.** Two supported defects: one P1 and one P2. The four claimed repairs were inspected; three are complete for their tested scope, while reopened-finding handling has a remaining delta interaction.

## Identity and method

Base `643e3ea2b03f19b66595219c4f8df934596aa436`; candidate `856e2ee82294dbd4a8b35efd781a35ca7495a4b2`. Authoritative context: `/tmp/gr-context4-codeReview.json`. Source was read only from `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-oBrrJ6/repository` (**snapshot**). The closed PR's earlier hosted head is not substituted for this candidate.

Approved `spec.md` SHA256 `2b2f80e655e4a038ddfa77f88dd764a32a2ce8a41ae8678822a3d2f346e5446e`; `design.md` SHA256 `7639b18419a60766a19aad4b3b90b5c92aa21120a03ea1518d8d3a7232698fd2`, checked directly. Both reside in `docs/issues/tb-multirepo-review-input/`.

The assessment covers source capture, current core, role/receipt validation, history and delta admission, runner evidence, publication/retention, decisions, protected actions, consumer integration and the supplied base-to-head changes/tests. Earlier findings were leads, not acceptance authority. No source mutation, network or subagents were used. Actual supplied logs were inspected. Additional authorized disposable fixtures outside the snapshot executed the pinned CurrentCore through `gate.execute`, using the pinned test helper definitions and injected evaluator contract; they were cleaned afterward. These are local core integration reproductions, not live model or hosted merge executions.

## CR4-1 — P1: Keep the delta prior in chronological history order

**Location:** `plugin-src/shared/resources/protocol/current/execution.js:342–345`, especially line 345. Also staged in `apps/desktop/resources/protocol/current/execution.js`.

Automatic history is correctly sorted by durable result order at line 316, but a passing delta prior is appended afterward at line 345. When that prior contains an older `resolved` disposition and a later review has reopened the same blocking finding with `present`, the resulting array ends with the old closure. `validateVerdict` folds dispositions in array order at lines 203–209, so the old PASS turns the finding closed again. A new delta PASS can then omit any disposition for that currently open finding.

The prior's applicability check at line 342 validates the older result against its own candidate. It does not reject a historical PASS merely because a later assessment reopened a finding. The resulting delta passes `currentResult` and is accepted by the milestone code. This is not only a missing reviewer hint: the deterministic requirement for an independently supported disposition is bypassed.

**Actual reproduction through `gate.execute`:** using `fixture`, `authorize`, `candidate`, and `fakeEvaluator` from the pinned `cli/test/current-core.test.js` in an isolated temporary repository:

1. Prepare/authorize a FEATURE candidate. Run code review with `blocking:true`: FAIL with `finding-1`.
2. Run code review with `dispositions:[{id:'finding-1',status:'resolved',evidence:'Original independent closure'}]`: retain its PASS result as `prior`.
3. Run a later code review with changed configuration, explicit original finding history, `outcome:'FAIL'`, and `status:'present'`: FAIL reopens the finding.
4. Change `app.js`, commit only that fixture change and prepare the new FEATURE candidate.
5. Run `gate.execute` with `gates:['code']`, the old passing `prior`, and a fresh injected PASS with `dispositions:[]` and complete changed-path/interaction coverage.
6. Inspect the returned report and `core.check('acceptance').outcomes.find(x => x.id === 'code')`.

Observed output:

```json
{
  "initial": "FAIL",
  "closure": "PASS",
  "reopened": "FAIL",
  "delta": "PASS",
  "dispositions": [],
  "historyOrder": ["original FAIL", "later FAIL/present", "older PASS/resolved"],
  "currentCodeSatisfied": true
}
```

A preliminary read-only execution of the exact validator function also rejected `[original,reopening]` without a disposition, but accepted `[original,reopening,olderClosure]`; the full fixture above establishes reachability beyond that function-level check.

**Required correction:** merge/deduplicate the delta prior before the final durable-order sort, or derive current finding states independently from the transport array. Cover delta review after a closure is reopened, with unchanged and changed source, omitted/unaffected/present dispositions rejected and a fresh supported closure accepted. Preserve the older result as evidence without making it the latest disposition. Violates AC1 milestone integrity, AC4/C4 delta qualification and AC5/C3 affected-finding verification (R1, R12, R13).

## CR4-2 — P2: Do not make malformed unexecuted checks permanent coverage obligations

**Location:** `plugin-src/shared/resources/protocol/current/core.js:237–241` in `verificationCoverage`. Also staged in `apps/desktop/resources/protocol/current/core.js`.

Coverage is reconstructed from every historical `inputs.configuration.checks` entry, before checking whether that entry was valid or actually executed. `commands` rejects non-array/non-string arguments before execution (`execution.js:156`), but its enclosing handler publishes an UNAVAILABLE result containing that malformed configuration. On every later applicability check, `verificationCoverage` hashes the malformed declared command/arguments and adds it to `required` anyway.

For `args:'--version'` or `args:[7]`, no successful execution can ever have the same identity, because the runner requires an array of strings. A corrected check therefore cannot cover the old entry. With omitted `args`, `identity({repository,command,args})` receives `undefined` and throws `Non-JSON contract value`, blocking applicability even earlier. Ordinary correction has no recovery path under the existing commitments except a quality exception or unrelated commitment change.

**Actual reproduction:** for each case use a fresh authorized FEATURE fixture, then execute:

```javascript
await request('gate.execute', {
  gates: ['verification'],
  configuration: { checks: [badCheck] }
}, 'bad');
const fixed = await request('gate.execute', {
  gates: ['verification'],
  configuration: { checks: [{
    repository: 'app', command: process.execPath,
    args: ['--version'], purpose: 'Corrected check'
  }] }
}, 'corrected');
const status = (await core.check('acceptance')).outcomes
  .find(item => item.id === 'verification');
```

All first attempts were UNAVAILABLE and all corrected commands actually returned PASS. Results:

| Initial defect in `badCheck` | Corrected verification satisfied? | Corrected result applicability |
| --- | --- | --- |
| `args: '--version'` | false | uncovered previously declared checks |
| omit `args` | false | `Non-JSON contract value` |
| `args: [7]` | false | uncovered previously declared checks |
| repository `unselected` | true | applicable |
| omit `purpose` | true | applicable |

The controls narrow the defect. Unknown repositories are excluded from the selected repository coverage set; missing purpose leaves the same command identity, so a corrected run covers it. Malformed argument identities poison coverage despite never being executed. Failed *executed* checks must continue to require correction; preserving that safety property does not require an obligation for impossible syntax.

**Required correction:** validate check shapes before recording coverage-bearing execution inputs, or derive prior coverage obligations from retained actual command receipts, excluding checks rejected before execution. Preserve diagnostics and actual earlier executed failures. Add tests that correct these malformed inputs and regain current verification without waiving substantive checks. Violates AC1's corrective-work/current-proof contract (R1).

## Repair verification and broader assessment

- **Nested explanations:** `evidence.js:32` recognizes reserved report leaf names only after checking the artifact area. Direct probes now exclude nested `pr-1/explain-diff.html` and `pr-1/attempts/a/explain-diff.html`; `pr-1/app.html` remains source. T:946 and T:985 cover tracked/untracked all-endpoint history and ordinary HTML/configuration source. CR3-1 is resolved for the reported case.
- **Original Git modes:** `execution.js:62–70` writes complete base/head/target mode/kind metadata, invoked for current and prior snapshots. Instructions expressly direct the reviewer to those files because materialized files are read-only. The mode-only regression at T:1108 checks executable mode changes, prior endpoint modes and materialized 0400 permissions. Referenced source metadata generation is deduplicated by result hash.
- **Partial runner retention:** `execution.js:151–177` now wraps both preflight and postflight around the loop and retains prior receipts/stdout/stderr on later failure. Two new tests use an earlier exit 0 or 7 and a later invalid repository; both retain actual prior outcomes and full closure. CR4-2 concerns later applicability, not loss of those retained receipts.
- **Reopened findings:** automatic full-review history now records reopening and sorts durable results; its two new full-review tests are valid. The delta path remains defective as CR4-1 shows.
- Prior safeguards remain: original feature base is separate from the assessed merge target; all endpoints influence delta/current applicability; inherited execution environment and nested dependencies are bound; failed validators/pending human instructions are retained; current commitments are checked at completion; ancestor symlinks are rejected; protected actions recheck PR identity and target after hosted checks; the Python legacy merge executor remains removed. Current CLI/plugin/desktop consumers expose the shared core, exceptions and honest enforcement coverage.

No additional supported material defect was found in the remaining examined interactions. Fixing only the four named prior issues is insufficient because the new reproductions expose reachable admission/recovery problems.

## Verification evidence and limitations

Supplied raw log endings confirm CLI **265 PASS / 0 FAIL / 1 optional live SKIP** (266 total), desktop **172 PASS / 0 FAIL**, Python **58 PASS**. The separate live evaluator run is **1 PASS, no skip**, with bundled Codex CLI 0.163.0-alpha.11.2, gpt-6.1-sol/high, fresh context `01a16b89-fa92-7681-85dd-ea36c8179d05`, zero inherited turns and bound receipt digests. That simple fixture establishes current adapter execution, not feature acceptance or a live grouped code/spec run. Grouped semantics have provider-contract coverage.

Actual rebuilt universal app/DMG, mounted validation and native ARM64 governed runtime passed with development ad-hoc signing. DMG SHA256 `5faa361544ac2e1bf3b581c1b597bbdafe9b8e64df192d20978760af260f95ce`. Native Intel runtime, notarization, installation and publication are not claimed. Hosted merge tests are local injected harnesses; hooks demonstrate packaged subprocess/direct-command routing, not arbitrary shell protection or live installed-host activation. Exact-current hosted CI is not claimed for the closed PR. Empty pattern scope is not substantive pattern-rule coverage. These are disclosed limits, not new release/installation/benchmark requirements.
