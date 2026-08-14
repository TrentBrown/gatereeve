# PR Review

Use before requesting human review, and when the user asks for a PR/code review.

Review stance:

- Findings first, ordered by severity.
- Focus on bugs, regressions, missing tests, security risks, broken contracts,
  and workflow/doc drift.
- Cite file and line references.
- If no issues are found, say so and list residual risk or test gaps.

At a formal PR boundary, first resolve the `codeReview` gate through
`boundary_gate.py`. Review exactly `diffBaseSha..diffHeadSha`, use the supplied
changed-file list as the scope inventory, and write the result to `outputPath`.
Do not infer another branch, upstream, base, head, feature folder, or report
filename. Outside a formal boundary, retain the existing PR/local-diff fallback.

Procedure:

1. Identify the PR or diff base.
2. Read the diff and surrounding code, not just PR metadata.
3. For specced work, cross-check changed behavior against `spec.md`, `plan.md`,
   `issues.md`, and `tracker.md`.
4. Check tests and verification evidence.
5. Check cross-repo contracts when the change depends on another repository.
6. Produce a review artifact when useful or requested. Formal PR boundaries
   always use the active packet's fixed `code-review.md`, even when no findings
   are found; record "No findings" plus residual risks and test gaps so the
   review is auditable outside the chat transcript. Standalone reviews may use
   an explicitly named output.
7. Do not emit pattern-review learning events by default. The learning-event
   producer contract is deferred from pattern-review v1 until the review gate
   has enough real usage to justify the extra structure.
8. Record the review result in the PR description or `tracker.md` before
   requesting human review.
9. Do not modify implementation while acting purely as reviewer unless the user
   explicitly asks for fixes.
