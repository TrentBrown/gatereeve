# Decision Record

Use when a decision trigger fires during implementation.

1. Identify the decision, trigger, blast radius, confidence, and alternatives.
2. Resolve the cumulative feature home and append a new numbered section to
   `docs/issues/{featureId}/scratchpad.md`.
3. New entries always start with `[ ] **Promote**`.
4. Record immediately, not retroactively at the end of the session.

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
