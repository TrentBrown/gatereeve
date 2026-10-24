# Formal code review — PR84 / formal-pr84-11

**Verdict: PASS. No material actionable findings.**

## Candidate and assessment boundary

Base `643e3ea2b03f19b66595219c4f8df934596aa436`; evaluated head `9fa285e2b42b092bbd0220e05161c9ed3bce7b0e`; substantive product `f2a2041059272c0b0ba648c2e1bdc92899ed4370`.

Source was inspected only in `/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-pinned-0PWKI0/repository`, manifest `/tmp/gr-review-view-11.json`, digest `sha256:a537aaff0f171e3e3cb8fbcfdc6efad9027fd5a34b0ed8d4ee5c150e759c7f4d`. Authoritative output contexts: `/tmp/gr-context11-codeReview.json` and `/tmp/gr-context11-specEvaluation.json`. The assessment covers the cumulative feature change, all 21 rubric rows and all eight acceptance criteria, not merely the latest repair delta.

Approved requirements are `docs/issues/tb-multirepo-review-input/spec.md` (SHA256 `2b2f80e655e4a038ddfa77f88dd764a32a2ce8a41ae8678822a3d2f346e5446e`) and `design.md` (SHA256 `7639b18419a60766a19aad4b3b90b5c92aa21120a03ea1518d8d3a7232698fd2`). These hashes match the inspected bytes. In source references below, `P/` means `plugin-src/shared/resources/protocol/`; line numbers refer to this immutable candidate.

Prior observations were leads, not acceptance authority. The earlier formal10 PASS reports and the actual Judge FAIL remain unchanged. This assessment examines the repaired current source and its interactions; it does not reinterpret the earlier candidate as passing.
## Current code assessment

I examined the cumulative current protocol, canonical evidence capture, evaluator contracts and history, reuse/delta admission, human authority and exceptions, persistence/recovery, protected actions, current consumers and distributed build identity. No supported current defect requiring a priority/file/line finding was established. This conclusion is limited to the inspected and exercised scope, not a claim of absence of all possible defects.

The former formal10 defects and adjacent interactions were specifically checked:

- **Complete repository capture:** `P/current/evidence.js:52` establishes canonical Git working-tree-root equality. Capture, clean checks and live/historical candidate admission call that guard (`:59`, `:118`, `:181`); tree enumeration also uses `--full-tree`. A configured subfolder cannot supply partial source as a complete repository, while valid linked worktrees remain accepted. The enclosing-file regression checks that relevant changes enter captured content and delta paths. The configured resolver remains usable without a subprocess; source authority is checked before capture/admission and therefore before protected merge execution.
- **Relevant prior failures and coverage:** `P/current/execution.js:288` selects latest context by gate, repository scope and relevant criterion, and retains substantive negative context across later transport failures until a later same-scope PASS starts after it. Criterion-only failures and required coverage limitations no longer depend on a named finding. Cross-gate context informs review without transferring another gate's verdict or closure authority. Broader relevant history requires matching declared repository scope instead of leaking or silently omitting it. Unrelated criteria remain excluded.
- **Reuse and admission:** `P/current/core.js:333` derives substantive barriers across review roles, including scope-bound coverage-only failures whose code criteria array is empty. Current PASS must start after the relevant negative's finished sequence. Explicit consumed proof cannot bypass this check. The historical-ancestry mode remains separate for delta support and applicable closures. The focused controls establish that new negatives trigger fresh review while equivalent proof after its own review is reused; transport-only UNAVAILABLE does not itself revoke valid proof.
- **Unsupported activation copies:** `P/current/store.js:157` admits identical or surviving unsupported copies only as opaque provenance. The earlier mirrored byte-conflict check remains; `active()` at `:184` still refuses unsupported authority. Public resume preserves original bytes, establishes a durable current replacement and inherits no approval. All four copy cases have actual public-operation coverage.

I also rechecked surrounding mechanisms rather than limiting review to those repairs: origin-bound failed spec publication and narrow pause retry (`P/current/core.js:132`); recorded execution provenance and pending-outcome barriers (`:299`, `:311`); live/transitive exception risk (`:419`); immutable event/activation mirroring (`P/current/store.js:146`, `:265`); durable outcome-ready publication and reconciliation (`P/current/execution.js:500`, `P/current/core.js:563`); retained command receipts and coverage (`P/current/execution.js:157`, `P/current/core.js:278`); independent capability/envelope validation (`P/agent-workflow.js:46`, `:56`, `:150`); trusted Python closure/runtime binding (`P/python-guards.js:67`, `:80`, `:86`); and exact protected action/integration checks (`P/current/actions.js:21`, `:51`, `:107`).

The complete rubric/acceptance mapping is in the accompanying spec report. Prior defects are resolved in this candidate; no scope expansion, new release prerequisite or unsupported blocking concern is introduced here.

## Verification examined

| Evidence | Actual execution and applicability |
| --- | --- |
| Full CLI, `cli-tests.log` | 332 PASS, 1 intentional opt-in live-provider SKIP, 333 total, 0 FAIL on substantive product `f2a2041`. Includes the actual more-than-64-record history exercise and previous authority, persistence, concurrency, reuse and isolation regressions. This is a completed current-product suite, not the superseded partial run. |
| Focused final controls, `focused-regressions.log` | 11 PASS, 0 SKIP. Independently rerun against this immutable pin: 11 PASS, 0 FAIL, 0 SKIP. Covers configured subdirectory rejection/linked worktree acceptance/enclosing-file delta, public resume with primary-only/witness-only/equal/conflicting unsupported copies, criterion/coverage/cross-gate negatives, same finding IDs across gates, transport-only unavailability and R1 history after R2 assessment. |
| Desktop, `desktop-tests.log` | 172 PASS on current product, including staged canonical protocol and current consumer contracts. |
| Python, `python-tests.log` | 58 PASS reused from unchanged Python helper implementation. This is explicitly not a newly run final-head Python suite. |
| Live provider, `live-evaluator.log/json`, `live-roundtrip.json` | Actual fresh OpenAI/Codex fixture: 1 PASS, 0 SKIP. Bundled Codex `0.163.0-alpha.11.2`, `gpt-6.1-sol`, high reasoning, fresh context `01a16c3a-fdea-70f2-93bc-17943be5e890`, inherited turns 0. I independently ran the public stage-result validator on the retained envelope and checked its canonical output digest: `sha256:5e3b14e2db93d478bc1d1dafc636b2f83e8df0e6849a68405384222d48abf3eb`. It proves native adapter/receipt execution on the constant-export fixture, not PR84's substantive quality. |
| Plugin and record checks | Retained lint, plugin build and native validation succeed; all four record validators pass. No installation or activated host interception is claimed. |
| Package and runtime | Actual universal package verified; ARM64 runtime smoke and screenshot inspected. Structured results exercise setup, current workflow view, panes and terminal spawn/termination. DMG SHA256 `32078fa40e3ebb2a679b530e8741be69cfeeb11317a6c7fd5ca0ff83565a3910`, 253970974 bytes. Development ad-hoc trust; no notarization/public release claim. |
| Source and build identity | All 150 surviving changed files match the Git blob IDs in the 307-row inventory. All 66 recorded comparisons (22 protocol JavaScript files across actual app.asar and built Codex/Claude packages) independently match pinned source hashes. Build attribution names substantive product `f2a2041`; only review metadata follows it. |

The current full CLI run and focused controls cover the final product, resolving the earlier broad-suite attribution limitation. Reusing the Python result is appropriate because the helper implementation is unchanged, while current CLI tests exercise trusted-helper binding and its interactions. Counts alone do not establish the verdict: source inspection and negative cases support the criterion assessments.

Independent command from the pinned repository:

```sh
node --test --test-name-pattern='source admission rejects configured|public resume preserves unsupported|default reviewer context|cross-gate same finding IDs|transport unavailability alone|review context keeps an R1' cli/test/current-core.test.js
```

## Explicit limits

Native interception is `configured-hook-unverified-host`: handler/subprocess contracts and protected adapters are tested; actual installed-host activation and arbitrary shell interception are not established. This is the honest coverage allowed by C6/R17. The live execution is OpenAI/Codex, not an actual Claude-provider run. The package includes both architectures, but runtime execution is ARM64 only. Development ad-hoc packaging does not establish signing/notarization, installation, publication or deployment. Current hosted CI is unavailable while the PR remains closed; older hosted results are not current proof. These are not invented pre-merge installation or release prerequisites.

An empty actual pattern scope offers no substantive project-rule coverage; nonempty fixtures establish the enforcement behavior. Local mirrored records provide exact-copy recovery redundancy, not external backup or detection after simultaneous loss of both matching terminal suffixes. The hosted merge API lacks an atomic target-branch compare-and-swap: target/head rereads and local state guards constrain the documented remote race. Fixtures establish mechanical behavior; semantic quality and adequate delta coverage still require independent assessment under approved criteria.

No source implementation or earlier reports were changed, no network or hosted merge/release action was taken, and no core passage event was recorded by this reviewer. The independently running native Judge remains a separate obligation; these reports do not replace it.
