# Pattern Audit

Deferred from pattern-review v1. Use only when the user explicitly asks for
rule-set maintenance or audit work.

Use this to inspect pattern-review rule-set health without changing active
rules.

Input:

- Optional path to a `.pattern-review` directory.
- If no argument is provided, find the nearest applicable `.pattern-review`
  directory from the current working directory.

Procedure:

1. Load and follow the `pattern-audit` skill.
2. Fail if no applicable `.pattern-review` directory is found. Tell the caller
   to run `/pattern-init <intended-scope>`.
3. Display the `.pattern-review` directory that will be audited before
   inspecting it.
4. Run the deterministic helper:
   `python3 "<plugin-root>/resources/scripts/pattern_tool.py" audit-rules <pattern-dir>`.
5. Inspect active rules, proposals, deferred entries, and rejected entries for
   semantic problems the helper cannot prove deterministically.
6. Write `.pattern-review/audit.md` for the audited rule set.
7. If active rules should change, write proposals to
   `.pattern-review/proposals.yaml`; do not modify `rules.yaml` directly.

Output:

- `.pattern-review/audit.md`
- Optional new or updated proposals in `.pattern-review/proposals.yaml`
