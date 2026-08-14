# Spec Validate

Use before planning from a spec.

1. Read the spec document.
2. Run `scripts/lint_spec.py {branch_dir}`; it must exit 0 before the
   judgment-based review below. Fix mechanical findings first.
3. Confirm acceptance criteria exist and are observable, unambiguous, and
   independently verifiable.
4. Confirm the rubric exists and every criterion has binary pass/fail/evidence
   fields.
5. Check cross-layer consistency:
   - No AC without rubric coverage.
   - No rubric criterion disconnected from AC or a documented technical
     requirement.
   - No contradictions.
6. Report `READY FOR PLANNING` only when blocking gaps are resolved.
7. Offer to fix minor structural issues directly.

Report format:

```markdown
## Spec Validation Report

**Spec file:** path
**Status:** PASS/FAIL

### Acceptance Criteria
- PASS/FAIL ...

### Rubric
- PASS/FAIL ...

### Cross-Layer Consistency
- PASS/FAIL ...

### Verdict
READY FOR PLANNING / NOT READY
```
