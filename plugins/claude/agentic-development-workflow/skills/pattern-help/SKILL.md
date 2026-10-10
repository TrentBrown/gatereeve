---
name: pattern-help
description: "Explain the pattern-review command family, route slash-command topics like workflow, harvest, promote, and review, and help users choose the next pattern command without mutating files."
---

# Pattern Help

Use this skill when the user asks how to use pattern-review commands, asks what
to run next, or invokes `/pattern-help` with or without a topic.

This skill is read-only guidance. It should not run helper commands, mutate
`.pattern-review/`, or create proposal artifacts unless the user separately
asks to execute a specific workflow.

## Topics

### Overview

Use when no topic is provided.

Pattern review has five active user-facing surfaces:

- `pattern-init` creates an intended `.pattern-review/` scope.
- `pattern-extract` converts instruction prose into proposed structured rules.
- `pattern-harvest` collects GitHub PR review feedback into a complaint corpus,
  coverage matrix, and proposal drafts.
- `pattern-promote` accepts, rejects, defers, edits, or skips proposals. This
  is the normal path that changes active `rules.yaml`.
- `pattern-review` gates a branch diff against active rules.
- `pattern-status` reports scope health, bucket counts, harvest state, and the
  likely next command.

There are also deferred surfaces:

- `pattern-learn` is reserved for normalized downstream learning events.
- `pattern-audit` is reserved for rule health and maintenance checks.

### workflow

Recommended sequence:

1. `pattern-status` to inspect current scope state when unsure.
2. `pattern-init` to create the right rule scope.
3. `pattern-extract` to draft rules from existing prose, or `pattern-harvest`
   to draft rules from reviewer feedback.
4. `pattern-promote` to decide which proposals become active rules.
5. `pattern-review` at PR boundaries to check a branch before human review.

Use `pattern-harvest` again when a human review reveals new recurring feedback
that should be evaluated against the current rules.

### init

Use `pattern-init` when a repository or nested checkout needs a
`.pattern-review/` directory. It creates lifecycle buckets:

- `rules.yaml`
- `proposals.yaml`
- `deferred.yaml`
- `rejected.yaml`
- `README.md`

Next likely command: `pattern-extract` or `pattern-harvest`.

### extract

Use `pattern-extract` when the source material is instruction prose, such as
coding guidelines, `AGENTS.md`, `CLAUDE.md`, or local review conventions. It
creates proposal drafts, not active rules.

Next likely command: `pattern-promote`.

### harvest

Use `pattern-harvest` when the source material is GitHub PR review feedback. It
normalizes reviewer comments into durable artifacts:

- `raw/*.json`
- `complaints.json` and `complaints.md`
- `coverage-matrix.json` and `coverage-matrix.md`
- `candidate-rule-proposals.md`
- `proposals.yaml`
- `README.md`
- `harvest-state.json`

Prefer frozen `--raw-dir` input for reproducible validation. Include
`--pattern-dir` paths when comparing comments to current active rules.

Optional filters are available for incremental or current-actionable views:

- `--since <timestamp>` includes comments created or updated after an ISO
  timestamp.
- `--only-unresolved` includes only unresolved review threads.
- `--exclude-outdated` omits outdated review threads.
- `--resume` uses `harvest-state.json` to include only new or updated comments
  since the previous harvest.

Do not filter resolved or outdated comments by default when the goal is pattern
learning. Resolved comments are often the best evidence of what should have
been caught earlier.

Next likely command: `pattern-promote`, after inspecting the generated proposal
drafts.

### promote

Use `pattern-promote` to decide proposals. It supports accepting, rejecting,
deferring, editing, or skipping proposal packets. Accepting a proposal moves it
into active `rules.yaml`.

Next likely command: `pattern-review`.

### review

Use `pattern-review` at PR boundaries or before human review. It checks the
branch diff against active rules, writes a persisted report, and blocks on
unresolved blocker failures or manual-review requirements unless explicitly
waived.

Next likely command: fix findings and rerun `pattern-review`, or continue to
the normal PR boundary workflow.

### status

Use `pattern-status` when the user asks what pattern-review state exists or
what to do next. It reports applicable scopes, lifecycle bucket counts, YAML
parse failures, rule-shape findings, promotion packet presence, harvest state,
and a suggested next command. The easy slash-command form is:

```text
/pattern-status <repo-or-worktree-path>
```

For slash-command use, write Markdown and HTML reports by default, open the
HTML report in the in-app browser when available, and present the HTML report
as the primary artifact. Use descendant discovery so a worktree path can find
nested scopes like `client/.pattern-review` and `webservices/.pattern-review`.

Next likely command: follow the status output.

### learn

`pattern-learn` is deferred from v1. It is for future normalized
`docs/issues/<branch>/learning-events/*.yaml` inputs from judge, PR review, CI,
QA, or manual notes. It should not be used for direct GitHub review harvesting;
use `pattern-harvest` for that.

### audit

`pattern-audit` is deferred from v1. It is intended for future maintenance
checks such as schema problems, duplicate rules, weak rationale, vague triggers,
or stale provenance.

## Response Style

Answer with the smallest useful guide for the requested topic. Include exact
command names and the next likely command. Avoid long background unless the
user asks for design rationale.
