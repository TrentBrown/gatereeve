# Spec - tb-synthetic-slice-review

**Feature:** `tb-synthetic-slice-review`
**Created:** 2026-09-28

## Summary

GateReeve must support an opt-in synthetic-commit boundary for slice delivery
into an integration branch while preserving pull requests as the default and as
the mandatory feature-final review mechanism from integration to release.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** Backward-compatible configuration: a repository that omits the new
  settings resolves to `sliceBoundaryMode: pull-request` and a release branch
  equal to its integration branch. A repository may explicitly select
  `synthetic-commit` and a distinct release branch. Unknown modes and invalid
  branch names fail context resolution.
- **AC2.** Transport-neutral pinned context: all boundary gates can consume one
  authoritative context exposing the same repository, base, head, merge-base,
  evaluated-source, feature-base, and changed-file inputs regardless of whether
  its review transport is a pull request or synthetic commit. Existing version-1
  PR contexts and packets remain readable.
- **AC3.** Exact synthetic review object: for synthetic mode, the tooling creates
  a single-parent commit whose parent is the pinned remote integration SHA and
  whose tree is the finalized slice tree, publishes a deterministic temporary
  review ref, and reports the exact commit identity and GitHub commit URL.
- **AC4.** Fail-closed review publication: synthetic review publication refuses
  a dirty or detached checkout, an integration branch that moved from the
  pinned base, an invalid or conflicting review ref, undeclared post-evaluation
  changes, or a finalized tree that differs from the recorded tree. It does not
  open a pull request or bypass branch protection as fallback behavior.
- **AC5.** Exact reviewed integration: after explicit human acceptance, synthetic
  promotion rechecks the integration base, review ref, context fingerprint, and
  tree, then advances the integration branch only to the exact reviewed commit.
  A stale or non-fast-forward attempt performs no integration update.
- **AC6.** Durable review evidence: a synthetic boundary packet records its mode,
  candidate source, synthetic review commit/ref/URL, exported commit comments,
  declared evidence-only paths, and integration result. Tracker and protocol
  presentation identify review boundaries without requiring a PR number.
- **AC7.** Final PR preservation: when release and integration branches differ,
  the feature-final boundary is a real pull request from integration to release.
  Synthetic mode cannot be selected for that boundary, and complete-feature
  evaluation retains the original feature base plus the final PR's immediate
  base and head.
- **AC8.** Portable compatibility: existing PR-mode lifecycle tests, historical
  model locks, CLI/Desktop context consumers, native plugin composition, and
  package inventories continue to pass. The QualityCode policy remains PR-first
  and documents synthetic mode as an explicit repository exception.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Repository configuration resolves both slice modes and release roles compatibly. | Omitted fields produce PR mode and integration-as-release; valid explicit fields round-trip through JS and Python resolvers; invalid values are rejected. | Defaults change, JS/Python disagree, or invalid modes/branches are accepted. | Focused JS context-parity and Python workflow-context tests. |
| R2 | Boundary consumers use a transport-neutral pinned contract. | PR and synthetic fixtures yield identical common base/head/merge-base/source inputs and version-1 PR fixtures still validate. | A gate infers independent refs, requires PR-only data, or rejects historical PR context. | Context, gate, packet, feature-final, and agent-workflow tests. |
| R3 | Synthetic publication creates the specified exact review commit. | Test repository proves one parent equals pinned integration, tree equals finalized slice tree, deterministic review ref is pushed, and URL/SHA are recorded. | Parent/tree/ref/URL differs or publication can mutate unrelated refs. | Synthetic-review helper integration tests using local bare remotes plus GitHub URL unit tests. |
| R4 | Synthetic publication and promotion fail closed on drift or unsafe state. | Dirty/detached worktrees, moved bases/refs, changed trees, undeclared paths, and non-fast-forward updates all exit nonzero without changing integration. | Any unsafe condition updates integration, opens a PR, force-pushes, or silently falls back. | Negative helper integration tests and captured ref assertions. |
| R5 | Accepted synthetic review advances integration to the exact reviewed SHA. | With current inputs and explicit acceptance evidence, the remote integration ref equals the recorded synthetic commit after promotion. | Promotion creates a different commit or succeeds without acceptance/currentness checks. | End-to-end synthetic slice test and protocol event assertions. |
| R6 | Synthetic packets and presentation retain durable review evidence. | Packet validation accepts complete synthetic metadata/comments and rejects missing or mismatched identities; tracker/snapshot surfaces boundary mode and reference without a PR number. | Synthetic review depends on transient ref alone or PR-specific fields remain mandatory. | Packet validator, tracker lint, snapshot, observer, CLI, and Desktop contract tests. |
| R7 | Feature-final review remains a real integration-to-release PR. | Distinct release configuration routes feature-final scope through PR context and complete-feature evaluation; synthetic finalization is rejected. | Synthetic transport can replace or be mistaken for the final PR. | Sequential workflow acceptance and feature-final tests. |
| R8 | Existing behavior and distributions remain compatible. | Existing suites plus plugin validate/lint/native validation, dual package build, and portable acceptance pass with PR mode unchanged. | Existing PR workflows, historical fixtures, or native packages regress. | Full Node/Python suites, plugin contract commands, package comparison, and portable acceptance. |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
