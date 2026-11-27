# Definition of Done

This is the global Definition of Done of the software development workflow.
A specification incorporates it when it says "The global Definition of Done
in the software development workflow applies" (the spec template's
sentence). The specification may add project-specific items; they apply in
addition to these.

## At the review boundary

Boundary reviewers assess these for the candidate under review:

1. **Criteria met with evidence.** Every rubric row selected for the
   candidate is met, and its evidence is actual: tests, verification
   receipts, retained captures or documents, not claims.
2. **Tests.** New or changed behavior has tests, written with the change.
   They were run on the candidate and pass. A qualifying bug fix (asynchronous
   or state-machine code, data correctness, a repeated defect class, an
   assumption about an external system) has a test that failed before the
   fix.
3. **Build and lint.** The build succeeds, and the project's linters report
   no errors on changed files.
4. **Verification scope.** The verification the review consumes covers the
   focused tests of every changed source area and every affected test suite,
   and the hosted CI planned for after review convergence covers the
   approved scope.
5. **Decisions recorded.** Material decisions are in the feature's decision
   log; the tracker and issues reflect the work done.
6. **Scope.** The change does what the specification asks and nothing
   unrelated. Any change of scope is a recorded specification amendment.
7. **Documentation.** Documentation the change makes inaccurate is updated.
8. **Untestable items.** Anything that cannot be tested in the development
   environment is listed with step-by-step manual checks and reported as
   pending manual verification, never as done.

## After merge

These are checked only after the change is merged. They are not assessed at
a review boundary, and their absence there is neither a finding, a coverage
limitation nor a reason for UNAVAILABLE:

- release, deployment, and live or production acceptance checks;
- rubric rows the specification marks `After merge:`;
- completion records: observed integration, release observation, local
  record retention and the completion report.
