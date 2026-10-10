# Pattern Promote

Use this as the interactive human governance step for pattern-review proposals.
This is the only pattern command that changes active rules.

Input:

- Optional path to a `.pattern-review` directory.
- If no argument is provided, find the nearest applicable `.pattern-review`
  directory from the current working directory.

Procedure:

1. Load and follow the `pattern-promote` skill.
2. Fail if no applicable `.pattern-review` directory is found. Tell the caller
   to run `/pattern-init <intended-scope>`.
3. Display the `.pattern-review` directory whose proposals will be promoted
   before mutating any lifecycle file.
4. Read `.pattern-review/proposals.yaml`.
5. Generate full promotion packets for the next or selected proposal:
   `python3 "<plugin-root>/resources/scripts/pattern_tool.py" promote-show <pattern-dir> [proposal-id]`.
   Link the generated HTML packet in chat instead of printing the full proposal
   by default. The helper also writes a Markdown packet beside it as a plain
   fallback.
6. Present proposals one at a time. In chat, show a compact summary with:
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
7. Ask for one disposition using both full words and single-letter shortcuts:
   `a=accept`, `r=reject`, `d=defer`, `e=edit`, `s=skip`. Accept either the
   full word or the shortcut.
8. On `accept`, move the resolved rule into `rules.yaml`, preserving compact
   provenance, and remove it from `proposals.yaml`.
9. On `reject` or `defer`, move the full proposal into `rejected.yaml` or
   `deferred.yaml` with a decision block.
10. On `skip`, leave the proposal in `proposals.yaml` so the process can resume
   later.
11. Use the deterministic helper for bucket movement:
    `python3 "<plugin-root>/resources/scripts/pattern_tool.py" promote <pattern-dir> <proposal-id> <accept|reject|defer> [--reason "..."]`.
    Do not hand-edit lifecycle buckets for ordinary accept, reject, or defer
    decisions. Do not use partial field patches for active rules in v1.
12. Normalize lifecycle YAML after any accept, reject, defer, or edit:
    `python3 "<plugin-root>/resources/scripts/pattern_tool.py" normalize-buckets <pattern-dir>`.
13. Parse the normalized lifecycle files before reporting success. Treat parse
    failures as command failures.

Output:

- Updated `.pattern-review/rules.yaml`, `.pattern-review/proposals.yaml`,
  `.pattern-review/rejected.yaml`, or `.pattern-review/deferred.yaml`
- Summary of accepted, rejected, deferred, edited, and skipped proposals
