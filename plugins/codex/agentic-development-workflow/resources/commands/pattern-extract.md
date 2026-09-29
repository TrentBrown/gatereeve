# Pattern Extract

Use this to bootstrap or refresh pattern-review proposals from human-readable
instruction prose. This command is batch-oriented and non-interactive.

Input:

- Optional target repo, worktree, directory, or changed-file path.
- If no argument is provided, use the current working directory as the target.

Procedure:

1. Load and follow the `pattern-extract` skill.
2. Walk from the target path upward and collect applicable instruction sources:
   `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, and similar local guidance.
3. Fail if no applicable `.pattern-review` directory is found after the normal
   scope walk. Tell the caller to run `/pattern-init <intended-scope>`.
4. Display the `.pattern-review` directory that will receive proposals before
   writing anything.
5. Extract only review-critical patterns: conventions that should be checked
   before human review, especially repeated failure classes or high-risk local
   rules.
6. Write candidates to the nearest appropriate
   `.pattern-review/proposals.yaml`.
   Prefer structured evidence paths relative to the `.pattern-review` scope
   root, with line numbers when known:
   `evidence.instructionFiles: [{ path: "AGENTS.md", line: 12 }]`.
   Include `sourceText` for the literal source evidence when practical. Do not
   summarize or ellipsize source text by default. Use deterministic boundaries:
   a full bullet line, full paragraph, or directly relevant fenced block. If a
   section is too large to include fully, store `line` plus
   `sourceBoundary: section` and explain that the section continues rather than
   truncating silently.
   For concrete folder provenance, use an object such as
   `provenance.target: { path: "." }`. Avoid machine-specific absolute paths
   unless the source is outside any portable checkout context. Do not encode
   Markdown links in YAML; reports can render clickable links from `path` and
   `line`.
7. Preserve example usefulness. When examples are available or can be
   reasonably derived from the source guidance, write complete, concrete good
   and bad examples. Do not truncate, ellipsize, or reduce examples to
   fragments; a useful example should be a complete sentence or compact
   mini-scenario that shows the rule being satisfied or violated. Prefer
   source-grounded examples over generic placeholders. If the source does not
   support a concrete example, omit `examples` rather than inventing vague
   filler.
8. If a candidate resembles an existing active, proposed, deferred, or rejected
   rule, update or reference that lifecycle item instead of blindly adding a
   duplicate.
9. Normalize lifecycle YAML after writing:
   `python3 "<plugin-root>/resources/scripts/pattern_tool.py" normalize-buckets <pattern-dir>`.
10. Parse the normalized `proposals.yaml` before reporting success. Treat parse
   failures as command failures.
11. Do not modify `.pattern-review/rules.yaml`.

Output:

- New or updated `.pattern-review/proposals.yaml`
- Short summary of instruction files read, proposals created or updated, and
  duplicates avoided
