# Supplementary Standards

Canonical supplement to WORKFLOW.md. Content preserved from the former
home-level CLAUDE.md monolith during the 2026-06-10 canonicalization.

## Spec Completeness Gate

Before any implementation plan is produced from a specification, confirm:

- [ ] Definition of Done requirements are understood and will apply
- [ ] Acceptance Criteria are written, feature-specific, and unambiguous
- [ ] Rubric is derived from the AC and every criterion is binary
- [ ] All three layers are internally consistent - no gaps or contradictions

If any item fails, surface the gap and resolve it before proceeding.
A plan produced against an incomplete spec is itself incomplete.

## Plan Requirements

1. Reference the rubric explicitly: each planned task maps to one or more
   rubric criteria. A task that maps to no criterion is out of scope or the
   rubric is incomplete - resolve before proceeding.
2. Number plan steps with stable IDs (`P1`, `P2`, ...). Reordering or
   removal requires an explicit plan revision; avoid renumbering.
3. The final plan phase is always a rubric evaluation pass (spec-evaluate).
4. After drafting the plan, derive the initial `issues.md` breakdown; every
   plan step produces at least one issue.
5. Do not silently expand scope beyond the AC. Amend the spec (with user
   approval) before expanding scope.

## Branch Tracker Format

```markdown
# Branch Tracker - {branch}

**Spec:** spec.md
**Plan:** plan.md
**Created:** YYYY-MM-DD

## Rubric Status

| # | Criterion (short) | Status | PR | Notes |
|---|-------------------|--------|-----|-------|
| R1 | ... | PASS | #42 | |
| R2 | ... | NOT YET | - | Planned for step 5 |

## PR Log

### PR #1 - {title} - YYYY-MM-DD
- **Plan steps covered:** 1-3
- **Rubric criteria in scope:** R1, R4
- **Rubric criteria moved to PASS:** R1, R4
- **DoD:** PASS
- **Status:** merged
```

Status values: PASS (satisfied on this branch), NOT YET (planned for a
future step), FAIL (should be satisfied by completed steps but is not).
Multi-repo PR log entries additionally record: repository, PR number/URL,
DoD status for that repository, and remaining cross-repo dependencies.

## When to Write Tests

Write tests when adding functions/endpoints/services/components, changing
behavior or API contracts, fixing a qualifying bug (below), or adding a
user-facing flow. Skip only for purely cosmetic changes, static content
edits, or configuration/documentation. When in doubt, write the test.

## Test-First Bug Fixes

Always write a failing test BEFORE the fix when:

- The bug is in reactive, asynchronous, or state-machine code (races, stale
  closures, watcher order, promise ordering, store subscriptions).
- The bug involves data correctness (wrong data shown, silent failure,
  cross-scope or cross-tenant leakage).
- The same class of bug has surfaced before in this area.
- The fix depends on an assumption about an external system's behavior -
  the test pins the assumption.

Usually skip the prior failing test when the fix is a typo, an obvious
one-line correction, a rendering-only change, or when no test infrastructure
exists for the area (note the gap to the user).

Procedure: write the test describing correct behavior; run it and confirm
it FAILS in a way that implicates the bug (a test that passes on unfixed
code is not covering what you think); apply the fix; confirm green; run
adjacent tests. Stub external systems the way they actually behave today,
not the way you wish they behaved.

## When You Cannot Test

If something cannot be tested in the dev environment (sandbox unavailable,
deployment-only configuration, missing credentials): document exactly what
needs manual testing with step-by-step instructions, do NOT mark the task
complete, and report it as "Implementation complete - pending manual
verification" listing each untestable item and why.

## Constraint Architecture

Must do:

- Run tests before declaring any task complete
- Write tests for new logic as part of implementation, not as a follow-up
- Verify the build succeeds after changes
- Run the linter on changed files; zero errors before declaring complete
- Report completion status in the Completion Report format
- For specced tasks, run the rubric before declaring complete
- Update the branch tracker at every PR boundary
- Create a tracker at branch start for all specced tasks
- Run scoped rubric evaluation before every PR, not just the final one

Must not do:

- Declare a task complete without running tests
- Skip failing tests or mark them expected without explicit human approval
- Assume code works because it looks right - verify it runs
- Treat testing as optional or as a follow-up task
- Produce a plan from a spec that lacks AC or rubric

Prefer:

- The implementation approach that is easier to test
- Small verifiable increments over large untested changes
- The full test suite over targeted tests, unless the suite exceeds ~5 min

Escalate (ask the human):

- A test framework needs to be added to a project without one
- Existing tests fail before your changes (pre-existing failures)
- You cannot determine how to test a feature in the dev environment
- Changes require environment variables, credentials, or services you lack
- A spec's AC is ambiguous or contradictory
