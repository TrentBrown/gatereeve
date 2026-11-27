# Spec - tb-convergence-severity-calibration

**Feature:** `tb-convergence-severity-calibration`
**Created:** 2026-11-27

## Summary

GitHub issue #143. Reviewers rate findings that need an unusual combination of
conditions, or that lie outside the stated failure model, as low by a stated
rule. Full-rigor specs carry a required `Failure model` section, and
`spec.validate` refuses a spec without one or with unbounded criteria. Light
runs hold documentation to a "good enough" bar. Design: `design.md`
(interview D1-D9).

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Failure model

Handled conditions:
- Specs in the template layout (`## Acceptance Criteria`, `## Rubric`) and in
  the alternative presentations the parser already accepts.
- Runs that start on this version, runs that recorded a spec validation under
  `planning-facts/1` (with the same or a changed spec), and runs resumed
  through `run.resume-current` with an observed implementation approval.
- Observed approvals supplied to a resumption are truthful (the protocol's
  existing trust in observed provenance); an approval that misstates what the
  human approved is outside the model.
- Reviewer requirement bases with and without a `Failure model` section
  (full spec or light brief).

Outside the model, GateReeve detects and refuses with a clear error, never a
silent best effort:
- a spec the parser cannot extract fails `spec.validate` with the parser's
  diagnostic, as today;
- a missing, empty or unresolved failure model, or unbounded wording, fails
  `spec.validate` naming the line, except for a grandfathered spec, where it
  is reported as a warning naming the line.

Reviewer judgment (whether a condition is uncommon, whether a reader following
prose reaches a wrong outcome) is outside what GateReeve can check; the rules
tell reviewers what to apply, and the failure scenario they write shows it.

## Acceptance Criteria

- **AC1. Likelihood-first severity rule.**
  - The code reviewer instructions (full and brief-based) and the planning
    reviewer instructions state that likelihood is judged before
    consequence: a scenario is realistic when it arises in ordinary use
    within the handled conditions, with no one acting unusually; a scenario
    that needs two or more independent uncommon conditions at once is low
    whatever its consequence; a severe consequence does not raise an unusual
    scenario above low.
  - They name example uncommon conditions (a crash or signal at one specific
    step, a concurrent writer, a hand-edited or corrupted record, a clock
    change, a provider outage) and ask the reviewer to state the conditions a
    scenario needs in its failureScenario.
  - The verdict schemas, the low-never-blocks normalization and the
    paired higher-rating rule are unchanged.

- **AC2. Failure model in reviews.**
  - The code reviewer instructions name the `Failure model` section of
    requirements/spec.md, or of requirements/brief.md for a brief-based
    candidate, as the stated failure model. A finding whose trigger lies
    outside its handled conditions is low. A failure of the model's own
    detect-and-refuse behaviour is in the model and is rated on its
    scenario.
  - When the requirement basis has no `Failure model` section, the
    instructions say no finding is low merely for lying outside a model.
  - The planning reviewer instructions apply the same rule and also ask
    whether the failure model has an obvious gap.
  - No reviewer packet field is added.

- **AC3. Required failure-model section.**
  - The spec template has a `## Failure model` section between
    `## Definition of Done` and `## Acceptance Criteria`, prompting for the
    handled conditions and the detect-and-refuse behaviour outside them.
  - `spec.validate` fails when the spec has no level-2 `Failure model`
    heading outside code fences (diagnostic says it is missing), when the
    section has no content line before the next level-1 or level-2 heading,
    or when its content contains `TODO` (diagnostics name the heading line).
  - A spec with a nonempty, resolved section passes this check.

- **AC4. Unbounded-wording lint.**
  - `spec.validate` fails when a line in the `Acceptance Criteria` or
    `Rubric` section (or, without those headings, an extracted AC or rubric
    line) contains `always`, `any`, `all cases`, `never fails`, `converges`
    or `robust` as whole words, case-insensitive, outside inline code and
    fenced code, unless that line also contains "failure model", a numeral,
    or `at most`, `at least`, `up to`, `no more than` or `within`.
    Requirement identifiers (`AC1`, `R2`, `I-3`, `D4`, `P5`) are not
    numerals: `AC1. Always succeeds` fails.
  - One failure diagnostic lists each offending line number with its word.
  - Lines outside those sections are not linted.

- **AC5. Versioning for old runs.**
  - The planning policy identifier is `planning-facts/2`.
  - A spec is grandfathered when its exact bytes (hash) equal the spec of a
    validation the run recorded (passed or failed) under an earlier planning
    policy, or of a validation the run already grandfathered. The spec
    that `run.resume-current` validates as part of a resumption whose
    observed `planning.implementation` approval names the current
    commitments (whose identity includes the spec bytes) is grandfathered.
    This is the design's "observed approvals of the unchanged commitments":
    the commitments identity is the implementation subject, while a
    `planning.design` approval covers `design.md` alone and does not
    grandfather (scratchpad S3).
  - For a grandfathered spec the AC3 and AC4 checks produce warnings with the
    same line references, the proof records `grandfathered: true`, and
    validation passes when the other facts pass.
  - Every other spec fails validation on them, including a changed spec in a
    run that holds a grandfathered one and a spec changed after a
    resumption.
  - The `spec.validate` result returns the warnings, and the retained proof
    records them.
  - The portable `lint_spec.py` applies AC3 and AC4 as failures.

- **AC6. Light runs: optional failure model and documentation bar.**
  - `light-run.md` documents an optional `## Failure model` section in the
    brief; light runs have no lint on it.
  - The brief-based reviewer instructions add the documentation bar: a
    finding about documentation or operations prose blocks only when a
    reader following the text as written, in a realistic scenario, reaches a
    wrong or unsafe outcome (a wrong command, flag, path or value; a missing
    warning before a destructive or irreversible step; a statement that
    contradicts the shipped code or the brief). Wording, style, structure,
    narrower restatements of an already fixed point, rare edge cases the
    text does not mention and suggestions to document more are low.
  - The bar states that documentation the brief's goal or scope asks for is
    a requirement: a missing or wrong part of it is judged like other unmet
    requirements, not by the bar.
  - The full-rigor code reviewer instructions do not contain the
    documentation bar.

- **AC7. Documentation of the rules.**
  - PROTOCOL.md describes the likelihood-first rule, the failure-model rule
    for reviewers, the `spec.validate` checks with their old-run warnings,
    and the light documentation bar.
  - `spec-draft.md` asks for the failure model and bounded criteria;
    `spec-validate.md` lists the two checks.

- **AC8. Compatibility and packaging.**
  - `REVIEW_CONTRACT_VERSION` has a new value; a result retained under the
    previous version keeps its recorded qualification, and a result of the
    new version with a different contract fingerprint does not.
  - The desktop's staged protocol copy is byte-identical to the plugin
    source, and the test fixture specs carry a failure model.
  - The CLI test suite, the desktop contract check and the Python script
    tests pass on the candidate, with Mac-only exclusions listed.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1 likelihood-first severity rule | Code (full and brief) and planning reviewer instructions contain the realistic definition, the two-or-more uncommon conditions rule, the consequence clause, the examples and the ask to state conditions; schemas and normalization unchanged | A text is missing from one instruction set, or a schema or normalization rule changed | Unit test on the review and planning contracts; diff of the schemas |
| R2 | AC2 failure model in reviews | Code instructions name the spec or brief Failure model section, the out-of-model low rule, the refusal clause and the no-section clause; planning instructions add the gap question; no packet field added | A clause is missing, or a packet field is added | Unit test on contract text; diff of packet assembly |
| R3 | AC3 required failure-model section | Template has the section; missing, empty and placeholder-only sections fail naming the heading line (or that it is missing); a resolved section passes | A bad section passes, a good one fails, or the diagnostic has no line | Unit tests on planning.js; template diff |
| R4 | AC4 unbounded-wording lint | Each listed word on an AC or rubric line fails without a same-line bound and passes with one; a requirement identifier is not a numeral bound; code spans, fences and other sections are ignored; one diagnostic lists every offending line | A listed word passes without a bound, a bound is ignored, ignored text fails, or a line is missing from the diagnostic | Unit tests on planning.js |
| R5 | AC5 versioning for old runs | Policy is planning-facts/2; a grandfathered spec (same bytes as an earlier-policy or grandfathered validation, or validated by a resumption with an implementation approval) gets warnings and passes; a design-only resumption does not grandfather; a changed spec in such a run and a new run's spec fail; the result and proof carry the warnings; the portable lint fails | A grandfathered spec fails, a changed or new spec passes with violations, warnings are not returned, or the portable lint passes violations | Core tests through spec.validate; portable lint test |
| R6 | AC6 light failure model and documentation bar | light-run.md documents the optional section; brief-based instructions contain the documentation bar with its blocking cases, low cases and the brief-required exception; full instructions do not | The bar is missing, misplaced into full instructions, or a case or the exception is missing | Unit test on both contracts; light-run.md diff |
| R7 | AC7 documentation | PROTOCOL.md, spec-draft.md and spec-validate.md describe the rules as stated | A rule is undocumented or documented differently from the code | Diff review |
| R8 | AC8 compatibility and packaging | Version moved; retained-qualification test passes; desktop copy matches; fixtures updated; CLI, desktop check and Python tests pass with exclusions listed | A check fails, the copy differs, or the retained-qualification rule broke | Verification receipts and hosted CI |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
