# Pull-Request Evidence Packets

Each formal pull-request boundary owns one durable packet directly beneath the
cumulative feature folder:

```text
docs/issues/<featureId>/pr-<number>/
docs/issues/<featureId>/pr-<repository-alias>-<number>/
```

The first form is used when the workspace contains one repository. The second
form prevents PR-number collisions when several repositories participate. No
`pr-boundaries/` wrapper, mutable latest copy, or top-level pointer is created.
Existing top-level reports remain untouched as legacy evidence.

Resolve a packet path mechanically:

```bash
python3 "<plugin-root>/resources/scripts/boundary_packet.py" path \
  --cwd "$PWD" \
  --pr-number 42
```

## Version 1 manifest

Every packet contains `boundary.json` with exactly these fields:

```json
{
  "schemaVersion": 1,
  "scope": "slice",
  "featureId": "tb-1234-my-important-feature",
  "repositoryAlias": "product",
  "packetId": "pr-42",
  "pullRequest": {
    "repository": "owner/product",
    "number": 42,
    "url": "https://github.com/owner/product/pull/42",
    "state": "OPEN",
    "isDraft": true,
    "baseRefName": "main",
    "baseRefOid": "1111111111111111111111111111111111111111",
    "headRefName": "tb-1234-my-important-feature-02-slice",
    "headRefOid": "2222222222222222222222222222222222222222"
  },
  "mergeBaseSha": "1111111111111111111111111111111111111111",
  "evaluatedSourceSha": "2222222222222222222222222222222222222222",
  "featureBaseSha": null,
  "applicability": {
    "specEvaluation": true,
    "judge": true,
    "patternReview": false
  },
  "gates": {
    "verification": { "disposition": "passed", "reason": null },
    "specEvaluation": { "disposition": "passed", "reason": null },
    "judge": { "disposition": "passed", "reason": null },
    "codeReview": { "disposition": "passed", "reason": null },
    "patternReview": {
      "disposition": "not_applicable",
      "reason": "No pattern-review scope is configured"
    },
    "explainDiff": { "disposition": "passed", "reason": null }
  }
}
```

`scope` is `slice` or `feature-final`. Slice packets set `featureBaseSha` to
`null`; feature-final packets preserve the original feature base as a full
object ID matching the value pinned in PR context. `mergeBaseSha` remains the
immediate final-slice base. The manifest records the evaluated source but not
its containing evidence commit, which would be self-referential.

Before producing a feature-final packet, run `feature_final.py` with the pinned
PR context. The helper proves the original base is ancestral to the slice base
and source, returns both complete-feature and slice changed-file inventories,
and reports feature-record retention status. `verification`, `specEvaluation`,
and `judge` use the complete-feature base. `codeReview`, `patternReview`, and
`explainDiff` remain focused on the final PR slice. Run `boundary_gate.py` with
`--scope feature-final` so this routing remains deterministic.

## Artifact contract

Every packet contains these core files:

- `boundary.json`
- `verification.md`
- `code-review.md`
- `explain-diff.html`

Conditional files are fixed as `spec-evaluation.md`, `judge.md`, and
`pattern-review.md`. The corresponding applicability boolean and gate
disposition make every omission explicit. Applicable or waived gates retain a
nonempty artifact; an inapplicable gate uses `not_applicable`, supplies a
reason, and omits the file. A waiver also requires a reason.

## Deterministic validation

Validate the active packet against the pinned PR context and cumulative
tracker:

```bash
python3 "<plugin-root>/resources/scripts/boundary_packet.py" validate \
  --cwd "$PWD" \
  --context /tmp/pr-context.json \
  --json
```

The validator checks packet naming and centralized ownership, exact manifest
identity and Git context, artifact presence and dispositions, unexpected
files, the cumulative PR Log link, and prior-packet immutability. In a tracked
single-repository workspace it derives changed feature paths from Git. When
code and centralized evidence use different repositories, or the feature home
is intentionally untracked, the coordination layer supplies repeated
feature-home-relative `--changed-path` values. This makes the otherwise
unavailable change set explicit rather than silently claiming immutability.

A rerun of the same PR updates the same packet and is allowed to change that
packet. A later PR that changes any other `pr-*` directory fails validation.

## Shared gate context

Every diff-driven gate in a formal boundary resolves its view from the same
persisted PR context:

```bash
python3 "<plugin-root>/resources/scripts/boundary_gate.py" \
  --cwd "$PWD" \
  --context /tmp/pr-context.json \
  --gate codeReview \
  --json
```

Valid gate names are `verification`, `specEvaluation`, `judge`, `codeReview`,
`patternReview`, and `explainDiff`. The result supplies the pinned
`diffBaseSha`, `diffHeadSha`, exact changed-file list, active packet path, and
fixed output path. The resolver rejects a different repository, branch, merge
base, or local head. Pending uncommitted gate reports are allowed because they
do not change the pinned source commit.

Formal boundary gates must consume this result and must not independently infer
a branch, upstream, base, head, feature folder, or report filename. Pattern
review passes both pinned SHAs to `pattern_tool.py review-inputs --base ...
--head ...`. Standalone gate invocations outside a formal PR boundary retain
their documented legacy fallback behavior.
