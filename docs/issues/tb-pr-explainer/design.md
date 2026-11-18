# Design - tb-pr-explainer

**Status:** approved by the human on 2026-11-18. Specification drafting is authorized; implementation is not yet authorized.

## Problem

Human reviewers need to understand a pull request's purpose, behavior, implementation, and available evidence before they can examine it effectively. A file-ordered diff and a terse PR description often make the reviewer reconstruct this context manually.

GateReeve already ships `explain-diff`, but its fixed beginner background and five-question quiz do not match the agreed default audience. Its instructions also lack the explicit connection among intended behavior, actual changes, evidence, and reviewer concerns requested here.

## Intent

Evolve that capability into `pr-explainer`, owned at `plugin-src/shared/skills/pr-explainer/`. The skill produces a portable HTML explanation for an experienced engineering reviewer unfamiliar with the changed area. It should make a consequential change understandable without requiring the reviewer to discover its reading order or search for all supporting context first.

Settled product decisions and the requested revisions are recorded in `interview.md` D1-D12. The approved shape includes the output and visual-evidence discovery behavior below. The first delivery is the replacement skill and its integration contract. Making the artifact mandatory in GateReeve is a separate follow-up.

## Chosen shape

### A standalone skill with optional governed context

Support a specified PR, branch comparison, commit range, or local change. Resolve the actual repository, comparison base, and reviewed revision before describing the change. Ordinary use works without a GateReeve run or workflow documents. For uncommitted work, explicitly identify the working-tree snapshot rather than suggesting it is a committed revision.

When a governed caller supplies a candidate, use its exact source identities, retained requirements, available evidence, and output destination. Do not switch to another branch, feature home, or newer live revision silently. A later invocation that intentionally refreshes the explanation records the newly explained revision.

### An explanation organized around reviewer understanding

Begin with a clearly labeled executive summary: a substantive, plainspoken overview of the problem, meaningful change, high-level mechanism and scope, and the most consequential evidence limit or reviewer consideration where material. A reader should understand the central story without first opening code details. Consider one or two overview diagrams where they provide the clearest orientation; this is guidance, not a figure quota.

After that opening, the artifact addresses five responsibilities, with page structure and depth adapted to the actual change:

- **Purpose and scope:** explain the problem, intended behavior, and portion of the feature delivered by this PR. Use the design, plan, specification, issue, and decision records when available. Identify inferred intent and missing or conflicting sources.
- **Behavior:** show before and after where useful. Bug fixes show the problematic and corrected case; refactors explain structural changes and the intended behavioral equivalence; API, data, configuration, and infrastructure changes use the corresponding contracts, transitions, or operational effects. An explanatory model is clearly distinguished from an observed runtime capture.
- **Mechanism:** explain the relevant existing context and how the change works. Group changes by logical purpose, then show selected annotated code or diff excerpts beside the explanation. Cite the reviewed revision and link to the full change. Material changes outside the excerpts remain visible in the scope overview or reading guide.
- **Supporting evidence:** describe tests added or changed, what those tests exercise, checks actually run, and existing runtime observations. Link the available evidence, state its source/revision where known, and distinguish author-reported results from retained execution output. Missing or mismatched evidence remains a visible limitation.
- **Reviewer attention:** identify consequential choices, assumptions, compatibility implications, possible defects, and mismatches with intent. Concerns carry source references and distinguish observed facts from hypotheses. Suggest a reading path into the important implementation details. Leave approval and merge judgment to the reviewer.

The skill does not initiate a separate code review or apply fixes. An ordinary invocation gathers existing source and records and generates the artifact; it does not run product tests, launch the application, or create fresh product-browser captures. An explicit request can authorize additional evidence collection within the task's existing boundaries.

### Deliberately discover existing visual evidence

For changes whose visible behavior matters, actively look for useful captures from existing end-to-end tests and review records. Begin with caller-supplied evidence, the relevant test cases, Playwright configuration, and CI artifact-upload configuration. Follow their actual output locations and attachments rather than assuming screenshots are committed beside the tests or stopping when a default directory is absent.

The focused search can include configured test-output directories, HTML/JSON/blob reports and their attachments, screenshot snapshot folders, retained traces and videos, feature evidence directories, PR attachments, and artifacts from relevant CI runs. Names such as `test-results/` and `playwright-report/` are starting hints, not universal contracts. Prefer the run and test that exercised the changed behavior; use existing authorized access and retrieve only relevant artifacts into task-owned storage.

Inspect the selected images and captions against the behavior being explained. Record their source test/run and revision where available. Distinguish expected baseline images, captured actual results, and generated image differences. Do not assume a configured screenshot option produced a useful capture, that a failure screenshot represents the successful flow, or that a baseline is an observed capture of the PR base.

For a before/after comparison, establish which behavior and revision each image represents and note relevant differences in scenario, data, or viewport. When that relationship cannot be established, label the image as contextual or unverified for this comparison. Missing, expired, inaccessible, or irrelevant captures are explicit evidence gaps. Do not substitute screenshots of a different revision as if they demonstrated the current candidate.

Embed selected existing screenshots in the HTML where they help the explanation, with concise captions and evidence references. Link bulky recordings and trace bundles rather than requiring all raw evidence to be embedded. When relevant existing trace captures can be read with available tools, they may supply illustrative frames; this does not rerun the product or create new runtime evidence. Preserve the original evidence and its meaning when annotating an image.

Screenshots are only one visual source. Create diagrams, before/after structures, state walkthroughs, and other source-grounded illustrations when they reveal the mechanism or behavior. Label these as explanatory representations rather than captured product screens. Lack of runtime screenshots must not turn the page into a prose-only summary or lead to invented screenshots. Enhancing tests or CI to capture better artifacts is follow-up work, not part of an ordinary invocation or this first skill delivery.

### A readable, portable HTML artifact

Generate one self-contained HTML file, including its styles, scripts, and necessary visual assets. Source links can open external material, but reading the explanation itself does not depend on a live server or external rendering toolkit. Reuse diagrams, visual motifs, and examples where doing so helps the reader follow the same mechanism across cases.

Use prose, figures, annotated excerpts, and interactions according to their explanatory value. Mermaid is an authoring option throughout the explanation, including the executive summary: render it during generation and embed the rendition, preferably inline SVG. Do not require raw Mermaid source or a Mermaid runtime to render at reading time. Use interactive HTML when it clarifies a relationship, event order, or choice; keep the core overview understandable without operating a control. A state stepper or before/after control is appropriate when it reveals something difficult to grasp statically. Fixed section counts, visual quotas, mandatory simulations, and the old mandatory quiz are removed. Quizzes remain available when requested. Scores, review-performance metrics, and dashboards are excluded.

The page supports desktop and phone widths, semantic navigation, keyboard-operable controls, readable code blocks, and visual encodings that do not rely on color alone. Optional depth can be expandable; the main explanation remains readable as a continuous page.

Check the generated HTML for structural problems and inspect its rendering and any interactions. This checks the explanation artifact; it does not create new evidence about the product being explained. Do not claim that a rendering or interaction check occurred when the host could not perform it.

### Replacement and packaging

`pr-explainer` fully replaces the distributed `explain-diff` skill. Remove the old skill entrypoint; do not ship a compatibility alias or a second invocation path. Update current skill references, inventories, relevant usage documentation, and packaging checks to the new name.

Honor an explicit output destination first. Use `pr-explainer.html` as the new default artifact name in an appropriate durable task-owned output location. For a governed invocation, use its authoritative destination. Update current artifact-name references necessary for the replacement without introducing a mandatory HTML gate. Retained historical records and previously generated files remain historical evidence; no migration or rewriting of them is required. Preserve prior artifacts belonging to different changes unless replacement is requested. Report the exact source revision inside the page.

Use the repository's canonical shared tree and existing Codex/Claude packaging. Do not modify installed caches or introduce a separate skills repository. Draw on visual-explainer and guided-review principles without requiring those plugins to be installed. Preserve applicable attribution if their material is copied.

### A defined future GateReeve interface

The later caller supplies the selected repository/candidate, base and head or snapshot identity, relevant requirement documents, available evidence references, and intended output path. The skill returns the artifact path and identifies the source it explains, missing inputs, and limitations. The HTML contains this provenance in a compact human-readable form; no new machine-enforced schema or gate is introduced here.

Existing acceptance behavior, required gates, authority, and artifact retention remain governed by the current protocol. This delivery does not make HTML mandatory, change passage conditions, grant authority, or publish an artifact to a PR automatically.

### Demonstrate the result on representative changes

Exercise the skill against permitted read-only snapshots representing different change types, including cases with discoverable existing visual evidence and missing supporting records. Assess whether the explanations match the actual changes, provide useful context, show meaningful before/after behavior where appropriate, cite the source correctly, distinguish evidence from inference, and avoid an approval verdict. Include evidence located through project configuration or report attachments rather than supplied directly, plus a stale or insufficient capture that must not be presented as proof of current behavior.

Inspect generated HTML at desktop and phone widths and exercise any included interactions. Run the repository's relevant skill, inventory, packaging, and portability checks. A fresh independent acceptance assessment examines the implementation and examples against the later approved spec. Exact examples and checks will be selected during specification and planning; this is not a metrics program.

## Alternatives considered

- **Start a personal skills repository:** rejected by the user for this delivery. The existing canonical location and distribution are suitable.
- **Keep an explain-diff compatibility entrypoint:** explicitly rejected by the user. Ship pr-explainer as the replacement and update current callers.
- **Install visual-explainer unchanged:** useful inspiration, but its broad remit and strong visual prescriptions do not provide this specific reviewer contract or existing GateReeve compatibility.
- **Generate a complete diff viewer:** rejected in favor of selected annotated excerpts and links, with overall change scope still accounted for.
- **Produce review findings and an approval verdict:** rejected in favor of a human-oriented explanation that surfaces concerns without taking over the review decision.
- **Add mandatory workflow enforcement immediately:** explicitly deferred until the standalone skill has been tried on real PRs.

## Constraints

- Preserve the settled audience, existing-evidence default, and concern-handling boundary from the interview.
- Do not invent intended behavior, observed results, source references, screenshots, or rationale. Missing supporting documents do not prevent an honest explanation of a resolved change; an unresolved comparison requires clarification.
- Do not conceal consequential changes through selective excerpts or treat explanatory diagrams as product execution evidence.
- Scope investigation to understanding this change and its relevant context. Keep the invocation proportional to the change rather than broadly auditing the repository.
- Keep ordinary invocation portable outside GateReeve. Governed inputs remain authoritative when supplied.
- Discover and inspect relevant existing visual artifacts deliberately; do not assume that test runs always capture useful screenshots. Create faithful explanatory visuals even when captured evidence is unavailable, with their evidentiary status clear.
- Do not change product tests or CI capture settings to generate missing visual evidence in this delivery. Capture improvements remain a follow-up.
- No metrics feature, automatic product verification, product-code fixes, PR posting, merging, deployment, or mandatory workflow gate in this delivery.

## Open risks

- An attractive explanation can misstate the code or overstate weak evidence. Source grounding, explicit inference, and example review address this risk; they do not prove every explanation is correct.
- Selective excerpts can omit important behavior. The scope overview and reviewer reading guide must account for consequential changes beyond those excerpts.
- Source links, candidate revisions, and evidence can diverge. Preserve the explained identities and make mismatches visible rather than silently describing a different revision.
- Renaming the skill and its default artifact can leave live references behind. Update current integration points and validate the packaged skill inventory while preserving historical records.
- Existing end-to-end artifacts may capture only failures, be expired, or lack trustworthy revision/scenario context. Inspect and qualify selected evidence, report gaps, and use source-grounded diagrams for explanation rather than inventing captured behavior.
- Generated HTML can be inaccessible or contain broken interactions. Validate the actual artifact and report host limitations honestly.

## Changes

### R1 - Replace the old skill and strengthen visual-evidence discovery

The user selected "Revise the design first" and instructed: "Remove the requirement to keep Explain-Diff around. Our new skill is meant to fully replace that." They also raised the availability of useful Playwright screenshots and delegated the discovery approach, with test enhancements considered follow-up work.

Removed the compatibility entrypoint and legacy default-output requirement. Added explicit discovery and qualification of existing test/report/CI visual artifacts, source-grounded explanatory visuals when captures are absent, and representative validation of that discovery behavior. The existing-evidence default and deferred workflow enforcement are unchanged. The prior draft fingerprint was `sha256:7a6cd6f3265374da7b3cdb09d5d3c1f0cdeba32603df73427ab52d709eb657b9`; it was not approved.
