# Spec Draft

Use when a feature or task lacks acceptance criteria and rubric.

1. Read the user's feature description and any referenced files.
2. For branch-level specced work, read both design-phase artifacts:
   - `design.md` is the controlling input after the design gate.
   - `interview.md` is required supporting material for examples, draft
     contracts, rationale, concrete references, and edge-case detail.
3. If `interview.md` suggests detail that is consistent with `design.md`, use
   it to make the acceptance criteria and rubric more precise. If it
   contradicts `design.md`, expands scope, or changes the chosen shape, stop
   and ask whether to amend `design.md`.
4. If context is insufficient to write verifiable criteria, ask concise
   clarifying questions before drafting.
5. Draft 4-8 acceptance criteria:
   - Observable behavior, not implementation detail.
   - Independently verifiable.
   - Unambiguous.
   - Covers happy path, key edge cases, and error conditions.
   - Excludes process gates that belong to DoD.
   - Names the lifecycle boundary where required evidence can exist. Do not
     make a pre-merge feature gate depend on credentials, trusted artifacts,
     deployment state, or other evidence intentionally available only after
     merge; preserve that obligation as an explicit post-merge release or
     deployment acceptance gate.
6. Draft the `## Failure model` section (required; `spec.validate` refuses a
   spec without it):
   - The handled conditions: the inputs, states and environments the feature
     must handle.
   - Outside them, the detect-and-refuse behaviour: a clear error, never a
     silent best effort.
   - Reviewers rate a finding whose trigger lies outside the handled
     conditions as low (non-blocking), so name the conditions that matter.
   - Keep criteria bounded. `spec.validate` refuses a criterion or rubric line
     that says `always`, `any`, `all cases`, `never fails`, `converges` or
     `robust` unless the same line carries a bound: a failure-model reference,
     a number, or `at most`, `at least`, `up to`, `no more than` or `within`.
7. Draft rubric entries:
   - Derived from the AC.
   - Explicit pass and fail conditions.
   - Binary, with no partial credit.
   - Includes expected evidence type.
8. Present the draft for approval before writing it, unless the user already
   asked you to write the spec file directly.

Output:

```markdown
## Failure model

Handled conditions:
- ...

Outside the model, ... detects and refuses with a clear error:
- ...

## Acceptance Criteria

- **AC1.** ...

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | ... | ... | ... | ... |
```
