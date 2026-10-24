# Formal code review — PR84 / formal-pr84-12

**Verdict: PASS. No material actionable findings.**

## Candidate and assessment boundary

Base `643e3ea2b03f19b66595219c4f8df934596aa436`; evaluated head `85f8b36f3fbeeff9b5e39941b1508e6c8d7ee9ca`; substantive product `af3fad7c8ce4520366cd23adc8d4b879135ae6bc`.

Source was inspected only in `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-cQ1LU6/repository`, manifest `/tmp/gr-review-view-12.json`, digest `sha256:c40aea132adb91715d1a4906bfc9f86c8b9e03c3505f502972f11f49cd350e23`. Authoritative output contexts: `/tmp/gr-context12-codeReview.json` and `/tmp/gr-context12-specEvaluation.json`. The assessment covers the cumulative feature change, all 21 rubric rows and all eight acceptance criteria, not merely the latest repair delta.

Approved requirements are `docs/issues/tb-multirepo-review-input/spec.md` (SHA256 `2b2f80e655e4a038ddfa77f88dd764a32a2ce8a41ae8678822a3d2f346e5446e`) and `design.md` (SHA256 `7639b18419a60766a19aad4b3b90b5c92aa21120a03ea1518d8d3a7232698fd2`). These hashes match the inspected bytes. In source references below, `P/` means `plugin-src/shared/resources/protocol/`; line numbers refer to this immutable candidate.

Prior observations were leads, not acceptance authority. The earlier formal11 PASS reports and the actual Judge FAIL remain unchanged. This assessment examines the repaired current source and its interactions; it does not reinterpret the earlier candidate as passing.
## Current code assessment

I examined the cumulative current protocol, canonical source/requirements/evidence capture, evaluator contracts/history, reuse/delta admission, decisions/exceptions, persistence and recovery, protected actions, current consumers and distributed build identity. No material actionable current finding requiring a priority/file/line report was established. This is not a claim that all possible defects have been excluded.

The current isolation changes address the reproduced paths rather than merely suppressing their tests. `P/current/evidence.js:24` reserves the exact documented root checkpoint and direct archive names case-insensitively. Arbitrary application/configuration files in those directories remain source, and reserved executable, symlink or Gitlink entries reject. Capture applies the classification at base/head/target. `assertSourceIsolation` at `:185` also checks retained candidates; `checkCandidate` at `:194` and `P/current/execution.js:70` enforce it before current and prior reviewer exports or metadata are written. `P/current/core.js:531` identifies incompatible historical source as a gap, allowing fresh full proof to use labeled context without re-exporting raw session source or overwriting retained history. Current, historical and case-alias negatives were exercised in the independent 22-test rerun.

`P/current/store.js:157` now interprets `runId` and successor `previous` only for the current contract. Unsupported root or successor objects remain opaque retained provenance even when their field names differ or their current-style run identifier is invalid. Mirrored byte conflicts still reject, current-schema chain checks stay strict, and `active()` cannot grant authority to unsupported records. Public resume establishes a durable replacement without inheriting approval. This closes both the root-schema and successor-schema reproductions, with positive and negative controls.

`P/current/adapter.js:37` supplies Markdown format in the shared artifact metadata used by snapshots and reads. The renderer discriminator at `apps/desktop/renderer/renderer.js:1132` now receives that value. The actual adapter-to-renderer integration verifies rendered headings, source controls and navigable artifact links (`apps/desktop/test/renderer-integration.test.js:125`).

Surrounding feature interactions were examined beyond these fixes: complete Git-root capture and all source endpoints (`P/current/evidence.js:54,150,194`); latest relevant criterion/coverage and cross-gate history (`P/current/execution.js:290`); source-backed negative and pending-outcome admission versus historical ancestry (`P/current/core.js:311,333`); gate-qualified closures and transport-only controls; live/transitive waiver risk (`:419`); origin-bound failed validation and public retained references (`:132`); exact-state decision/milestone operations (`:174,520,560`); mirrored journal/activation recovery and durable outcome-ready reconciliation (`P/current/store.js:146,265`, `P/current/core.js:567`); actual executed-command coverage (`P/current/execution.js:159`, `P/current/core.js:278`); provider capability/receipt qualification (`P/agent-workflow.js:46,56,150`); trusted helper/runtime binding (`P/python-guards.js:67,80,86`); and exact merge/integration protections (`P/current/actions.js:21,51,107`).

The separate spec assessment records every rubric row and acceptance criterion. Earlier candidate failures remain failures; this assessment applies only to the current immutable pin. No new release/install requirement or unsupported scope expansion is introduced.

## Verification examined

| Evidence | Actual execution and applicability |
| --- | --- |
| Full CLI, `cli-tests.log` | 350 PASS, 1 intentional opt-in live-provider SKIP, 351 total, 0 FAIL on substantive product `af3fad7`. Includes the actual more-than-64-record history scenario and the existing scope, authority, recovery, concurrency, reuse and isolation interactions. |
| Focused final controls, `focused-final.log` | 22 PASS, 0 SKIP. Independently rerun against this immutable pin: 22 PASS, 0 FAIL, 0 SKIP. Covers session paths/case aliases at current/base/target/prior endpoints, executable/symlink/Gitlink negatives, incompatible retained proof becoming context-only, twelve unsupported root-copy/schema cases and both unsupported/current successor controls. |
| Desktop, `desktop-tests.log` | 172 PASS on current product. The real protocol-to-renderer integration opens canonical Markdown, exposes rendered/source controls and follows the specification link; it does not manufacture `artifact.format` in a renderer-only mock. |
| Python, `python-tests.log` | 58 PASS reused from unchanged Python helper implementation. This is explicitly not a newly run final-head Python suite. |
| Live provider, `live-evaluator.log/json`, `live-roundtrip.json` | Actual fresh OpenAI/Codex fixture: 1 PASS, 0 SKIP. Bundled Codex `0.163.0-alpha.11.2`, `gpt-6.1-sol`, high reasoning, fresh context `01a16c5e-a740-7853-835b-b12d3d34b41c`, inherited turns 0. I independently validated the retained public stage-result envelope and canonical output digest `sha256:585b1978ba6b2eea20c4fb24c55b1ab68978ca7f26fb05fb4ad52a208f3628cf`. This proves adapter/receipt execution on the fixture, not substantive PR84 acceptance. |
| Plugin and record checks | Retained plugin lint/build/native validation and all four record validators succeed. No installation or activated host interception is claimed. |
| Package and runtime | Actual universal package verified; ARM64 runtime smoke and screenshot inspected. Structured observations cover setup/current view, panes and terminal spawn/termination. DMG SHA256 `3316891dafcca5c6d26298d5770ca171caccca03bc186e028ca650fb2199582b`, 253971490 bytes. Development ad-hoc trust; no notarization/public release claim. |
| Source/build identity | All 150 surviving changed files match Git blob IDs in the 307-row inventory. All 66 recorded comparisons (22 protocol JavaScript files across actual app.asar and built Codex/Claude packages) independently match pinned source hashes. Build attribution names product `af3fad7`; review metadata follows it. |

The broad CLI and focused results are current-product evidence. Python reuse remains applicable because those helpers are unchanged, while current CLI tests exercise trusted-helper binding and its integration. Counts are corroboration, not the reason for the semantic verdict. The final pin contains the repaired source inspected during preliminary probes; current evidence closes the verification boundary.

Independent command from this pinned repository:

```sh
node --test --test-name-pattern='root session history|retained session-contaminated|public resume preserves unsupported|activation successor schema|case alias' cli/test/current-core.test.js
```

## Explicit limits

Native interception is `configured-hook-unverified-host`: handler/subprocess contracts and protected adapters are tested; actual installed-host activation and arbitrary shell interception are not established. This is the honest coverage allowed by C6/R17. The live execution is OpenAI/Codex, not an actual Claude-provider run. The package includes both architectures, but runtime execution is ARM64 only. Development ad-hoc packaging does not establish signing/notarization, installation, publication or deployment. Current hosted CI is unavailable while the PR remains closed; older hosted results are not current proof. These are not invented pre-merge installation or release prerequisites.

An empty actual pattern scope offers no substantive project-rule coverage; nonempty fixtures establish the enforcement behavior. Local mirrored records provide exact-copy recovery redundancy, not external backup or detection after simultaneous loss of both matching terminal suffixes. The hosted merge API lacks an atomic target-branch compare-and-swap: target/head rereads and local state guards constrain the documented remote race. Fixtures establish mechanical behavior; semantic quality and adequate delta coverage still require independent assessment under approved criteria.

No source implementation or earlier reports were changed, no network or hosted merge/release action was taken, and no core passage event was recorded by this reviewer. The independently running native Judge remains a separate obligation; these reports do not replace it.
