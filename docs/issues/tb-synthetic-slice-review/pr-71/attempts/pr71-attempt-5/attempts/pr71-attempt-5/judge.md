# Independent Workflow Judge Report

Overall: **FAIL**

The required verification snapshot was present and matched the supplied SHA-256 digest. Most of the feature is implemented and verified: repository configuration defaults and validation are compatible, boundary contexts are transport-neutral while preserving v1 PR contexts, synthetic promotion checks exact reviewed identity, packets/presentation support synthetic evidence, feature-final remains PR-only, and compatibility suites are reported passing.

The blocking issue is in synthetic publication fail-closed behavior. `resolve_synthetic_context` derives a deterministic review ref, but `publish_review` later trusts `context.review.reviewRef` from the persisted context and pushes to it directly. `BoundaryContext.from_dict` validates the synthetic review ID and candidate SHA, but does not validate or re-derive the review ref. As a result, a syntactically valid but non-deterministic new ref can be published, mutating an unintended remote ref. That fails R3/R4 because the approved contract requires a deterministic temporary review ref and refusal of invalid review refs.

## Criteria

- **R1:** PASS. Python and JavaScript resolvers default to PR mode/integration-as-release and reject invalid modes/branches.
- **R2:** PASS. Boundary consumers normalize PR and synthetic contexts through a common pinned contract, while v1 PR contexts remain readable.
- **R3:** FAIL. Happy-path exact commit creation exists, but publication can mutate an unrelated ref supplied by context.
- **R4:** FAIL. Many unsafe states fail closed, but semantically invalid/non-deterministic review refs are not rejected at publication.
- **R5:** PASS. Promotion requires explicit acceptance and advances integration to the exact reviewed SHA.
- **R6:** PASS. Synthetic packets and presentation retain durable review evidence without requiring a PR number.
- **R7:** PASS. Feature-final rejects synthetic transport and enforces integration-to-release PR roles.
- **R8:** PASS. Verification and compatibility evidence cover existing suites, Desktop/native packaging, and historical `PR_BOUNDARY` locks.

## Blocking Evidence

- `plugin-src/shared/resources/scripts/synthetic_review.py:291-317` pushes `review_sha:review_ref` where `review_ref` comes from context.
- `plugin-src/shared/resources/scripts/boundary_context.py:181-189` validates synthetic identity but not the review-ref shape or deterministic value.
- `plugin-src/shared/resources/policy/WORKSPACE-CONTEXT.md:144-148` promises publication pushes only the deterministic temporary review ref.
- `plugin-src/shared/resources/scripts/tests/test_synthetic_review.py:178-190` covers existing-ref conflicts, but not a valid wrong review ref.