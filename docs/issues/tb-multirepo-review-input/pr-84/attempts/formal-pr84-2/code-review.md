# Formal code review — PR84 / formal-pr84-2

**Verdict: FAIL. Two material interaction defects remain.**

Pinned review: base `643e3ea2b03f19b66595219c4f8df934596aa436`, head `b1d83440b4c44b77793895ef3297be2e9462d46a`. Source was read only from the supplied installed-core snapshot `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-UUhmfi/repository`; authoritative contexts and exported verification evidence were supplied separately. Requirements retain spec SHA-256 `2b2f80e655e4a038ddfa77f88dd764a32a2ce8a41ae8678822a3d2f346e5446e` and design SHA-256 `7639b18419a60766a19aad4b3b90b5c92aa21120a03ea1518d8d3a7232698fd2`.

Prior findings and remediation assertions were leads, not acceptance authority. I checked the current implementation and new interactions, without source mutation, external network access, or additional agents.

## Actionable findings

### CR2-1 — [P1] Classify retained history separately from executable source

**Location:** `plugin-src/shared/resources/protocol/current/evidence.js:13–21` (especially lines15 and19–21). Related export: `current/execution.js:63–66`; cleanliness: `current/evidence.js:79–86`.

**Approved criteria:** AC2/AC3/AC4/AC5; R3, R5, R8, R10, R13. C2 expressly says retained history must not leak through tracked source or diffs.

The new narrow exclusion protects arbitrary `helper.js` source, but only recognizes a few root documents and the current feature's `.gatereeve-current` objects. Existing structured workflow history outside those exact names is now ordinary application source. In a repository-local feature, tracked `docs/issues/feature/pr-84/attempts/formal-pr84-1/code-review.md`, `docs/issues/feature/advisory/run-1/discovery.json`, and another feature's `events.jsonl` all survive `tree` and are copied wholesale into the fresh reviewer workspace. This bypasses the bounded history/reference selection, relevant-finding filtering and claim labeling, exposing prior verdicts, unrelated advice and raw journal material as source. Both current and base trees are affected, so deleting history only at HEAD does not fix the base export.

A read-only call to the actual exported `excluded` function returned false for all three paths above, while correctly returning false for `docs/issues/feature/helper.js` and true for current object storage. The downstream tree filter and unfiltered reviewer copy make the export consequence direct; no live provider was invoked to leak records during this assessment.

The same predicate also governs cleanliness: a preserved untracked historical review/report file inside a single-repository feature is rejected as application dirt. Committing it then exposes it to the reviewer and binds it into source identity; subsequent report-only changes unnecessarily invalidate equivalent proof. This undermines optional-Git local records and makes older-work continuation depend on committing/ignoring/moving retained artifacts even when source is clean. The new tests cover arbitrary executable files in docs and a few root lifecycle documents, but not these existing retained-history cases.

Use a validated classification for reserved lifecycle documents, journals and recognized/typed review/advisory/verification artifacts across feature homes, and keep those out of source/diff exports and application-dirt checks. Continue treating arbitrary executable/configuration files as source; restoring a blanket `docs/issues/` exemption would reopen the code-drift defect. Add tests for tracked history exclusion, untracked historical-record continuation, both review endpoints, and ordinary helper code retention.

### CR2-2 — [P1] Separate cumulative review base from the live merge-target pin

**Location:** `plugin-src/shared/resources/protocol/current/evidence.js:96`, interacting with `plugin-src/shared/resources/protocol/current/actions.js:38–39`.

**Approved criteria:** AC1/AC4/AC7; C1 merge/final coverage contract, R1/R17 and the code-review correctness rule.

FEATURE candidates must now retain `pin.base === repository.featureBaseSha`, correctly preserving the original cumulative feature range. But `prepareMerge` still requires the current remote target tip to equal that same `pin.base`. If a feature began at B and main advances to M while the reviewed feature head is T, the valid cumulative review is B..T while the actual proposed merge target is M. Every FEATURE candidate is required to use B, and every protected merge preparation rejects it because M != B. Refreshing the review as the error requests cannot resolve the condition: using M as the review base is rejected by the new FEATURE check, and changing the configured original base discards the very full-feature range the repair preserves. Rebasing source onto current main likewise does not change the required original review base.

This affects ordinary target movement and multi-slice work where an earlier integration advanced the target. The existing merge tests keep the target at the original base before preparation and therefore miss the incompatibility. This is an availability/correctness defect, not an unsafe merge already being performed.

Retain original feature-review range and current target SHA as separate typed identities. Refresh the relevant interaction proof for target changes, bind human merge authorization to the exact current target, and revalidate that target immediately before execution. Do not relax the original feature-base requirement or eliminate target drift protection. Add a scenario where main advances after feature start and a properly refreshed, authorized cumulative FEATURE candidate can still use the protected merge adapter.

## Verified dispositions of earlier findings

| Earlier finding | Current assessment |
| --- | --- |
| Completion mixed new commitments and old candidate | Resolved: `core.js:289` checks candidate authorization against current commitments; regression test801 covers amendment after candidate retention. |
| Ancestor feature-home symlink | Resolved for normal adapter entry: CurrentCore passes workspaceRoot; CurrentStore validates all relative ancestors; artifact/status paths use the same check; test816 covers existing-home substitution. |
| FEATURE ignored original configured base | Direct omission resolved: preparation and admission enforce featureBaseSha and repository identity retains it; test831 covers narrowed/mutated policy. CR2-2 records the newly exposed merge interaction. |
| Delta ignored baseFiles | Resolved: changedPaths hashes both endpoints, and reviewer history exports prior base and head. Test847 inspects both endpoints. Pure probe now returns app/app.js for a base-only change. |
| Implementation skipped approval closure | Resolved: retained decision closure precedes implementation return (`core.js:283–284`); test791 removes retained interview bytes and observes denial. |
| Nested dependencies missed | Resolved for the reported Node/Python package layouts: environment discovery recursively includes nested node_modules/.venv; tests449 cover root, cli/node_modules and services/python/.venv and consuming assessments. Explicit environment/runtime declarations remain part of the contract. |
| Desktop Python package mismatch | Resolved: explicit package allowlist covers staged runtime Python closure; exported actual universal package verification and native ARM64 runtime pass. Pure allowlist probe confirms the lint paths. |

The additional repairs for ordinary CLI exception display, bookkeeping-equivalent quality exceptions, post-check PR identity revalidation, available provider usage, obsolete consumer guidance and optional local-state CI are present and have focused tests. None substitutes for the two findings above.

## Verification and scope limits

Retained evidence reports 252 CLI passes (one optional live test skipped in that suite), 172 Desktop passes including renderer build, 62 Python passes, native plugin lint/build/contract passes, plus a separately executed current-native evaluator test with one pass and no skips. The live result is a fresh Codex fixture context `01a16b5a-cb2d-74d1-a54a-b00e1a021801`, model `gpt-6.1-sol` high, with source/input/output-bound receipts and actual token fields; fixture PASS does not certify this product change.

Actual universal app/DMG build, package verification and governed runtime launch are supplied. The launch was native ARM64 with development ad-hoc signing; it does not establish native Intel runtime, notarization, publication or external installation. Host handler subprocess tests establish their stated narrow routing; live installed-host activation/arbitrary-shell interception is not claimed. Hosted API merge tests are injected. Exact-current hosted CI is not claimed, and the retained report separately identifies an unavailable historical rc.8 Homebrew artifact.

This evaluator performed static review and read-only pure-function probes, not broad suite reruns. The earlier installed snapshot helper's filtering of this formal packet does not prove that the new current protocol's reviewerView filters source history correctly. No source edits or milestone passage were performed.
