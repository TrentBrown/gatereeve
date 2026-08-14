---
name: pattern-extract
description: "Extract structured pattern-review rule proposals from instruction prose. Use to bootstrap or refresh .pattern-review/proposals.yaml from AGENTS.md, CLAUDE.md, .cursor/rules, or similar repo/client guidance without changing active rules."
---

# Pattern Extract

Use this to convert human-readable instruction prose into candidate
pattern-review rules. This command is batch-oriented and non-interactive.

Workflow:

1. Identify applicable instruction files by walking from the target repo or
   changed files upward: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, and similar
   local guidance.
2. Fail if no applicable `.pattern-review` directory is found after the normal
   scope walk. Tell the caller to run `/pattern-init <intended-scope>`.
3. Display the `.pattern-review` directory that will receive proposals before
   writing anything.
4. Extract only review-critical patterns: conventions that should be checked
   before human review, especially repeated failure classes or high-risk local
   rules.
5. Write candidates to the nearest appropriate `.pattern-review/proposals.yaml`.
   Do not modify `rules.yaml`.
6. Prefer proposal objects with:
   - `type: new_rule` or `type: modify_rule`
   - `id`, `title`, `description`, `rationale`
   - `scope`
   - `trigger` with mode `path`, `diff`, `agentic`, or `always`
   - `severity`
   - `review` with mode `agentic`, `manual`, `mechanical`, or `checklist`
   - `evidence` and `provenance`
   - `examples` and `exceptions` when available
7. Use structured source locations in evidence and provenance:
   - `evidence.instructionFiles` should contain objects with `path` relative
     to the `.pattern-review` scope root and, when known, `line`, such as
     `{ path: "AGENTS.md", line: 12 }`.
   - Include `sourceText` for literal source evidence when practical. Do not
     summarize or ellipsize source text by default. Use deterministic
     boundaries: a full bullet line, full paragraph, or directly relevant
     fenced block. If a section is too large to include fully, store `line`
     plus `sourceBoundary: section` and explain that the section continues
     rather than truncating silently.
   - `provenance.target` should be an object with `path` for concrete repo or
     folder targets, usually `{ path: "." }` for the initialized scope.
   - Avoid machine-specific absolute paths unless the source is outside any
     portable checkout context.
   - Do not put Markdown links in YAML. Reports and chat can render clickable
     links from `path` and `line`.
8. Preserve example usefulness:
   - When examples are available or can be reasonably derived from the source
     guidance, write complete, concrete good and bad examples.
   - Do not truncate, ellipsize, or reduce examples to fragments. A useful
     example should be a complete sentence or compact mini-scenario that shows
     the rule being satisfied or violated.
   - Prefer source-grounded examples over generic placeholders. If the source
     does not support a concrete example, omit `examples` rather than inventing
     vague filler.
9. Keep active rules clean. Promotion to `rules.yaml` happens only through
   `pattern-promote`.
10. If a candidate resembles an existing active, proposed, deferred, or rejected
   rule, update or reference that lifecycle item instead of blindly adding a
   duplicate.
11. Normalize lifecycle YAML after writing:
   `python3 /Users/trent.brown/agentic-development-workflow/scripts/pattern_tool.py normalize-buckets <pattern-dir>`.
12. Parse the normalized `proposals.yaml` before reporting success. Treat parse
    failures as command failures.
