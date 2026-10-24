**Verdict: FAIL.** The frozen candidate has four supported implementation defects and one unresolved enforcement-evidence gap. This is an independent local evaluation, **not formal installed-protocol passage**.

Reviewed identity: `sha256:6e73c3233d045ea869e9f46bf3c29fa1b3d7c372bbedaa430685e903e0c6f4b4`.

All references below are within [the frozen review packet](/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gatereeve-implementation-review-4NcMPt). `current/` means `source/plugin-src/shared/resources/protocol/current/`; `tests` means `source/cli/test/current-core.test.js`.

**Material findings**

1. **[P2] Prior-review export can exceed the current repository scope — R5/R8.**  
   `current/execution.js:70–78` exports every repository from each referenced prior candidate. History admission at `265–269` checks that the report belongs to the run but does not constrain its repositories to the current selection. Consequently, an app-only review referencing an earlier app-plus-service review receives the service’s complete historical source.

   A read-only probe of the exact `reviewerView` function, using an in-memory filesystem substitute, confirmed that an app-only candidate produced both `prior/…/app/app.js` and `prior/…/service/private-service.js`.

   This contradicts `requirements/spec.md:102–105`, which confines multi-repository exposure to declared participating scope. Validate history and delta repository scope before execution; reject incompatible references or construct a bounded permitted history view. Add a regression that narrows a previously combined review.

2. **[P2] Affected closed findings require no renewed disposition — R13.**  
   `current/execution.js:249–262` automatically carries unresolved findings but deletes resolved/unsupported findings from selection. It never compares their affected scope with the new candidate. Even when callers explicitly provide closed findings, `validateVerdict` requires dispositions only for open findings or supplied claims (`187–194`).

   A read-only probe of that exact validation function supplied a previously blocking finding, its later resolution, and a new change to the same finding path. A PASS verdict with **no dispositions** was accepted.

   This violates `requirements/spec.md:126–131`. Derive affected closures conservatively from retained source/interaction scope, include them automatically, and require an independent disposition. Carry unaffected closures through an explicit applicability justification without making users resubmit every historical ID.

3. **[P2] Fresh evidence cannot recover a missing historical artifact — R6.**  
   `current/core.js:275` validates the closure of **all historical results** before acceptance, merge, or completion. Packet generation similarly closes all results (`current/execution.js:432–434`), and retention closes all events (`436–438`). Therefore, losing an old result’s output permanently blocks passage even after a complete fresh result replaces its current evidentiary role. Losing an old result JSON is worse: the unconditional historical reads at `execution.js:252–253` can prevent new executions.

   The supplied deletion test (`tests:306–309`) establishes blocking after loss, but does not exercise recovery through fresh proof. `requirements/spec.md:159–163` explicitly permits exact restoration **or fresh evidence**.

   Preserve the historical loss visibly while allowing independently refreshed proof to satisfy current obligations under an explicit recovery record. Do not fabricate or overwrite the missing historical result.

4. **[P2] Provider failures expose raw provider output in ordinary result summaries — R18.**  
   `source/plugin-src/shared/resources/protocol/local-agent-adapters.js:59–67` includes full provider stderr/stdout in an exception. `current/execution.js:380–382` stores that exception message directly as the gate summary; `current/core.js:300` and desktop `source/apps/desktop/renderer/current-view.js:59` expose it.

   A read-only subprocess probe confirmed a provider stderr sentinel was returned verbatim in the exception. This is a direct raw-context exposure path, rather than evidence that a real secret was leaked.

   `requirements/spec.md` C6 requires useful causes/remedies without raw provider context. Return bounded structured error categories and sanitized summaries. Retain any necessary diagnostics separately with appropriate handling, rather than presenting them as ordinary gate explanations.

**Enforcement evidence gap**

`verification/host-enforcement.md:5–14` honestly establishes that SessionStart is guidance and action interception is not configured. It does **not** establish which action interception capabilities the supported host versions provide, or demonstrate a supported action hook invoking the core.

The protected merge adapter itself has useful source and fixture evidence (`current/actions.js:46–89`; `tests:383–426`). However, “not configured” does not substantiate the specification’s exception for a host where interception is unavailable. R17 remains unproven until the capability determination and applicable hook smoke are supplied. This is an evidence gap; I am not claiming an observed host-hook bypass.

**Rubric scoring**

PASS below means the row is supported within the stated local pre-merge evidence scope. FAIL identifies a defect or explicitly marked evidence gap; failures are not inferred merely from the absence of production deployment.

| Row | Result | Evidence and assessment |
|---|---|---|
| R1 — Planning and milestone authority | PASS | `current/core.js:117–188,260–322` checks approved commitments, specification validation, scoped authority and milestone proof. Tests `50–58,116–126,283–309,413–425` exercise refusal and integration/completion. Corrective execution remains separately available. |
| R2 — Model-led execution | PASS | Readiness only records an event (`core.js:183–188`); execution is explicit (`execution.js:210–241`). No round counter or cross-gate scheduling graph is imposed. Tests `61–68` repeat readiness seven times without review launch. |
| R3 — Canonical layouts | PASS | `current/adapter.js:11–26` uses the canonical resolver; evidence storage does not require Git ownership. Tests `71–78,235–248,283–309,480–515,529–537` cover repository-local, shared parent, tracked/ignored parent records, and combined repositories. |
| R4 — Exact source and requirements | PASS | `current/evidence.js:17–61,83–129` retains exact Git blobs and raw requirements with scope and authority references. `core.js:223–258` checks current applicability. Tests cover changed requirements/source, combined repositories and identical-content commits. Export containment fails separately under R5. |
| R5 — Containment and isolation | **FAIL** | Path traversal/symlink protections exist (`current/store.js:10–49`), but prior source export exceeds current repository scope. Finding 1. |
| R6 — Publication and retention | **FAIL** | Exclusive publication and hash verification are implemented (`store.js:65–108,223–242`). Missing historical artifacts cannot recover through fresh proof as permitted by C4. Finding 3. |
| R7 — Local finalization | PASS | Packet inventory and local reference closure are core-derived (`execution.js:428–438`); application cleanliness remains enforced (`evidence.js:73–95`). Test `283–309` completes the intact-evidence path without evidence commits. The historical-loss recovery defect is scored under R6. |
| R8 — Independent grouped verdicts | **FAIL** | Separate verdict validation and receipt qualification are implemented (`execution.js:91–128,343–353`; tests `180–200`). Actual fresh Claude execution is retained in `verification/live-evaluator.json`. However, the row also requires input isolation, which Finding 1 violates. |
| R9 — Complete obligation inventory | PASS | `current/contracts.js:40–54` retains context, reconciliation, Verification, spec, pattern, independent Judge, code review, triage, explanation, packet, finalization, release, retention and optional whiteboard. Runner proof comes from actual subprocess receipts (`execution.js:130–161`). |
| R10 — Equivalent-input reuse | PASS | Content identity excludes commit IDs while retaining relevant source content (`evidence.js:108–112`); reuse preserves original references (`execution.js:299–318`). Tests `165–178,517–526` establish reuse and original provenance. |
| R11 — Relevant changes and uncertainty | PASS | Source/requirements, consumed proof, support documents, dependency inputs, declared environment and external validity are checked (`core.js:239–256`; `current/environment.js:36–54`). Tests `223–232,372–380,446–459,480–500,578–589` cover important mutations. Environment completeness remains dependent on declared assumptions. |
| R12 — Targeted delta coverage | PASS | Prior qualifying proof, unchanged requirements/criteria, changed paths, interactions and coverage are required (`execution.js:203–205,273–283`; `core.js:249–254`). Tests `202–220,501–514` include combined-repository coverage rejection. Affected finding disposition remains defective under R13. |
| R13 — Bounded history and dispositions | **FAIL** | Claims and history are bounded and separated, but affected closures can be omitted or accepted without disposition. Finding 2. |
| R14 — New discovery and blocking criteria | PASS | Instructions permit new instances and distinguish advice; blocking findings require approved criteria or the gate rule (`execution.js:44–50,171–176`). Test `218–220` retains a new blocking result. |
| R15 — One scoped human decision | PASS | `current/contracts.js:62–87` records actual available provenance and named continuations; `core.js:134–161,338–349` handles amendments and repeat reconciliation. Tests `312–340` preserve old/new commitments and avoid duplicate passage. |
| R16 — Honest exceptions and integration | PASS | Waivers remain separate from verdicts and are candidate-scoped (`contracts.js:89–93`; `core.js:297–310`). Integration is independently observed (`actions.js:93–113`). Tests `116–126,342–350,462–477` preserve failed outcomes and reject inferred authority. |
| R17 — Enforcement coverage | **FAIL — evidence gap** | Protected adapter checks and branch-direction fixtures are supported. The supplied matrix establishes configured behavior, but does not establish supported host interception capability or exercise an applicable action hook. |
| R18 — Coherent consumers and low ceremony | **FAIL** | CLI, native adapter and desktop use the current core; incidental ordering controls are removed. Provider errors nevertheless expose raw output through summaries. Finding 4. |
| R19 — Direct cutover | PASS | `source/plugin-src/shared/resources/protocol/index.js:1–12` exports the current interface; the CLI current command set and native adapter route to it. Old merge entry is explicitly retired in `source/plugin-src/shared/resources/scripts/pr_lifecycle.py:159`. No pilot or benchmark admission requirement was found. |
| R20 — Resume without false history | PASS | `core.js:72–110` establishes current runs without interpreting old journals; `store.js:135–185` durably establishes activation successors. Tests `93–101,326–340,560–576` cover preserved history, repeated entry and damaged/unsupported runs. |
| R21 — Practical observations | PASS | Receipts retain timing, identity and outcomes, with unavailable token/cost metrics represented as null (`execution.js:384–389`). `verification/real-project-observation.md:3–14` provides the requested observation recipe without adding an adoption gate. |

**Evidence and limitations**

The supplied completed evidence reports:

- CLI: 229 tests, 228 passed, one optional live-provider skip, zero failures.
- Desktop: 172 passed, zero failures.
- Python: 62 passed.
- Separate live evaluator and multi-repository delta checks passed.
- The supplied Electron runtime JSON reports success.

I inspected those logs and source; I did not independently rerun the full suites, install the candidate, access the network, or modify files. My three additional probes were read-only checks of the frozen code, with in-memory substitutes where filesystem writes would otherwise occur.

The scope of the changes is consistent with the approved direct-cutover design. Removing obsolete orchestration tests is not itself scope creep, but the passing replacements do not cover the defects above. Source-commit metadata referring to the starting HEAD was not treated as the uncommitted candidate’s release identity.
