# Independent workflow judgment: FAIL

Evaluated pinned head `5724e5507b007c8c0558ece6bda4c95915016ad1` against base `643e3ea2b03f19b66595219c4f8df934596aa436`, using the complete approved specification and design. **9 criteria PASS; 12 FAIL.**

The inventory, requirements, design, full Verification report, screenshot, patch index, and all patch chunks matched their supplied hashes. The inventory contains 301 changes: 94 modified, 157 deleted, and 50 added files, with no renames or binary changes. Relevant added protocol patch sections also match the assembled pinned source.

## Formal Verification

The complete bound Verification report records 240 CLI passes, 172 desktop passes, 62 Python passes, successful portability/package/native-contract checks, and local Electron smoke. I inspected the bound `runtime.png`; it shows the local desktop at a small viewport. These are reported formal results, not suites rerun during this review.

The live-provider test was explicitly skipped. The report references separate native evaluation, but supplies no bound evaluator execution receipt. Hook tests exercise handler subprocesses; the implementation honestly states that live plugin activation is not established.

Additional checks performed here were read-only: evidence integrity checks, pure-function probes, mocked milestone predicates, and an injected provider response. No repository changes or network operations occurred.

## Criterion results

| Criterion | Result | Basis |
|---|---|---|
| R1 Planning and milestone authority | FAIL | Missing retained planning closure does not block implementation; completion can use superseded requirements. |
| R2 Model-led execution | PASS | Readiness launches no evaluator; explicit execution preserves genuine input requirements without a round counter. |
| R3 Canonical layouts | PASS | Shared local storage and fixtures support repository-local and parent-owned tracked, ignored, and untracked records. |
| R4 Exact source and requirements | FAIL | Broad exclusions omit possible executable source; completion does not bind proof to current commitments. |
| R5 Containment and isolation | FAIL | Existing feature homes accept symlinked ancestors. |
| R6 Publication and retention | FAIL | Exclusive publication is implemented, but missing retained planning evidence can still permit milestone passage. |
| R7 Local finalization | FAIL | Path exemptions can hide source drift despite local packet validation. |
| R8 Independent grouped verdicts | FAIL | Separate verdict and receipt checks exist, but required real local evaluator evidence is absent. |
| R9 Complete obligation inventory | PASS | Required gates, roles, separate verdicts, and actual mechanical receipts remain represented. |
| R10 Equivalent-input reuse | PASS | Content-equivalent proof reuses original result references and provenance. |
| R11 Relevant change and uncertainty | FAIL | Exempt source, nested dependencies, and amended requirements can escape relevant freshness checks. |
| R12 Targeted delta coverage | FAIL | Base-only changes produce no changed-path obligation; prior base source is not exported. |
| R13 Bounded history and dispositions | PASS | Claims are labeled; affected dispositions and independently justified closure carry-forward are supported. |
| R14 New discovery and blocking criteria | PASS | New supported defects remain reportable; blocking findings require approved criteria and source evidence. |
| R15 One scoped human decision | PASS | Named decisions and express continuation actions preserve provenance and reconcile committed retries. |
| R16 Honest exceptions and integration | FAIL | Equivalent-content candidates lose waivers; ordinary CLI status hides exceptions; stale completion remains possible. |
| R17 Enforcement coverage | FAIL | PR target identity is not revalidated after waiting for hosted checks. |
| R18 Coherent consumers and low ceremony | FAIL | Ordinary CLI exception reporting differs from desktop; shipped guidance advertises removed operations. |
| R19 Direct cutover | PASS | Active distribution uses the current protocol and rejects obsolete mutations without migration or benchmark gates. |
| R20 Resume without false history | PASS | Current runs and successor activations preserve historical files without replaying old passage. |
| R21 Practical observations | FAIL | Available provider usage is discarded and token/cost metrics are always recorded as unknown. |

## Supported findings

**F1 — Completion can certify superseded requirements.** Amendment preserves the old candidate and acceptance decisions (`plugin-src/shared/resources/protocol/current/core.js:26`). After new implementation authority is established, observing integration of that retained candidate can restore INTEGRATED. Completion checks current authorization separately, then validates the old candidate with `live=false` (`core.js:287`), without comparing its requirements or authorization subject to current commitments. A read-only predicate probe admitted this combination with zero live requirement reads. This violates R1, R4, R11, and R16.

**F2 — Missing retained planning evidence does not block implementation.** `core.js:282` returns before validating `state.decisions` closure. Missing retained interview or approval-document bytes therefore need not block this milestone when live document fingerprints and the spec-validation proof remain available. A mocked closure failure was never invoked and eligibility remained true. This violates R1 and R6.

**F3 — Bookkeeping exclusions can hide reachable source.** `plugin-src/shared/resources/protocol/current/evidence.js:12` excludes every `docs/issues/` path. Capture removes those files, and cleanliness checks permit their modification. An application importing an executable from that directory can run altered bytes absent from its reviewed snapshot. The exclusion is based on location, not validated evidence inventory. This violates R4, R7, and R11.

**F4 — Existing homes accept symlinked ancestors.** `plugin-src/shared/resources/protocol/current/store.js:89` checks only the final home component and then resolves it. Substituting a symlink for an ancestor such as `docs/issues` can redirect an existing feature record outside the trusted workspace. Ancestor checks in `current/adapter.js:15` run only for start/resume operations. This violates R5.

**F5 — Required native evaluator execution evidence is absent.** The grouped-verdict tests use an injected evaluator; the actual evaluator test at `cli/test/current-core.test.js:251` was skipped. The full Verification report does not bind the separately mentioned native execution receipt, and the attachment inventory contains only the desktop screenshot. R8's explicit evidence condition is unmet.

**F6 — Nested installed dependencies escape default applicability.** `current/environment.js:48` automatically fingerprints only repository-root `node_modules` and `.venv`. A check targeting a nested package, such as `npm --prefix cli test`, can consume changed `cli/node_modules` bytes while its stored environment fingerprint remains equivalent unless that path was manually declared. Unknown runtime dependency coverage is therefore reusable. This violates R11.

**F7 — Delta coverage omits changes to the review base.** `current/execution.js:40` compares head inventories only. A base-only mutation returned an empty changed-path list, so PASS validation at line 213 imposes no corresponding path coverage. The prior-source export at line 76 also contains prior head files without prior base files. The delta can consequently omit the changed review range. This violates R12.

**F8 — Bookkeeping-equivalent candidates lose quality exceptions.** Candidate hashes include source commit identifiers, while waiver applicability matches only the exact hash (`current/contracts.js:90`, `current/core.js:303`). An empty commit changes that hash despite equivalent assessed content, unnecessarily requiring renewed quality authority. This violates R16's bookkeeping-equivalence requirement.

**F9 — Ordinary CLI status conceals exceptions.** `cli/src/commands/current.js:22` prints readiness and missing obligations without displaying `outcomes.exception`. A waived milestone can appear simply ready, while desktop explicitly displays exception reasons and consequences. JSON inspection remains available, but the ordinary report omits required risk visibility. This violates R16 and R18.

**F10 — Merge target can drift during hosted-check waiting.** `current/actions.js:64` reads PR identity before waiting at line 70. The subsequent checks validate gate eligibility and the originally named branch SHA, without rereading the PR target. The merge command at line 75 matches only the head commit. A PR retargeted during the wait can therefore merge outside the authorized target before later observation fails. This violates R17.

**F11 — Shipped CLI guidance advertises retired operations.** `cli/README.md:179` directs users to `advisory declare-readiness`, `proceed`, and `check`, including readiness-triggered discovery. The registered command tree no longer contains those operations, and current readiness deliberately launches nothing. This violates R18 and creates a documentation contradiction.

**F12 — Available execution usage is discarded.** `protocol/local-agent-adapters.js:156` keeps only structured output and context identity from the Claude envelope; the Codex parser likewise extracts only context identity. `current/execution.js:422` then records token and cost metrics as null. A read-only injected response carrying token counts and cost retained neither. This violates R21.

## Explicit checks

- **Scope: PASS.** The changed core, helpers, CLI, plugins, desktop consumers, projections, tests, and documentation remain within approved implementation scope.
- **Gaps: FAIL.** Required local evaluator proof is absent, and the supported failure scenarios above are not established by the supplied passing suites.
- **Contradictions: FAIL.** Current-proof and exception-visibility requirements conflict with reachable behavior, and shipped advisory guidance conflicts with the current command surface.

The passing Verification report does not resolve these reachable paths or the missing required evaluator evidence.