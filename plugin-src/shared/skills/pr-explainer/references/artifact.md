# Compose the reviewer artifact

## Put the mental model first

Assume engineering experience, not familiarity with this subsystem. Explain the few domain terms, existing responsibilities, and constraints needed to understand this change. Start with the problem and the resulting behavior, then lead into the mechanism and its consequences. Deeper context can be expandable.

Group files by the reason they changed. A request handler, its schema, and its tests may form one chapter. A large generated-file update may deserve one short scope note. Put consequential changes before wiring and housekeeping. Select excerpts to explain the mechanism; do not reproduce the full diff or omit material changes because they are awkward to explain.

Use plain language, precise examples, and short connected paragraphs. Say what a function or component does before introducing its name. Explain a decision's rationale only when the record supports it; otherwise label the inference. Cite old code against the base and new code against the head. When permanent source URLs are unavailable, give exact repository-relative paths and line references without inventing a link.

## Draw what helps this change

Choose the representation that exposes the relevant relationship:

| Change | Useful representation |
|---|---|
| Visible UI behavior | Existing captures with callouts; an explicitly illustrative UI sketch when captures are missing; a short interaction walkthrough |
| Defect fix | The triggering case, old path/result, and corrected path/result using the same example |
| Refactor | Before/after responsibility or dependency diagrams, with intended behavior preservation stated |
| API or schema | Request/response or data-shape comparison, affected consumers, and compatibility consequences |
| State/lifecycle or retries | States and legal transitions; a replay that exposes the relevant event order |
| Infrastructure/configuration | Request/routing/configuration flow, changed boundary, and operational consequence |
| Pure logic | A worked example or stepper that exposes intermediate values |

Diagrams explain mechanisms, not just component names: label meaningful arrows with actions and use concrete sample data where useful. Reuse the same layout or example for comparisons. A simulation uses real extracted logic only when that is practical without running the product; otherwise label it as a simplified explanatory model and state its omissions. It is not evidence that the implementation ran.

Use screenshots as captured evidence only under [the evidence rules](visual-evidence.md). An HTML overlay or adjacent callout can annotate a capture without altering its original meaning. Keep the raw capture available. Do not synthesize an image and present it as a screenshot.

Missing screenshots do not remove the visual explanation: show the actual source-grounded mechanism, relevant structure, or event sequence, and state the runtime-evidence gap. Do not force a before/after comparison when only one side is known; label the known side and explain the other from source with that distinction visible.

## Keep the evidence understandable

Place supporting evidence near the claim it supports. A short evidence area can distinguish:

- Tests introduced or changed and the behavior they exercise.
- Retained command/CI output and the revision, environment, or run it identifies.
- Runtime observations supported by captures or traces.
- Author-reported results without matching retained output.
- Missing evidence, stale results, and contextual limitations.

An absent spec is not a fabricated spec. A passing test is not proof of all behavior. A screenshot is not proof that a database write or external side effect completed. Surface those distinctions where they affect the reviewer's understanding rather than attaching a generic warning checklist.

Give reviewer concerns a precise description, source, and reason to examine them. Distinguish a demonstrated contradiction from a plausible concern. Do not turn the page into a bug-hunting report or use an overall PASS/FAIL, approval score, or merge recommendation. A reading guide can direct attention to a few consequential paths and decisions.

## Make the file work on its own

Write one HTML document with embedded CSS, JavaScript, SVG/diagrams, and selected image bytes. Use installed/system fonts or embedded font data. Reading must not require a CDN, local image files, an installed diagram library, a server, or an external plugin. Source and raw-evidence links are references and may require their usual access; mark unavailable or nonportable references honestly. Link large video/trace bundles rather than embedding them by default.

Keep the main explanation readable as a continuous page; use proportionate navigation and optional expandable detail. Do not impose a fixed section count or top-level tab interface. Use semantic headings and native buttons/details for controls. Give figures captions, images useful alt text, controls visible labels, and dynamic results an accessible announcement when appropriate. Encode meaning with text/shape as well as color.

Make layouts reflow on phones. Keep code in `pre`/`code` with preserved whitespace and a bounded scroll area; wrap long paths. Avoid clipping meaningful labels or shrinking them to fit a desktop diagram. Controls must work from the keyboard and retain visible focus. Honor reduced-motion preferences; animate only when motion explains something.

Inspect the rendered result at a normal desktop width and a phone width, and operate every included control. Validate actual links and source references against the examined change. Do not claim an unavailable render/interaction inspection occurred, or rerun product tests to compensate. Use the host's supported artifact renderer/browser; no server is needed for this file.

## Provenance without clutter

Include a compact source/evidence note with repository, PR or comparison, full base/head or local snapshot identity, generation time, known missing inputs, and the meaning of conceptual versus captured visuals. A reader should be able to tell whether the artifact describes the revision they intend to review. Do not imply that a static artifact stays current after a push.

The principles here draw on [visual-explainer](https://github.com/nicobailon/visual-explainer) and [Plannotator guided-review](https://github.com/plannotator/guides). This skill does not require either toolkit.
