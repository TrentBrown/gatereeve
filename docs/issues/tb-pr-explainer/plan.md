# Plan - tb-pr-explainer

**Feature:** `tb-pr-explainer`
**Spec:** [spec.md](spec.md)
**Design:** [design.md](design.md)
**Interview:** [interview.md](interview.md)
**Created:** 2026-11-18
**Status:** implementation approved; implementation and behavioral validation in progress.

## Inputs

- spec.md controls the required behavior and R1-R7.
- design.md is approved and supplies architecture, constraints, and exclusions.
- interview.md records the settled decisions and the rejection of a legacy skill alias.
- GateReeve recorded spec validation against the current approved design before this plan was drafted.

## Strategy

Deliver one focused PR on tb-pr-explainer from the recorded origin/main base. Build a concise, self-contained skill with progressively disclosed references for visual evidence, artifact composition, and the future invocation contract. Retain model discretion over page structure and visual form. Do not introduce an external rendering-plugin dependency or a general-purpose artifact framework.

Use original instructions informed by the researched visual-explainer and guided-review practices. Credit sources and preserve any applicable license notices if material is actually copied. Add executable helpers or assets only where a concrete repeated operation justifies them; the first version need not prescribe one renderer or require a new package dependency.

Replace the skill rather than retain an alias. Update active references selectively. Historical fixture records and generated explanations are evidence of prior behavior, not current invocation documentation, and must not be mechanically renamed.

## Steps

- **P1. Implement the replacement skill and its focused references.** Move the owning capability to plugin-src/shared/skills/pr-explainer/SKILL.md and remove the old distributed entrypoint. Specify source resolution, the five reviewer responsibilities, selected annotated excerpts, honest evidence categories, and concern handling. Add focused reference material for reading test/report/CI configuration to discover captures, qualifying baseline/actual/diff/stale images, composing useful visuals, portable HTML, artifact-only inspection, and the optional governed input/result contract. Use pr-explainer.html as the default while honoring explicit destinations. **Advances:** R1-R7.

- **P2. Update active naming and narrow artifact recognition.** Update plugin-src/contracts/workflow-inventory.json and active user/developer documentation, plus current UI labels or callers where they genuinely refer to the skill. Add recognition of the new default report name in plugin-src/shared/resources/protocol/current/evidence.js where required for the existing source/evidence boundary. Preserve recognition needed for historical retained reports rather than rewriting those records. Do not change required gates, authority, candidate selection, or posting behavior. **Advances:** R1, R7.

- **P3. Exercise real changes and evidence-discovery edge cases.** Select permitted fixed PR/source snapshots, prepare only the raw source and available supporting evidence, and invoke the new skill into task-owned output locations. Include a UI change, a non-UI change, a missing-document/capture case, and a governed-input case; combine examples where the behavior stays clear. Supplement with clearly labeled controlled report/CI-evidence fixtures to exercise configured non-default locations and a stale/unknown image. Keep an expected source/artifact inventory outside the generation prompt so output is checked against independent facts. Retain outputs and actual invocation records. Inspect actual HTML at desktop and phone widths and exercise any included controls. Correct only demonstrated problems. **Advances:** R1-R7.

- **P4. Validate packaging and the changed boundary, then prepare acceptance.** Run skill validation, repository inventory/portability/native checks, dual-platform package composition and isolated native discovery as appropriate. Add a behavioral regression for new report classification if evidence.js changes, proving that unrelated executable/configuration or arbitrary HTML is not broadly exempted. Use existing package inventory checks rather than tests that match skill prose. Run the applicable broad acceptance backstop once the implementation stabilizes. Prepare the exact candidate and retained evidence, explicitly request a fresh independent acceptance assessment, resolve supported findings, and evaluate every rubric row. **Advances:** R1, R5-R7; closes feature coverage R1-R7.

## Expected source areas

- plugin-src/shared/skills/pr-explainer/ and removal of plugin-src/shared/skills/explain-diff/.
- plugin-src/contracts/workflow-inventory.json.
- USER-GUIDE.md, DEVELOPMENT.md, and active desktop documentation/labels only where needed for the new capability name.
- plugin-src/shared/resources/protocol/current/evidence.js and focused tests in cli/test/current-source.test.js if report classification needs updating.
- Existing native composition/inventory tests only if their actual contract changes; generated dist and installed caches are not canonical source.

This is a scope forecast, not permission to modify unrelated files. Record unexpected material decisions in scratchpad.md and amend requirements before adding behavior outside spec.md.

## Example selection

The main examples use real source snapshots rather than earlier generated explainers as an answer key. GateReeve PR #42 (full desktop Markdown rendering) is a currently accessible UI candidate. Its observed head is faa30266bf0b60a03ac2285017762f76faf52b63 and base is 1d10d6da7b4acac054c31e65993a2f03bcbf0ee3. Select a bounded non-UI PR during implementation and record its actual identity. Inspect existing evidence before describing what it proves.

Controlled visual-evidence fixtures are permitted only as explicitly labeled test data for discovery and provenance behavior. They must not be described as actual screenshots of a historical PR's execution. Missing runtime evidence is an acceptable input condition with an explicit gap, not a reason to rerun a product or invent a capture.

## Verification

Checks are selected according to the implemented changes, with actual receipts retained:

- Run the system skill-creator validator against the new skill and verify that references are packaged and discoverable. Do not use wording/heading snapshots as proof of behavior.
- Run relevant Node tests, including cli/test/current-source.test.js for a changed report classifier, and existing composition/native contracts as applicable.
- Run repository plugin validate, plugin lint, and plugin validate-native through the maintainer CLI. Build both native packages and inspect that pr-explainer is present and explain-diff absent, with equivalent shared contents.
- Exercise isolated plugin discovery when the renamed skill changes the installed inventory. Do not overwrite normal agent profiles or install the feature into the user's active plugin cache.
- Inspect generated artifacts with available host rendering/browser tools. Reading the artifact must not require an HTTP server. Distinguish artifact checking from product runtime evidence; record unavailable host checks honestly.
- Use the repository's broad portable acceptance script as the acceptance backstop unless an explicit alternative is independently assessed. Preserve pre-existing or environmental failures separately from implementation findings.
- Prepare a current candidate, run actual Verification, and request one fresh independent consolidated acceptance assessment through GateReeve. Additional review is driven by consequential uncertainty or supported failures, not an automatic council or fixed retry count.
- **Final step:** evaluate the full rubric, reconcile issues/tracker/decisions, and produce the completion/acceptance report and review packet. PR presentation and later merge/release remain subject to the existing workflow and separate authority.

## Coverage

| Rubric | Planned evidence |
|---|---|
| R1 | P1/P2 replacement and source resolution; P3 standalone examples; P4 dual-package inventories/discovery |
| R2 | P1 instructions; P3 real-change explanations checked against raw source |
| R3 | P1 visual guidance; P3 UI/non-UI/missing-capture examples and interaction inspection |
| R4 | P1 discovery guidance; P3 non-default attachments and stale/missing evidence exercises |
| R5 | P1 invocation boundaries; P3 tool/action records and concern/evidence output inspection |
| R6 | P1 artifact guidance; P3 desktop/phone, controls, destination/preservation checks; P4 portability |
| R7 | P1 contract; P2 narrow naming recognition; P3 governed input/output comparison; P4 boundary regression |
