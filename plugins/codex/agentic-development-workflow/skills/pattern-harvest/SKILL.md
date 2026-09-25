---
name: pattern-harvest
description: "Harvest GitHub pull-request review comments into a durable complaint corpus, current-rule coverage matrix, and candidate pattern-rule proposal drafts without changing active rules."
---

# Pattern Harvest

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Use this when the user wants to collect prior GitHub PR review feedback and
evaluate whether current pattern-review rules would have caught it.

This is intentionally narrower than `pattern-learn`. It consumes GitHub review
comments directly and writes reviewable artifacts. It does not consume
normalized learning events, and it never mutates active rules.

Deterministic helper:

```bash
python3 "<plugin-root>/resources/scripts/pattern_tool.py" harvest-github-reviews \
  --pr <owner/repo#number> \
  --reviewer <login> \
  --out <output-dir>
```

Optional arguments:

- Add one `--pr` for each pull request.
- Add one `--pattern-dir <path>/.pattern-review` for each active rule scope to
  compare against.
- Add `--raw-dir <dir>` when reproducible validation should use previously
  fetched raw GitHub payloads named `<repo>-<number>.json`.
- Add `--since <timestamp>` to include only comments created or updated after
  an ISO timestamp.
- Add `--only-unresolved` to include only comments from unresolved review
  threads.
- Add `--exclude-outdated` to omit comments from outdated review threads.
- Add `--resume` to use `<output-dir>/harvest-state.json` and include only new
  or updated comments since the previous harvest.

Workflow:

1. Resolve each PR reference and reviewer login.
2. Prefer an explicit or durable output directory. If none is obvious, use a
   directory under `docs/pattern-review/evaluations/`.
3. Prefer `--raw-dir` when validating against a prior harvest so results do not
   drift with GitHub thread edits.
4. Run the deterministic helper.
5. Inspect the generated artifacts:
   - `complaints.md` for normalized reviewer comments.
   - `coverage-matrix.md` for heuristic current-rule coverage.
   - `candidate-rule-proposals.md` and `proposals.yaml` for draft rules.
   - `harvest-state.json` for resume high-water state.
6. Do not filter resolved or outdated comments by default. Resolved comments are
   useful learning evidence. Use `--only-unresolved` and `--exclude-outdated`
   for current-actionable views.
7. Treat proposal drafts as review packets. Copy or merge them into the target
   `.pattern-review/proposals.yaml` only when the user asks to promote that
   harvest into the lifecycle.
8. Do not modify `rules.yaml`; only `pattern-promote` activates rules.

Reporting:

- State the output directory.
- Report complaint count, current-rule coverage status counts when available,
  and candidate proposal count.
- State whether validation used live GitHub data or frozen raw data.
- State any filters used, including `--since`, `--only-unresolved`,
  `--exclude-outdated`, or `--resume`.
