# FAIL

The change implements most of the approved synthetic review workflow, but overall PASS is not met because R1 fails.

## Failing Criterion

**R1 - Repository configuration resolves both slice modes and release roles compatibly: FAIL**

Both resolvers implement the new fields and defaults, but branch-name validation is incomplete. JS maps branch validation to `validateFeatureId` (`plugin-src/shared/resources/protocol/context.js:86-91`), and Python maps it to `validate_feature_id` (`plugin-src/shared/resources/scripts/workflow_context.py:124-128`). Those validators reject whitespace, control characters below 32, and several dangerous fragments, but they do not reject the single name `@` (`context.js:68-79`, `workflow_context.py:111-119`). That is not a valid Git branch name, so invalid branch names can pass context resolution, contrary to AC1/R1.

## Passing Criteria

**R2: PASS** - `BoundaryContext` supplies a transport-neutral schema and reads legacy PR contexts (`boundary_context.py:37-52`, `123-131`); gates normalize the context and expose common diff inputs (`boundary_gate.py:52-60`, `149-175`).

**R3: PASS** - synthetic publication pins the integration SHA, derives a deterministic review ref, creates a single-parent `commit-tree` commit, pushes the review ref, and records URL/SHA evidence (`synthetic_review.py:177-203`, `305-337`; test coverage at `test_synthetic_review.py:113-135`).

**R4: PASS** - publication/promotion fail closed for dirty/detached state, moved bases, existing review refs, undeclared changes, stale review refs, and tree/parent mismatch (`synthetic_review.py:61-73`, `227-301`, `447-469`; negative tests at `test_synthetic_review.py:151-225`).

**R5: PASS** - promotion requires captured comments, explicit acceptance, matching context fingerprint, current refs, and advances integration to the exact review SHA (`synthetic_review.py:350-368`, `422-485`; `test_synthetic_review.py:137-149`).

**R6: PASS** - synthetic packet validation records and checks review identity, comments, evidence paths, commit tree/parent, integration receipt, and Review tracker links without PR numbers (`boundary_packet.py:103-116`, `461-523`, `561-580`, `634-641`).

**R7: PASS** - feature-final review rejects synthetic transport, enforces release/integration PR roles, and preserves feature-base plus final-slice ranges (`feature_final.py:224-319`; tests at `test_feature_final.py:185-220`).

**R8: PASS** - the required verification snapshot hash matches and reports focused synthetic, full Python, full Node, plugin validate/lint/native, dual package parity, and portable acceptance PASS. PR mode remains default in code and policy (`context.js:182-190`, `quality-code.md:13-17`).

## Checks

Scope creep: PASS. The changed files are within workflow/protocol/CLI/scripts/tests/policy/docs and the feature record.

Gap check: FAIL. The branch-validation gap above is material to AC1/R1.

Contradiction check: PASS. The implementation preserves PR defaults and rejects synthetic feature-final review (`feature_final.py:230-234`).

## Concern

Checked-in Desktop staged resources look stale relative to shared protocol/scripts (`apps/desktop/resources/scripts/workflow_context.py`, `apps/desktop/resources/protocol/constants.js`). Normal Desktop scripts run `stage:protocol` before test/start/package, so this is a concern rather than an additional failing criterion here.