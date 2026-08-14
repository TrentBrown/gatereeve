---
name: pattern-promote
description: "Interactively approve pattern-review proposals. Use to walk .pattern-review/proposals.yaml one proposal at a time, accept, reject, defer, edit, or skip, and move entries into rules.yaml, rejected.yaml, or deferred.yaml. This is the only pattern workflow that changes active rules."
---

# Pattern Promote

Use this as the human governance step for rule changes. It is intentionally
interactive.

Workflow:

1. Fail if no applicable `.pattern-review` directory is found. Tell the caller
   to run `/pattern-init <intended-scope>`.
2. Display the `.pattern-review` directory whose proposals will be promoted
   before mutating any lifecycle file.
3. Read `.pattern-review/proposals.yaml`.
4. Generate full promotion packets for the next or selected proposal:
   `python3 /Users/trent.brown/agentic-development-workflow/scripts/pattern_tool.py promote-show <pattern-dir> [proposal-id]`.
   Link the generated HTML packet in chat instead of printing the full proposal
   by default. The helper also writes a Markdown packet beside it as a plain
   fallback.
5. Present proposals one at a time. In chat, show a compact summary with:
   `id`, `title`, `severity`, short description, packet link, and the allowed
   dispositions. The HTML packet should highlight `title`, `description`,
   `rationale`, good/bad examples, trigger, review instructions, and source
   evidence. The raw YAML should remain available in a collapsed disclosure.
   The Markdown packet must contain two clearly separated sections:
   - **Structured proposal**: exact proposal fields as written in YAML:
     `id`, `title`, `description`, `rationale`, `scope`, `trigger`, `review`,
     `severity`, `examples`, `exceptions`, and provenance.
   - **Source evidence**: literal source text reconstructed from
     `evidence.instructionFiles` by `path` and `line`, or the stored
     `sourceText` when present.
   Do not default to ellipsizing either packet section. If source evidence is
   too large, use deterministic boundaries: full bullet, full paragraph, or
   direct fenced block, and explicitly say when a larger section continues.
6. Ask for one disposition using both full words and single-letter shortcuts:
   `a=accept`, `r=reject`, `d=defer`, `e=edit`, `s=skip`. Accept either the
   full word or the shortcut.
7. On `accept`:
   - for `new_rule`, append the resolved rule to `rules.yaml`;
   - for `modify_rule`, replace the target rule with the complete resolved
     proposed rule;
   - preserve compact provenance such as `promotedFrom`, `promotedAt`,
     `promotedBy`, sources, and learning events;
   - remove the proposal from `proposals.yaml`.
8. On `reject` or `defer`, move the full proposal shape into `rejected.yaml` or
   `deferred.yaml` with a `decision` block containing `decidedAt`, `decidedBy`,
   and `reason`.
9. On `skip`, leave the proposal in `proposals.yaml` so the process can resume
   later.
10. Use the deterministic helper for bucket movement:
   `python3 /Users/trent.brown/agentic-development-workflow/scripts/pattern_tool.py promote <pattern-dir> <proposal-id> <accept|reject|defer> [--reason "..."]`.
   Do not hand-edit lifecycle buckets for ordinary accept, reject, or defer
   decisions. Do not use partial field patches for active rules in v1.
11. Normalize lifecycle YAML after any accept, reject, defer, or edit:
    `python3 /Users/trent.brown/agentic-development-workflow/scripts/pattern_tool.py normalize-buckets <pattern-dir>`.
12. Parse the normalized lifecycle files before reporting success. Treat parse
    failures as command failures.
