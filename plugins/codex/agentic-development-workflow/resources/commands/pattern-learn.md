# Pattern Learn

Deferred from pattern-review v1. Use only when the user explicitly asks to
continue the later learning-loop workflow.

Use this after downstream evaluators produce normalized learning events. It
consumes failure signals and proposes durable improvements without changing
active rules.

Input:

- Optional issue directory containing `learning-events/*.yaml`.
- Optional `.pattern-review` directory.
- If arguments are omitted, infer the branch issue directory and nearest
  applicable `.pattern-review` directory from the current working directory.

Procedure:

1. Load and follow the `pattern-learn` skill.
2. Fail if no applicable `.pattern-review` directory is found after the normal
   scope walk or if an explicit pattern directory does not exist. Tell the
   caller to run `/pattern-init <intended-scope>`.
3. Display the `.pattern-review` directory that will receive proposals or be
   checked for processed provenance.
4. Run the deterministic helper when both directories are known:
   `python3 "<plugin-root>/resources/scripts/pattern_tool.py" event-inventory <issue-dir> <pattern-dir>`.
5. Read pending `docs/issues/<branch>/learning-events/*.yaml`; each event
   represents one finding.
6. Use event IDs and fingerprints to skip events already represented in
   `rules.yaml`, `proposals.yaml`, `deferred.yaml`, or `rejected.yaml`.
7. Classify pending events and write rule-worthy outcomes as `new_rule` or
   `modify_rule` proposals in `.pattern-review/proposals.yaml`.
   Preserve evidence as structured source locations with `path` relative to
   the `.pattern-review` scope root and, when known, `line`. Avoid
   machine-specific absolute paths unless the source is outside any portable
   checkout context. Do not encode Markdown links in YAML; reports can render
   clickable links from those fields.
8. Write non-rule outcomes to `docs/issues/<branch>/learning-recommendations.md`
   or the analogous source-event location.
9. Normalize lifecycle YAML after writing proposals:
   `python3 "<plugin-root>/resources/scripts/pattern_tool.py" normalize-buckets <pattern-dir>`.
10. Parse the normalized lifecycle files before reporting success. Treat parse
   failures as command failures.
11. Do not mutate learning-event source files or active `rules.yaml`.

Output:

- New or updated `.pattern-review/proposals.yaml`
- Optional `learning-recommendations.md`
- Summary of processed, skipped, and still-ambiguous events
