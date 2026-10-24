# Independent D11 delta review — 2026-10-24

This is preliminary independent repair evidence, not a formal code/spec/Judge passage. Reviewer: continuing `/root/formal_code_spec` context, separate from the implementing parent; not a fresh history-blind evaluator. I made no product changes. I inspected the authorized working diff and approved D11, reproduced defects in disposable local fixtures, and wrote only these requested review/evidence artifacts.

Scope: standing grants, candidate/application/merge qualification, journal races, target scope, runtime discovery, CLI and desktop presentation. Relevant requirements are R15–R18 and R22/R23. This does not re-evaluate all 23 rows or certify a final package. Working HEAD observed was `52298c9489d7681c2aa558d50921435fbfd50bb7`; D11 product changes were initially uncommitted and evolved during this review. Final inspected repair source was committed as `d924492cc4f1ec825eaebcd5897c08208532cc38`; the last runtime probe ran that revision. Each observation below distinguishes original behavior from repaired behavior.

## Supported findings and dispositions

1. **D11-1 — P2: acceptance-only target scope was ignored (R16/R22).** The original candidate branch in `plugin-src/shared/resources/protocol/current/authorization.js:70–78` checked repository, source prefix and candidate scope but only checked target branch when an action was supplied. Real `authorization.apply` accepted a fully passing FEATURE candidate assessed against a release commit distinct from the grant's main tip. `scope-probe.txt` preserves the actual operation; original stdout is in `original-observations.log`. The repaired validity path compares each assessed target with the grant's live configured target. `scope-fixed.txt` rejects the same case. Existing acceptance may survive target advancement only for the same candidate's retained verified integration on the authorized branch; new application does not use that exception. Independent nonempty-diff SLICE and FEATURE merge tests both pass, and completion checks retain human acceptance after integration while correctly remaining blocked on missing finalization/release proof.

2. **D11-2 — P1: revocation during final qualification did not stop merge (R16/R17/R22).** In `current/actions.js`, the final journal check preceded asynchronous `qualifyingDecisions`. Injecting a real `revoke-standing` operation during its final Git read produced writes `ready, checks, merge` and MERGED state. Only subsequent integration publication noticed the changed journal. This was an actual `merge.execute` reproduction with a local bare Git remote and simulated GitHub transport, not merely a function-level claim. `revoke-race-probe.txt` and original stdout preserve it. The repair checks original journal state again after asynchronous qualification and immediately before the write. `revoke-race-fixed.txt` now blocks with no merge.

3. **D11-3 — P1: expiry during an awaited validity read did not stop merge (R17/R22).** The original deadline check occurred before validity's asynchronous reads. Advancing the test clock beyond the deadline inside the final branch lookup allowed merge and integration publication with no error. `expiry-race-probe.txt` retains this deterministic clock-boundary reproduction; its variable named `revoked` marks injection and is not a revocation event. The repair checks expiry at validity exit, after application's final candidate read, and synchronously after the final merge journal check. `expiry-race-fixed.txt` now blocks with no merge.

4. **D11-4 — P2: aborted default-open merge could not be prepared again (R18/R23).** This was an existing recovery defect exposed by standing revocation/expiry, not an authority bypass introduced by D11. `prepareMerge` requires an open draft; execution promotes it before waiting; the old default-open cleanup did not restore draft status. A realistic stateful GitHub mock reproduced OPEN/draft:false and the next `merge.prepare` error, “PR must be an open draft during preparation.” Closed policy differs: its preparation condition requires CLOSED, not draft, so that specific stall does not apply. Repair tracks this invocation's conversion, checks the unmerged PR/source/branch identity, calls `ready --undo`, and verifies restoration. Independent fixed probe now shows OPEN/draft:true, no forbidden merge, and successful preparation retry. See `draft-retry-probe.txt`, `draft-retry-fixed.txt` and their logs.

5. **D11-5 — P2: new standing reads discarded discovered Git (R18/R23).** `authorization.js` used default `git` without the configured executable. Actual `status` with `runtime.gitExecutable=/usr/bin/git` and `PATH=/nonexistent` changed a valid grant to inactive with `spawn git ENOENT`; explicitly wrapping Git with the supplied executable restored it. This is relevant to the established desktop discovery contract. The shared `configuredGit(core)` repair now forwards repository runtime selection in standing and action paths. Independent fixed status probe passes with the unavailable PATH. See `git-selection-probe.txt`, `git-selection-fixed.txt` and logs.

6. **D11-6 — P2: integration observation discarded supplied Python options (R18; repaired and rechecked).** `current/actions.js` called `runTrustedPythonGuard('merge.reviewedContent.verified', ...)` without `core.runtime.pythonGuardOptions`. With explicit compatible Python and a valid supplied helper environment, but an unavailable process PATH, real `integration.observe` rejected “Reviewed content is not verified on integration.” The exact same helper/arguments with those supplied options passed with status verified. A protected merge can therefore succeed and then fail its observation despite supplied runtimes. `python-selection-probe.txt` and `independent-python-selection.log` preserve the actual operation/control. This is an existing adjacent action-path omission, not a reason to weaken integration verification. The final repair at `current/actions.js:144–149` passes the supplied Python options and explicitly selected Git executable; `scripts/merge_verified.py:30,53` uses that selection in both subprocess paths. Independent `python-selection-fixed.txt` now passes real integration observation with both process PATH and supplied helper PATH unavailable, explicit absolute Python/Git, and a verified integration record. Its direct-helper control also passes.

## Executed checks and applicability

All tests use disposable fixtures and actual core entrypoints unless stated otherwise. GitHub transport and evaluator output are synthetic; local Git, journal publication, runner commands, validator processes and public CLI subprocesses are real. No network, actual PR mutation, deployment, installed-host activation or source edits occurred.

| Independent command | Result and scope |
|---|---|
| `node --test /tmp/gr-d11-scope-fixed.mjs /tmp/gr-d11-revoke-race-fixed.mjs /tmp/gr-d11-expiry-race-fixed.mjs` | 3 PASS; rejection of original target/revocation/expiry reproductions |
| `node --test --test-name-pattern='standing authority protected merge: (slice\|final)$' cli/test/current-core.test.js` | 2 PASS; nonempty source delta, exact actions, real local integration, post-integration acceptance; not whole completion |
| `node --test --test-name-pattern='standing authority is explicit\|standing scope rejects' cli/test/current-core.test.js` | 2 PASS; no-proof/waiver rejection, scope schema, pause/continue/revoke, branch/config/remote/commitment drift |
| `node --test --test-name-pattern='standing' cli/test/current-cli.test.js` | 1 PASS; public grant/status/revoke and fail-closed application without proof |
| `node --test apps/desktop/test/current-view.test.js` | 1 PASS; renderer scope/provenance/inactive reason and existing blocker display |
| `node --test /tmp/gr-d11-draft-retry-fixed.mjs /tmp/gr-d11-git-selection-fixed.mjs` | 2 PASS; follow-up cleanup/runtime changes |
| `node --test /tmp/gr-d11-python-selection-fixed.mjs` | 1 PASS; final committed runtime propagation, real integration record with unavailable process/helper PATH |
| Original defect probes | 6 reproduced cases; their PASS assertions confirm defects, not product acceptance |

The first nine repaired/positive/consumer checks preceded the final draft-restoration/Git-selection changes. Those narrow subsequent changes received two additional independent controls; this is explicit composite delta evidence, not an all-tests rerun of one immutable final tree. The final Python/helper change received its own additional passing integration control on committed repair source. These 12 repaired/positive/consumer checks are composite evidence; the six original defect assertions are separately retained.

## Criterion assessment

| Row | Delta assessment |
|---|---|
| R15 | Grant/application retain original observed instruction and exact candidate/action provenance. Repeat operation returns the original event. Amendments invalidate prior standing implementation binding; ordinary direct decisions remain separate. Relevant scope and positive operation controls pass. |
| R16 | No waiver becomes PASS and no merge permission is inferred from acceptance-only scope. Target qualification and revoked/expired authority repairs pass. Existing independent explicit candidate exceptions remain permitted by approved D11. |
| R17 | Actual local protected-action probes confirm both new final qualification races are blocked after repair. No claim of activated native hooks or arbitrary-shell interception. |
| R18 | Public CLI and renderer checks pass. Draft retry and discovered Git defects have independently passing repairs. The final Python integration runtime propagation repair also passes its independent operation/control. |
| R22 | Candidate target scope, all-required-PASS application, literal source prefix, allowed method, expiry/revocation and journal-state interactions examined; repaired target/race controls and both slice/final merge positives pass. No new full-feature formal verdict is implied. |
| R23 | Structured native/CLI status exposes scope, applications and validity reasons; renderer displays them and separately states deployment authority. Open-draft preparation remains default; explicit closed policy remains opt-in. Repaired default-open abort restores retryability. No rebuilt D11 packaged GUI evidence was assessed here. |

## Evidence limits and replay

Original stdout in `original-observations.log` is explicitly transcribed from actual tool output, not represented as a fresh post-repair run. Other logs retain independently captured output. Probe scripts are retained as non-executable `.txt`; copy to `/tmp/*.mjs` to run. Their absolute imports refer to this worktree, so replay uses its then-current implementation; the original scripts intentionally assert the original defect and should fail after repair. They do not freeze pre-fix product source.

The worktree may continue changing after these observations. A subsequent formal boundary must pin final bytes and assess applicable complete verification. This review provides neither native Judge passage nor authority to merge/release. No supported unresolved defect remains from this bounded delta assessment after the six repairs. This conclusion is not a formal whole-feature PASS. Built D11 package/native-host observations and complete bound verification remain for the later formal boundary.



## Final repair source fingerprints

Observed after the last independent probe; SHA-256 of canonical worktree files:

- `current/authorization.js`: `ad5c72183511d948769c6123d51a2d2fdb34a3b14198d295af31c1ce0d1bf223`
- `current/actions.js`: `67779efdac132f92b80f9ab4c5a7a348bd3b1791f00e07c253ebc1119f054b2d`
- `current/core.js`: `21df4323bf9fc3e34713cc7b69640a7aa648d92e6282fd059cf33054fc57bb47`
- `scripts/merge_verified.py`: `13df273edc25cad6f60df25e49358cbb8f46f242a38a68c52ba7e3d2fb272426`

JavaScript paths above are under `plugin-src/shared/resources/protocol/`; Python is under `plugin-src/shared/resources/`. The final source read confirms target/integration qualification at `authorization.js:84–100`, application PASS/state/expiry binding at `authorization.js:113–136`, final merge journal/expiry checks at `actions.js:96–102`, and conditional draft restoration at `actions.js:116–126`.
