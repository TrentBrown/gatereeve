# Plan - tb-release-conductor

**Feature:** `tb-release-conductor`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-09-01

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the approved architecture and authority boundaries.
- `interview.md` supplies settled operator, recovery, cutover, and CI choices.

## Strategy

Build the conductor from testable pure contracts outward. First remove the
known runtime/dependency warnings without changing CLI behavior. Then implement
an injected state-chain and resume engine that can be proven locally against
fixture GitHub evidence. Convert the working phase workflows to reusable
components and make their provenance explicit before adding the top-level
orchestrator. Wire the primary and Cask halves only after state/recovery behavior
is covered. Finish by deleting alternate publishers and dispatches, updating
the runbook, and running a complete credential-free simulation.

Deliver this as one feature-final slice. The clean cutover is intentionally
atomic: merging reusable-only phases without the conductor, or the conductor
while an alternate publisher remains active, would leave an unsafe or unusable
production topology. Commits may remain reviewable by layer within the branch.

The source branch is `tb-release-conductor`, created from `origin/main` at
`4744edf06e40c7ba9575855f9aa80c8cc612bbbc`. No development branch is a source
or target.

## Steps

- **P1. Modernize the CI and CLI runtime foundation.** Replace official action
  references with current Node-24 action majors (`checkout@v7`,
  `setup-node@v7`, `upload-artifact@v7`, `download-artifact@v8`) and run
  GateReeve jobs on Node 24 LTS. Replace the incompatible `qp-cli-core@1.7.1`
  dependency with direct `commander` usage plus a repository-local help-tree
  helper that preserves the tested public CLI. Verify lockfiles, help output,
  package/runtime tests, hidden artifact inputs, and cache behavior.
  **Advances:** R8.
- **P2. Implement the conductor state, projection, and discovery core.** Add a
  versioned release-state schema, canonical serialization/digest chain,
  transition guards for the approved lifecycle, state/status rendering, and an
  injected GitHub evidence reader. Make tag-only discovery validate artifact
  identity, predecessor uniqueness, source/tag binding, expiry, referenced
  phase evidence, and conflicting-chain failures. Cover every transition and
  malformed/divergent/expired fixture without network or credentials.
  **Advances:** R2, R4, R5, R6.
- **P3. Convert phase workflows into provenance-bearing reusable units.** Add
  `workflow_call` contracts, outputs, and least-privilege secret boundaries to
  preparation, trust recovery, primary finalization/publication, Cask
  finalization/publication, and smoke. Remove their manual dispatch contracts.
  Adapt current event/path/run-ID validators to accept only conductor-bound
  reusable provenance and same-run/cross-run artifact identities. Preserve
  exact bytes, hidden files, environment deployments, retention, concurrency,
  always-uploaded failure evidence, and the existing phase implementations.
  **Advances:** R1, R2, R3, R5, R6.
- **P4. Build conductor `start` through primary publication.** Add the sole
  operator-facing workflow with RC/source/version preflight, state initialization,
  protected trust, automatic finalization and rehearsal, primary publication
  approval, stage artifact emission, summaries, and
  `WAITING_FOR_DIRECT_INSTALL`. Bind every reusable output before advancing and
  ensure no rehearsal receives credentials or mutation authority.
  **Advances:** R1, R2, R3, R4.
- **P5. Build tag-only resume, trust recovery, and the linked Cask chain.** Use
  P2 discovery to route the unique latest state to bounded trust recovery,
  idempotent primary recovery, direct-install attestation, Cask finalization,
  automatic Cask rehearsal, protected publication, and four native/public
  smoke results. Capture actor/time automatically and emit `COMPLETE` only
  after exact linked evidence validates. Add failure injection at every legal
  resume point and all prohibited conflict cases.
  **Advances:** R3, R4, R5, R6.
- **P6. Complete the clean cutover and metadata-only CI path.** Remove or
  disable the legacy tag-triggered Plugin Release publisher. Make full Plugin
  CI ignore only a sole `workflow-site/releases/desktop.json` change while
  strengthening publisher checks for deterministic branch/base/path/bytes/
  digest transport. Keep full CI for mixed changes and preserve repository
  contributor policy and token scope. Update `RELEASING.md`, Apple setup
  guidance, and developer tests so only conductor `start`/`resume` are
  documented production operations.
  **Advances:** R1, R7, R8.
- **P7. Verify the complete feature-final cutover.** Run CLI and release suites,
  workflow/static contract tests, spec/doc linters, metadata-path fixtures, and
  a credential-free conductor simulation covering the happy path, every resume
  point, approval isolation, recovery/idempotence, and invalid chains. Inspect
  the final workflow topology and dependency tree for alternate entry points,
  legacy Node action runtimes, incompatible engines, or leaked authority.
  Prepare a post-merge operational checklist for real protected deployments,
  Apple trust, public publication, and public Cask evidence without fabricating
  those external results pre-merge.
  **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.

## Proposed delivery boundary

One governed feature-final slice covers P1-P7 on `tb-release-conductor`. The
boundary is proposed planning, not implementation authorization. It is kept
atomic because the operator-facing and internal workflow trigger topology must
change together.

## Verification

- Run focused tests after each plan step and the complete `npm test --prefix
  cli` plus applicable Desktop/release contract suites before review.
- Run `ci/portable-acceptance.sh` and the repository document/spec validators.
- Parse every workflow and assert trigger, permission, environment, action
  major, artifact, and reusable input/output contracts.
- Exercise the generated metadata PR validator with exact, extra-path,
  altered-byte, changed-base, and changed-digest fixtures.
- Exercise state discovery with missing, expired, divergent, malformed,
  wrong-source, wrong-tag, retry, partial publication, and completed histories.
- **Final step:** run full rubric evaluation and produce the feature completion
  report, with real protected/public evidence retained as explicit post-merge
  operational acceptance rather than pre-merge proof.
