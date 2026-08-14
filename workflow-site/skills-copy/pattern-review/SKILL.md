---
name: pattern-review
description: "Run the pattern-review gate for agentic development work. Use before human review or at PR boundaries to review a repo branch diff against active .pattern-review rules, write a persisted pattern-review.md report, resolve findings, waivers, and manual review items, and rerun until the gate passes or is explicitly waived."
---

# Pattern Review

Use this as a gate, not a checklist. Review the current Git repository's branch
diff against active pattern rules.

Deterministic helper:

```bash
python3 /Users/trent.brown/agentic-development-workflow/scripts/pattern_tool.py review-inputs --cwd <repo>
```

Workflow:

1. Run the helper to collect repo context, base/head, changed files, rule
   sources, duplicate-ID overrides, and deterministic trigger results.
2. If no applicable `.pattern-review` directory is found after the normal scope
   walk, fail and tell the caller to run `/pattern-init <intended-scope>`.
3. Display the `.pattern-review` directories found in the rule stack before
   evaluating rules so the caller can spot an unexpected scope.
4. If no active rules are found in an existing scope, write `PASS_WITH_WARNINGS` and state that the
   gate is not meaningfully configured; recommend `pattern-extract`.
5. Evaluate rules whose trigger result is `true`.
6. For `agentic` triggers, decide whether the rule triggers and record a brief
   rationale whether it does or does not.
7. For triggered `agentic` reviews, inspect the changed files and return one of
   `pass`, `fail`, `warning`, `not_applicable`, or `needs_manual_review`.
   Every non-`pass` result needs file/line evidence or a note explaining why
   evidence is not file-specific.
8. For triggered `manual` reviews, block until a human disposition is recorded
   for the current merge-base/head context.
9. Treat `blocker` failures and unresolved manual items as `FAIL`. Treat
   warnings as `PASS_WITH_WARNINGS`. Explicit persisted waivers produce
   `PASS_WITH_WAIVERS`, which is an acceptable passing verdict.
10. Write the final human-readable report before declaring the gate passed.
   For normal workflow branches, use `docs/issues/<branch>/pattern-review.md`.
   Include review context, rule stack, triggered rules, findings, waivers,
   manual review dispositions, and final verdict. Reference rules by ID, title,
   source path, and hash; do not dump full rule text by default.
11. If the gate fails, fix the implementation or record a manual review/waiver,
   then rerun. Do not emit learning events for ordinary findings; emit them
   only when the gate exposes a rule-system weakness.
