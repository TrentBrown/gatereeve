---
name: pattern-learn
description: "Learn from normalized downstream failure events. Use after judge, PR review, GitHub review, CI, QA, or manual notes emit docs/issues/<branch>/learning-events/*.yaml to classify findings, create pattern rule proposals or rule modifications, and write non-rule learning recommendations."
---

# Pattern Learn

Use this after downstream evaluators produce learning events. It consumes
failure signals and proposes durable improvements. It does not change active
rules.

Deterministic helper:

```bash
python3 /Users/trent.brown/agentic-development-workflow/scripts/pattern_tool.py event-inventory <issue-dir> <pattern-dir>
```

Workflow:

1. Fail if no applicable `.pattern-review` directory is found after the normal
   scope walk or if an explicit pattern directory does not exist. Tell the
   caller to run `/pattern-init <intended-scope>`.
2. Display the `.pattern-review` directory that will receive proposals or be
   checked for processed provenance.
3. Read `docs/issues/<branch>/learning-events/*.yaml`. Each event represents one
   finding.
4. Use event IDs and fingerprints to skip already-processed events by checking
   provenance in `rules.yaml`, `proposals.yaml`, `deferred.yaml`, and
   `rejected.yaml`.
5. Classify each pending event as one of:
   `new_pattern_rule`, `existing_rule_missed`, `existing_rule_ignored`,
   `process_gap`, `documentation_gap`, `test_gap`, `domain_knowledge`,
   `one_off_bug`, or `disputed_or_unclear`.
6. For rule-worthy outcomes, write `new_rule` or `modify_rule` proposals to
   `.pattern-review/proposals.yaml` with event provenance. For modifications,
   include a complete resolved rule candidate; do not patch active rules.
   Preserve evidence as structured source locations with `path` relative to
   the `.pattern-review` scope root and, when known, `line`. Avoid
   machine-specific absolute paths unless the source is outside any portable
   checkout context. Do not encode Markdown links in YAML; reports can render
   clickable links from those fields.
7. For non-rule outcomes, write `docs/issues/<branch>/learning-recommendations.md`
   or the analogous source-event location.
8. Normalize lifecycle YAML after writing proposals:
   `python3 /Users/trent.brown/agentic-development-workflow/scripts/pattern_tool.py normalize-buckets <pattern-dir>`.
9. Parse the normalized lifecycle files before reporting success. Treat parse
   failures as command failures.
10. Do not mutate learning-event source files. They are evidence, not state.
11. Do not modify `rules.yaml`; only `pattern-promote` changes active rules.
