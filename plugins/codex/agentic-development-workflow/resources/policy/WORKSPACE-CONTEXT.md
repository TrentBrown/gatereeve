# Workflow Workspace Context

The workflow separates the stable identity of a feature from the Git branch
used to deliver one PR. A configured feature workspace contains
`.agentic-workflow.json` at its root:

```json
{
  "schemaVersion": 1,
  "featureId": "tb-1234-my-important-feature",
  "externalTask": {
    "id": "1234",
    "url": "https://tracker.example/tasks/1234"
  },
  "repositories": {
    "product": {
      "path": ".",
      "remote": "origin",
      "integrationBranch": "main",
      "releaseBranch": "main",
      "sliceBoundaryMode": "pull-request",
      "featureBaseSha": "1111111111111111111111111111111111111111"
    }
  }
}
```

`externalTask` is optional. Preserve an original task number in `featureId`
when one exists, but store task identity and URL structurally rather than
recovering them by parsing the slug.

`featureBaseSha` is optional during ordinary slice delivery but required for a
configured `feature-final` boundary. Capture the selected repository's
integration-branch commit before the first delivery slice begins. Each
repository has its own original base in a multi-repository feature. The pinned
PR context preserves this value so later configuration drift cannot silently
change the complete-feature evaluation range.

## Resolution

Run the portable resolver from the installed plugin resource root:

```bash
python3 "<plugin-root>/resources/scripts/workflow_context.py" resolve \
  --cwd "$PWD" \
  --json
```

The resolver walks upward from the invocation path and uses the nearest
`.agentic-workflow.json`. Its containing directory is the workspace root, and
the cumulative feature record is:

```text
<workspace-root>/docs/issues/<featureId>/
```

Repository paths must be relative to the workspace root and may not escape it.
With one repository, commands infer it automatically. With multiple
repositories, invocation from inside a configured repository selects the most
specific matching path; otherwise pass `--repository <alias>`.

If no configuration exists, commands preserve legacy behavior: the current Git
repository is the workspace, the current branch is the feature identity, and
documents live under `docs/issues/<current-branch>/`.

## Sequential delivery branches

The first delivery branch may use the exact feature ID. Later PRs use a fresh
branch containing the stable feature ID, an ordinal, and a slice description:

```bash
python3 "<plugin-root>/resources/scripts/workflow_context.py" delivery-branch \
  --feature-id tb-1234-my-important-feature \
  --ordinal 2 \
  --description application-shell
```

This prints `tb-1234-my-important-feature-02-application-shell`. Begin every
later slice from the updated integration branch after the preceding PR merges.

## Tracking policy

The workspace configuration is local and untracked by default. A client-level
repository may deliberately track it. Workflow tools must not silently edit a
repository `.gitignore`, global ignore file, or other Git policy to hide the
configuration; exclusion through `.git/info/exclude` is an explicit local
operator choice.

## Authoritative pull-request context

Formal PR-boundary evidence begins from the pull request, not from a branch's
configured upstream. Resolve and save one context after the intended source is
committed, pushed, represented by a draft PR, and the target repository is
clean:

```bash
python3 "<plugin-root>/resources/scripts/pr_context.py" resolve \
  --cwd "$PWD" \
  --output /tmp/pr-context.json
```

The resolver uses `gh` by default. `--pr <number-or-url>` selects an explicit
PR; otherwise `gh` resolves the PR for the current branch. For deterministic
tests, offline preparation, and future host adapters, pass `--pr-data` with a
JSON object containing `repository`, `number`, `url`, `state`, `isDraft`,
`baseRefName`, `baseRefOid`, `headRefName`, and `headRefOid`.

Resolution is a blocking synchronization preflight. It rejects a dirty target
repository, detached or wrong local branch, closed or non-draft PR, mismatched
GitHub repository, and any local `HEAD` that differs from the pushed PR head.
The resulting context pins the PR base, head, merge base, and
`evaluatedSourceSha`; it also pins the configured `featureBaseSha` when one is
present. All diff-driven gates consume these exact values.

`sliceBoundaryMode` is optional and defaults to `pull-request`. The alternative
`synthetic-commit` is an explicit, squash-only repository policy for slice
boundaries. `releaseBranch` is also optional and defaults to
`integrationBranch`. When these branches differ, feature-final review must be
a real pull request whose head is `integrationBranch` and whose base is
`releaseBranch`; synthetic transport is never valid for that final boundary.

## Authoritative synthetic-commit context

For an opted-in repository, start a slice topic branch from the current remote
integration branch, commit the candidate source, keep the checkout clean, and
resolve the pinned context without creating a pull request:

```bash
python3 "<plugin-root>/resources/scripts/synthetic_review.py" resolve \
  --cwd "$PWD" \
  --output /tmp/review-context.json
```

Run every boundary gate against that context. After committing only declared
evidence paths, publish the finalized tree as a single-parent review commit:

```bash
python3 "<plugin-root>/resources/scripts/synthetic_review.py" publish \
  --context /tmp/review-context.json \
  --evidence-path docs/issues/tb-1234-my-important-feature \
  --output /tmp/review-receipt.json
```

The parent is the pinned remote integration SHA; the tree is the finalized
topic-branch tree. Publication pushes only the deterministic temporary review
ref and prints the GitHub commit URL. It refuses dirty or detached state,
integration drift, an existing review ref, or undeclared post-evaluation
changes. It never opens a PR or force-pushes as fallback.

Export GitHub commit comments into the durable receipt, then provide separate
explicit human-acceptance JSON containing `accepted: true`, `actor`, and the
exact `reviewCommitSha`. Promotion rechecks the base, review ref, local tree,
commit parent, commit tree, and acceptance before a non-force update:

```bash
python3 "<plugin-root>/resources/scripts/synthetic_review.py" capture-comments \
  --context /tmp/review-context.json \
  --receipt /tmp/review-receipt.json \
  --output /tmp/review-evidence.json

python3 "<plugin-root>/resources/scripts/synthetic_review.py" promote \
  --context /tmp/review-context.json \
  --receipt /tmp/review-evidence.json \
  --acceptance /tmp/review-acceptance.json \
  --output /tmp/integration-receipt.json
```

For the last sequential PR, resolve and inspect the complete-feature view:

```bash
python3 "<plugin-root>/resources/scripts/feature_final.py" \
  --cwd "$PWD" \
  --context /tmp/pr-context.json \
  --json
```

This requires the original base to be ancestral to both the final slice base
and evaluated source. It reports both changed-file ranges and whether every
current, non-ignored file in the centralized feature record is tracked by Git.
Ignored transient files are listed for transparency but do not force a
retention decision. The helper never copies or archives an untracked record.

Immediately before evidence finalization, fail if the PR source moved:

```bash
python3 "<plugin-root>/resources/scripts/pr_context.py" check-current \
  --context /tmp/pr-context.json
```

After boundary artifacts are committed and pushed in the same repository,
verify that every post-evaluation change belongs to a declared evidence path
and that local and remote PR heads match:

```bash
python3 "<plugin-root>/resources/scripts/pr_context.py" finalize \
  --context /tmp/pr-context.json \
  --evidence-path docs/issues/tb-1234-my-important-feature/pr-42
```

Any other post-evaluation change requires the affected gates to rerun. The
[`EVIDENCE-PACKETS.md`](EVIDENCE-PACKETS.md) contract supplies these declared
paths in the next workflow layer; this helper deliberately does not infer them.
