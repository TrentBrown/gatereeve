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
      "keepPullRequestsClosed": false,
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

If no configuration exists, the resolver uses the Git fallback: the current Git
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

## Current source and review context

Use current `candidate.prepare` with explicitly selected repository aliases and
full base/head SHAs. The resolver supplies repository paths and delivery policy;
caller-supplied external paths are not authoritative. Requirements and evidence
remain in the parent feature home with Git tracking optional. Candidate capture
binds raw requirements, application source and repository policy separately.

Keep application source clean and exact. Closed PRs may report frozen SHAs;
protected merge resolves actual remote refs, checks the prepared source/target,
requires explicit authority and verifies reopened identity before merging.
Never reopen merely to help a review. Development branches are integration sinks
unless the user's explicit policy says otherwise; never merge/rebase one into
another branch under the default policy.

No evidence commit/push is required. Local retained reference closure establishes
proof. Read `<plugin-root>/resources/PROTOCOL.md` and `EVIDENCE-PACKETS.md` for current operations,
resumption, accepted exceptions and completion. Old locks/events remain historical
files, not another runtime mode.
