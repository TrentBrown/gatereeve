# Plan - tb-synthetic-slice-review

**Feature:** `tb-synthetic-slice-review`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-09-28

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Preserve the existing PR path as an unchanged compatibility lane while adding a
discriminated synthetic lane. Start at repository configuration and shared
context contracts, then implement deterministic Git mechanics, then generalize
protocol/evidence presentation, and finally route feature-final work through the
real release PR. Test each layer with local repositories and fixtures before
running native-package and portable acceptance.

## Steps

- **P1. Extend workspace configuration and resolver parity.** Add optional
  `sliceBoundaryMode` and `releaseBranch` repository fields with compatible
  defaults in the JavaScript and Python resolvers, templates, setup/doctor
  surfaces where applicable, and parity tests. **Advances:** R1, R7, R8.
- **P2. Introduce a transport-neutral boundary context.** Extract common pinned
  repository/base/head/merge-base/source/feature-base behavior from PR context,
  keep schema-version-1 PR readers, and update gate, packet, feature-final, and
  agent-workflow consumers to use the shared contract. **Advances:** R2, R6,
  R7, R8.
- **P3. Implement deterministic synthetic review mechanics.** Add a helper that
  pins candidate source, validates evidence-only post-evaluation changes,
  constructs the single-parent exact-tree commit, publishes a deterministic
  review branch, captures review identity/comments, checks currentness, and
  promotes only the exact reviewed commit with a non-force fast-forward.
  **Advances:** R3, R4, R5, R6.
- **P4. Generalize lifecycle and presentation semantics.** Update the default
  model, projection compatibility, snapshots, observer actions, CLI help,
  Desktop contracts, tracker/evidence vocabulary, and protocol tests so new
  features expose a review boundary while historical `PR_BOUNDARY` locks remain
  valid. **Advances:** R5, R6, R8.
- **P5. Preserve the final PR boundary.** Route a distinct integration/release
  configuration to an ordinary feature-final PR, reject synthetic transport for
  final scope, and update sequential acceptance and complete-feature tests.
  **Advances:** R7, R8.
- **P6. Update policy, skills, templates, and packaging.** Document the PR-first
  default, the explicit QualityCode exception, synthetic preconditions and
  failure behavior, exact commands, inventory implications, and native parity.
  **Advances:** R1, R6, R7, R8.
- **P7. Verify the complete change.** Run focused JS/Python suites, existing PR
  compatibility suites, plugin validate/lint/native checks, dual package build,
  and portable acceptance; evaluate AC1-AC8 and produce the completion report.
  **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.

## Verification

- Focused Python tests cover configuration, generalized contexts, packets,
  feature-final routing, and local-bare-remote synthetic Git behavior.
- Focused Node tests cover configuration parity, protocol lifecycle,
  snapshots/observer actions, CLI contracts, Desktop projections, and historical
  model compatibility.
- Existing PR-mode tests must pass unchanged or with compatibility-only fixture
  adjustments.
- Final step: run full rubric evaluation and produce the completion report.
