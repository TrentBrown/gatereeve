# Independent code review — formal-pr84-6

**Verdict: FAIL.** Two supported material findings: one P1 acceptance bypass and one P2 retained provider-proof binding defect. This is an independent review report, not a protocol passage, merge authorization, or substitute for the separately executed Judge.

## Reviewed identity and method

- Base: `643e3ea2b03f19b66595219c4f8df934596aa436`.
- Candidate: `dc9732c821dc3363c69f4de0115c7ccd80b8bc30`; supplied verification identifies substantive source `e0221667e25481000d0694a8af7ecc14555e0718` and later review metadata only.
- Sole source tree: `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-ju1OTI/repository`.
- Authoritative contexts: `/tmp/gr-context6-codeReview.json`, `/tmp/gr-context6-specEvaluation.json`, `/tmp/gr-review-view-6.json`. Both feature and slice ranges cover the stated full base/head change.
- Approved spec SHA256: `2b2f80e655e4a038ddfa77f88dd764a32a2ce8a41ae8678822a3d2f346e5446e`; design SHA256: `7639b18419a60766a19aad4b3b90b5c92aa21120a03ea1518d8d3a7232698fd2`.

I inspected the change inventory, canonical current protocol, source/retention/authority/execution/action interactions, relevant tests, CLI/native/desktop consumer changes and cutover surfaces. The 307-entry inventory and all 48 patch chunks were checked for declared sizes, offsets and hashes; assembled patch length is 3,096,300 bytes and hash is `sha256:18c329e2b6aa4ff8e42554039181ea7973e0bcaa01c67105cf0fb8cee7a31d04`. All 22 staged desktop JavaScript protocol files match canonical source byte-for-byte. This does not mean every generated/deleted line received equal semantic scrutiny.

All source paths below are relative to that pinned tree. No implementation, repository history, host configuration or external service was changed. Disposable fixture repositories were used for actual operation probes and removed afterward.

## CR6-1 — P1: stale inputs on a newer failed review resurrect an older PASS

**Location:** `plugin-src/shared/resources/protocol/current/core.js:391–398`, especially the catch-and-continue at line 398. The corresponding packet-selection path is `core.js:232–237`. `currentResult` at lines 276–327 checks the selected proof's own applicability but does not enforce the outstanding newer blocking finding.

When a later code review reports a source-backed blocking finding and consumes Verification, changing that runner's environment makes the later review inapplicable. `check()` catches that failure and continues backward to an earlier code PASS without that consumed dependency. The earlier PASS is reported as current success although the source and candidate have not changed, the later finding has not been resolved, and no exception was authorized. `inventory()` performs the same fallback, so a fresh packet presents the old PASS.

This reaches an actual acceptance event, not merely a helper return. Using the pinned test fixture and its full valid gate setup:

1. Authorize and prepare one unchanged candidate; execute all required acceptance gates successfully.
2. Execute a new code review that returns FAIL with blocking `finding-1`, criterion `R1`, path `app/app.js`, consuming the existing actual Verification PASS.
3. Confirm acceptance is blocked.
4. Change one inherited environment variable. Execute fresh Verification, spec and Judge only. Do not rerun code review or resolve/waive its finding.
5. Execute a fresh packet gate and check acceptance.
6. Execute `milestone.pass` for acceptance.

Observed output:

```text
before drift acceptance false
packet code row: gate=code, outcome=PASS, reference=<original code PASS>
after refresh acceptance true; missing=[]
code: outcome=PASS, exception=null, satisfied=true
actual passage: MILESTONE acceptance
blocking report still FAIL: FAIL
```

The fixture evaluator is injected; actual runner commands, retained objects, execution jobs, candidate preparation, packet construction and milestone passage use the pinned implementation. No live provider or external merge is needed to demonstrate the admission failure.

**Requirement violated:** AC1/AC4/AC5/AC7, particularly R1, R11, R13 and R17; C3 requires affected findings/resolutions to remain meaningful and C4 requires qualifying current coverage rather than silently falling back past adverse evidence.

**Repair boundary:** prevent current gate selection and current consumed-proof admission from treating an earlier PASS as sufficient over a relevant unresolved later blocking finding. `execution.js:270` also qualifies explicit consumed references through `currentResult`; fixing only status/inventory selection leaves that admission interaction unchecked. Historical ancestry is a different use: `execution.js:342–352` intentionally accepts older PASS as delta support, and its later chronological history/disposition checks must continue to permit a properly assessed repair. Do not globally forbid historical prior results. Verification deliberately combines actual check coverage and must retain that behavior. A generic provider UNAVAILABLE without a source-backed finding is not the same fact as the demonstrated later blocking FAIL; this finding does not prescribe a universal latest-record barrier.

## CR6-2 — P2: provider output retention changes the bytes used by the receipt digest

**Location:** `plugin-src/shared/resources/protocol/current/execution.js:129`. Related implementations: `current/store.js:121`, `agent-workflow.js:35–39` and `agent-workflow.js:154–155`.

The provider receipt hashes an object using insertion-order `JSON.stringify(value) + '\n'`. `independent()` retains that output with `store.putJson`, which recursively sorts object keys through `canonical()`. Validation at execution time checks the original in-memory object, so the gate succeeds. Reading the retained output reconstructs the sorted-key object, whose provider digest differs. The public stage validator can no longer validate the retained receipt/output pair.

This is directly observable in the supplied fresh live execution evidence, not only a synthetic ordering example. In `.gatereeve-agent-evidence/live-evaluator.json`, the current provider receipt passes shape/version validation but its output digest is:

```text
receipt: sha256:e7a68456774df74c65f7b2faaf5079c239f4db40fabcef86cb67254e7dced7a9
retained output: sha256:de310ca9849e674eddb594c3d81b3d326a77291b3b08293c83740b4d2894d932
public stage validator: Agent workflow stage output digest differs from its receipt
```

I also ruled out export-only formatting as the cause: a disposable actual `gate.execute(code)` using the pinned valid fixture provider recorded PASS. Reading its provider receipt and output directly through `store.json(result.artifacts[0/1])` and rebuilding the public stage envelope produced the same rejection. Fixture receipt/output digests were respectively `7a8478cfdc83defbc3005b76f993e3588c40e382599af4f036f19e158781b2c8` and `802838f2f841dfafc5972fb1c3c46f8557030a88d5134f64dc85029a996632aa`.

**Requirement violated:** C2 retained output/provenance binding, AC2/AC3 and R6/R8. This does not disprove the observed fresh evaluator execution; it prevents verifying its promised retained receipt/output binding after the storage round trip.

**Repair boundary:** use the same deterministic serialization for provider digest creation/validation and retention, or retain the exact serialized digest input. Keep output substitution checks. Add a real store round-trip test and refresh affected provider proof under the corrected contract rather than weakening the validator or relabeling the old receipt.

## Reproduction recipe

The following uses only helpers already present in pinned `cli/test/current-core.test.js`. It can be placed after those helper declarations in a disposable copy whose imports point at the pinned source. In this review the helpers were extracted and imported as a data-URL module, so no source file was written. `fixture(t)` registers deletion of its temporary directory; run its cleanup after each probe.

```js
// CR6-1; fixture, authorize, candidate, reviewAll, runVerification and
// fakeEvaluator come unchanged from the pinned current-core.test.js.
const f = await fixture(t);
await authorize(f); await candidate(f); await reviewAll(f);
const verificationRef = (await f.core.state()).state.results[0];
const configuration = { provider: 'codex', model: 'fixture' };
fakeEvaluator(f, { blocking: true });
const failed = await f.request('gate.execute', {
  gates: ['code'], configuration, consumed: [verificationRef]
}, 'later-code-fail');
assert.equal((await f.request('milestone.check', {name:'acceptance'})).allowed, false);
const key = 'GATEREEVE_FORMAL6_STALE', previous = process.env[key];
try {
  process.env[key] = 'changed';
  const refreshed = await runVerification(f, false, 'refresh-verification');
  fakeEvaluator(f);
  for (const id of ['spec', 'judge']) await f.request('gate.execute', {
    gates: [id], configuration, consumed: refreshed.event.payload.results
  }, 'refresh-' + id);
  await f.request('gate.execute', {gates:['packet']}, 'fresh-packet');
  const check = await f.request('milestone.check', {name:'acceptance'});
  assert.equal(check.allowed, true); // BUG: unresolved later code FAIL
  const passage = await f.request('milestone.pass', {name:'acceptance'}, 'repeat-acceptance');
  assert.equal(passage.event.type, 'MILESTONE');
  assert.equal((await f.core.store.json(failed.event.payload.results[0])).outcome, 'FAIL');
} finally {
  if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
}

// CR6-2; run in a separate fresh authorized/prepared fixture with fakeEvaluator(f).
const ran = await f.request('gate.execute', {
  gates:['code'], configuration:{provider:'codex', model:'fixture'}
}, 'code');
const result = await f.core.store.json(ran.event.payload.results[0]);
const receipt = await f.core.store.json(result.artifacts[0]);
const output = await f.core.store.json(result.artifacts[1]);
assert.equal(result.outcome, 'PASS');
validateAgentWorkflowStageResult({
  schemaVersion:1, protocolVersion:receipt.protocolVersion,
  stageId:receipt.stage, status:receipt.status, receipt, output
}); // BUG: throws output-digest mismatch after successful retention
```

## Verification and residual limits

Independent execution on this exact pinned tree: **31 tests passed, zero failed/skipped**—17 selected current-core integration/regression tests and 14 public receipt/provider/hook tests. These included actual local integration/completion, job provenance, reserved history modes, lost failed-spec retention, closure reuse, delta chronology, completed runner receipts after later failure, decision races, finding-scoped exceptions, transitive environment/expiry/pattern/triage risks and missing-pattern waivers. The two additional operation probes above expose cases outside those green assertions.

Supplied current logs independently inspected: CLI 288 PASS plus one optional live SKIP; desktop 172 PASS; Python 58 PASS; separate actual live OpenAI test 1 PASS. The fresh receipt identifies context `01a16bc7-fd28-7212-9fe9-8c1c2282b370`, model `gpt-6.1-sol`, freshContext=true, inheritedTurns=0, current protocol `2.0.0`; it tests a tiny code-review fixture, not this product's semantic acceptance or real grouped code/spec quality. Its retained output binding is the subject of CR6-2.

The package log and structured package/runtime receipts support actual universal packaging and ARM64 runtime smoke. Development ad-hoc trust is reported. Intel execution, notarization/publication, installed native-host activation and current hosted CI are not demonstrated and are not invented pre-merge requirements. Hook tests demonstrate manifest/handler subprocess behavior; the matrix correctly says `configured-hook-unverified-host`. Arbitrary shell enforcement is not claimed. Empty pattern scope supplies no substantive rule coverage.

`verification.md` references a screenshot and several focused/intermediate logs that were not exported into this pinned snapshot. I did not inspect those missing files or independently view a screenshot; the available structured runtime receipt and package log were considered. Earlier review verdicts were not used as acceptance authority. Prior repaired paths were checked against current source and tests, but these two remaining defects prevent approval.
