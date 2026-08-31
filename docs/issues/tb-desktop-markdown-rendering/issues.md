# Issues - tb-desktop-markdown-rendering

**Feature:** `tb-desktop-markdown-rendering`
**Spec:** [`spec.md`](spec.md)
**Plan:** [`plan.md`](plan.md)
**Created:** 2026-08-31

Operational task breakdown derived from the plan.

## I-1 - Establish the deterministic Markdown bundle

- **Status:** closed
- **Estimate:** medium
- **Plan steps:** P1
- **Rubric criteria:** R7
- **Depends on:** none
- **PR:** [#42](https://github.com/TrentBrown/gatereeve/pull/42)

Pin the parser, GFM, HAST, sanitizer, DOM-conversion, and bundler dependencies;
create the source entry and generated-output contract; wire every supported
Desktop entry path; and cover clean-build and package-exclusion behavior.

## I-2 - Replace the handwritten parser with safe CommonMark/GFM DOM output

- **Status:** closed
- **Estimate:** large
- **Plan steps:** P2
- **Rubric criteria:** R1, R2, R3, R6
- **Depends on:** I-1
- **PR:** [#42](https://github.com/TrentBrown/gatereeve/pull/42)

Build the shared processor, source-preserving raw-HTML/image transforms,
sanitizer schema, disabled task controls, and DOM conversion. Remove the regex
parser after CommonMark, GFM, hostile-input, malformed-input, and Mermaid-fence
tests demonstrate equivalent or expanded behavior under the safety contract.

## I-3 - Preserve GateReeve link and fragment capabilities

- **Status:** closed
- **Estimate:** medium
- **Plan steps:** P3
- **Rubric criteria:** R4, R5, R6
- **Depends on:** I-2
- **PR:** [#42](https://github.com/TrentBrown/gatereeve/pull/42)

Generate prefixed deterministic heading IDs, retain logical fragment lookup,
and activate inline/reference/autolink output only through the existing caller
resolver. Cover canonical, external, fragment, rejected, duplicate-heading,
Session, refresh, and source-toggle paths.

## I-4 - Present and verify the added semantic structures

- **Status:** closed
- **Estimate:** medium
- **Plan steps:** P4
- **Rubric criteria:** R2, R8
- **Depends on:** I-2
- **PR:** [#42](https://github.com/TrentBrown/gatereeve/pull/42)

Style the new structures without broad global selectors, extend representative
visual content, and verify table/code containment, list hierarchy, disabled
task state, footnote labels/navigation, heading hierarchy, and constrained
layout behavior.

## I-5 - Complete runtime, package, and workflow verification

- **Status:** closed
- **Estimate:** medium
- **Plan steps:** P5, P6
- **Rubric criteria:** R1, R2, R3, R4, R5, R6, R7, R8
- **Depends on:** I-1, I-2, I-3, I-4
- **PR:** [#42](https://github.com/TrentBrown/gatereeve/pull/42)

Run the full clean-build, test, Electron, visual, staging, and packaging matrix;
capture rubric evidence; clear review and judge findings; reconcile the
lifecycle documents; and prepare the human-review boundary.
