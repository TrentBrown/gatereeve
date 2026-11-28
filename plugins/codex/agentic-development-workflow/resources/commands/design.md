# Design Phase Procedure

1. Confirm the feature-level tracker task (The Tree) and delivery branch exist;
   resolve the cumulative feature folder as `docs/issues/{featureId}/`.
2. Ensure `interview.md` exists in the feature folder.
3. Run the `grill-me` interview on the feature intent. Every entry carries
   **Answered by:** `human | agent`; under `goal` autonomy grill-me answers
   its own questions as `agent` entries (see the grill-me skill) and continues
   from the last recorded entry. Keep `interview.md`
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
   required before any spec work begins. Under `mandated` or `goal` autonomy
   the gate instead takes an independent `planning.review` and an
   `autonomous-evaluator` decision; a goal reviewer also assesses every
   `agent` entry against the mandate. Approval pins `interview.md`: in a
   goal run a later change to it blocks milestones until an amendment.
6. On approval: mark the status line approved with the date, freeze the
   document (further changes via `## Changes` entries only), write a
   checkpoint (`gate:design`), and proceed to spec drafting.
7. On rejection: revise via further grilling, retain the record if the
   feature is abandoned. Deletion requires separate explicit authorization.

Record the actual design approval with `human.decide` kind `approve-design`
against the captured design hash. Use the current adapter described in
`<plugin-root>/resources/PROTOCOL.md`; prose approval status alone is not passage.
