# Judge

Use for an independent spec compliance pass at PR boundaries or feature
completion.

At a formal PR boundary, first resolve the `judge` gate through
`boundary_gate.py`. Read changed files only from its `diffBaseSha` through
`diffHeadSha` and write the result only to its `outputPath`. Do not re-resolve
the PR, infer an upstream, or choose a branch-derived report path. Outside a
formal boundary, retain the existing standalone diff and output fallback.

1. Gather only the materials required for evaluation:
   - AC and rubric from `spec.md`.
   - Changed file list from the correct merge base.
   - Current changed file contents.
2. Keep the judge isolated from implementation rationale and prior
   self-evaluation.
3. Ask the judge to score every in-scope rubric criterion as PASS, FAIL, or
   PASS WITH CONCERNS, citing file/line evidence.
4. Include scope creep, gap, and contradiction checks.
5. Treat judge failures as blockers until fixed or explicitly accepted by the
   user.
6. Preserve the result as an auditable artifact. Formal boundaries use the
   active packet's fixed `judge.md`; standalone evaluations may use an
   explicitly named report or summarize the verdict plus concerns in
   `tracker.md` and the PR body when a separate file would be excessive.
7. Do not emit pattern-review learning events by default. The learning-event
   producer contract is deferred from pattern-review v1 until the review gate
   has enough real usage to justify the extra structure.

Judge output must include:

```markdown
## Judge Evaluation

**Verdict:** PASS / FAIL / PASS WITH CONCERNS

### Rubric Evaluation
| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|

### Scope Check
- **Scope creep found:** Yes/No
- **Details:** ...

### Gap Check
- **Unaddressed AC:** ...

### Contradiction Check
- **Contradictions found:** ...

### Concerns
...
```

If subagents are available and the user has authorized parallel agent work, use
a subagent. Otherwise perform the independent pass yourself by rebuilding the
evaluation from source artifacts only.
