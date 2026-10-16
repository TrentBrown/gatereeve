# Decision Triage

Use at every PR boundary before opening or updating the PR for review.

1. Read `scratchpad.md`.
2. Ensure every entry is marked:
   - `[x]` promote
   - `[-]` dismiss
   - `[ ]` blocks triage
3. Append promoted entries to `decisions.md`.
4. Leave dismissed entries in `scratchpad.md` as audit trail.
5. Add PR number/URL to promoted entries when available.

Useful script:

```bash
python3 "<plugin-root>/resources/scripts/decision_triage.py" \
  --branch-dir docs/issues/$(git branch --show-current) \
  --pr "#123"
```
