---
name: pattern-audit
description: "Audit pattern-review rule-set health. Use periodically or before sharing rules to inspect .pattern-review rules for schema problems, duplicate IDs, overlap, weak triggers, missing examples, unclear rationale, and maintenance recommendations without changing active rules."
---

# Pattern Audit

Use this for rule-system maintenance. It is not part of every `pattern-review`
run.

Deterministic helper:

```bash
python3 /Users/trent.brown/agentic-development-workflow/scripts/pattern_tool.py audit-rules <pattern-dir>
```

Workflow:

1. Fail if no applicable `.pattern-review` directory is found. Tell the caller
   to run `/pattern-init <intended-scope>`.
2. Display the `.pattern-review` directory being audited before inspecting it.
3. Run the helper for cheap shape validation.
4. Inspect active rules, proposals, deferred entries, and rejected entries for
   semantic concerns:
   - duplicate IDs or surprising overrides;
   - near-duplicate rules;
   - overlapping scopes/triggers with conflicting obligations;
   - weak or missing rationale;
   - missing examples or exceptions where they would materially help;
   - agentic triggers or reviews that are too vague to audit;
   - stale or unclear provenance.
5. Write `.pattern-review/audit.md` for the rule set being audited.
6. If a rule-system issue should change active rules, write a proposal to
   `.pattern-review/proposals.yaml`. Do not modify `rules.yaml` directly.
7. Treat schema-invalid active rules as blocking audit findings until fixed
   through `pattern-promote` or explicit manual repair.
