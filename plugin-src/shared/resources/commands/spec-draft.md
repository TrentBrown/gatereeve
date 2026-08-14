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
6. Draft rubric entries:
   - Derived from the AC.
   - Explicit pass and fail conditions.
   - Binary, with no partial credit.
   - Includes expected evidence type.
7. Present the draft for approval before writing it, unless the user already
   asked you to write the spec file directly.

Output:

```markdown
## Acceptance Criteria

- **AC1.** ...

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | ... | ... | ... | ... |
```
