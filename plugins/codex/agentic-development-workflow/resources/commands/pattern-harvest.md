# Pattern Harvest

Use this to harvest GitHub pull-request review feedback into durable
pattern-review evaluation artifacts. This is a focused predecessor to
`pattern-learn`: it reads reviewer comments, writes a complaint corpus and
coverage matrix, and drafts candidate rule proposals without changing active
rules.

Input:

- One or more GitHub PR references, either `owner/repo#123` or
  `https://github.com/owner/repo/pull/123`.
- A reviewer login to harvest.
- An output directory for the corpus.
- Optional `.pattern-review` directories for current-rule coverage comparison.
- Optional raw-data directory containing previously fetched `<repo>-<number>.json`
  files.
- Optional filters:
  - `--since <timestamp>` to include only comments created or updated after an
    ISO timestamp.
  - `--only-unresolved` to include only comments from unresolved review threads.
  - `--exclude-outdated` to omit comments from outdated review threads.
  - `--resume` to use `<output-dir>/harvest-state.json` and include only new
    or updated comments since the previous harvest.

Procedure:

1. Load and follow the `pattern-harvest` skill.
2. Choose an output directory outside active `.pattern-review/` scopes unless
   the user explicitly names one.
3. If a prior raw data corpus exists, prefer `--raw-dir` for reproducible
   validation. Otherwise use the GitHub CLI to fetch live PR review data.
4. Run:

   ```bash
   python3 "<plugin-root>/resources/scripts/pattern_tool.py" harvest-github-reviews \
     --pr <owner/repo#number> \
     --reviewer <login> \
     --out <output-dir> \
     --pattern-dir <repo>/.pattern-review
   ```

5. Add one `--pr` per pull request and one `--pattern-dir` per rule scope that
   should be included in the current-rule coverage comparison.
6. Use `--since`, `--only-unresolved`, `--exclude-outdated`, or `--resume` only
   when the user wants an incremental or state-filtered harvest. The default
   is to keep resolved and outdated comments because they are useful learning
   evidence.
7. Inspect `coverage-matrix.md` and `candidate-rule-proposals.md` before moving
   any generated proposal into a project `.pattern-review/proposals.yaml`.
8. Do not mutate `rules.yaml`. Use `pattern-promote` for active rule changes.

Output:

- `<output-dir>/raw/*.json`
- `<output-dir>/complaints.json`
- `<output-dir>/complaints.md`
- `<output-dir>/coverage-matrix.json`
- `<output-dir>/coverage-matrix.md`
- `<output-dir>/candidate-rule-proposals.md`
- `<output-dir>/proposals.yaml`
- `<output-dir>/harvest-state.json`
- `<output-dir>/README.md`
