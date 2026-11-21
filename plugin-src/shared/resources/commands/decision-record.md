# Decision Record

Use when a decision trigger fires during implementation.

1. Identify the decision, trigger, blast radius, confidence, and alternatives.
2. Resolve the cumulative feature home and append a new numbered section to
   `docs/issues/{featureId}/scratchpad.md`.
3. New entries always start with `[ ] **Promote**`.
4. Record immediately, not retroactively at the end of the session.
5. Every entry carries **Answered by:** `human | agent`. In a goal run a
   question you would have asked the human is a decision you answer
   yourself: record it with `--answered-by agent`, the alternatives and
   `--reversibility`. Agent entries are listed on the PR under "Decisions
   made for you" and assessed by both independent reviewers.

Useful script:

```bash
python3 "<plugin-root>/resources/scripts/decision_record.py" \
  --branch-dir "<resolved-feature-home>" \
  --title "Short title" \
  --confidence HIGH \
  --blast-radius "Affected modules" \
  --triggered-by "Symptom or question" \
  --body "Decision explanation"
```
