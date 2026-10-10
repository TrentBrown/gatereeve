# Plan

Use when drafting or revising `plan.md` for specced branch work.

1. Confirm the design gate has passed and `spec.md` has been validated.
2. Read the planning inputs in authority order:
   - `spec.md` is the controlling input for scope, required behavior, and
     rubric mapping.
   - `design.md` is required context for architecture, constraints,
     implementation boundaries, and rejected alternatives.
   - `interview.md` is required supporting material for examples, draft
     contracts, rationale, concrete references, and edge-case detail.
3. If `design.md` or `interview.md` suggests work that is not represented in
   `spec.md`, stop and amend `spec.md` before adding that work to `plan.md`.
4. Draft stable plan step IDs (`P1`, `P2`, ...). Map every implementation step
   to at least one rubric criterion, except explicitly labeled coordination or
   final verification steps.
5. Include the implementation strategy, code areas, test strategy, integration
   touchpoints, sequencing, and verification approach needed to satisfy the
   rubric.
6. Do not add hidden acceptance criteria to `plan.md`; requirements belong in
   `spec.md`.

Output:

```markdown
## Strategy

...

## Steps

- **P1.** ... **Advances:** R1.

## Verification

- **Final step:** Run full rubric evaluation and produce the completion report.
```
