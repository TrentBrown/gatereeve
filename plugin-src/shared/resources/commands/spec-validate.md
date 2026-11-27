# Spec Validate

Use before planning from a spec.

1. Read the spec document.
2. Extract factual identities and references with `spec.validate` through the
   current adapter. The optional `scripts/lint_spec.py {branch_dir}` uses the same
   parser for diagnostics. Resolve ambiguity; presentation alone is not a gate.
3. `spec.validate` also applies two rules and names the offending lines:
   - a `## Failure model` section exists, is not empty and has no `TODO`;
   - no line of the `Acceptance Criteria` or `Rubric` section (outside code)
     uses `always`, `any`, `all cases`, `never fails`, `converges` or
     `robust` without a same-line bound: a failure-model reference, a number,
     or `at most`, `at least`, `up to`, `no more than` or `within`.
   A spec already validated under the earlier planning policy (the same bytes)
   gets them as warnings, as does the spec a `run.resume-current` with an
   observed implementation approval validates; a changed spec is held to them.
   Fix a false positive by stating the bound, not by rewording around the lint.
4. Confirm acceptance criteria exist and are observable, unambiguous, and
   independently verifiable.
   Confirm each required evidence type can exist at the lifecycle boundary
   where the criterion is evaluated. Reject a pre-merge criterion that
   requires a protected post-merge artifact or credentialed deployment;
   require separate feature and release/deployment acceptance gates instead.
5. Confirm the rubric exists and every criterion has binary pass/fail/evidence
   fields.
6. Check cross-layer consistency:
   - No AC without rubric coverage.
   - No rubric criterion disconnected from AC or a documented technical
     requirement.
   - No contradictions.
7. Report `READY FOR PLANNING` only when blocking gaps are resolved.
8. For a governed feature, record the successful `spec.validate`
   passage through the plugin protocol adapter before planning.
9. Offer to fix minor structural issues directly.

Report format:

```markdown
## Spec Validation Report

**Spec file:** path
**Status:** PASS/FAIL

### Failure Model and Bounded Criteria
- PASS/FAIL ...

### Acceptance Criteria
- PASS/FAIL ...

### Rubric
- PASS/FAIL ...

### Cross-Layer Consistency
- PASS/FAIL ...

### Verdict
READY FOR PLANNING / NOT READY
```
