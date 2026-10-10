# Design Phase Procedure

1. Confirm the feature-level tracker task (The Tree) and delivery branch exist;
   resolve the cumulative feature folder as `docs/issues/{featureId}/`.
2. Ensure `interview.md` exists in the feature folder.
3. Run the `grill-me` interview on the feature intent. Keep `interview.md`
   current during the interview, ideally updating it after each settled
   decision or other high-value design clarification. Do not draft
   `design.md`, `spec.md`, or implementation-planning documents during the
   interview.
4. When the interview concludes, synthesize `design.md` in the feature
   folder from `templates/design.md`:
   - H1: `# Design - {featureId}`
   - Sections: Problem, Intent, Chosen shape, Alternatives considered,
     Constraints, Open risks.
5. Present `design.md` for the design gate. Explicit user approval is
   required before any spec work begins.
6. On approval: mark the status line approved with the date, freeze the
   document (further changes via `## Changes` entries only), write a
   checkpoint (`gate:design`), and proceed to spec drafting.
7. On rejection: revise via further grilling, or delete the branch if the
   feature is abandoned outright.
