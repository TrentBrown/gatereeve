---
name: pr-explainer
description: Create a self-contained HTML explanation of a PR, branch diff, commit range, or local changes for an engineering reviewer. Use for a source-linked walkthrough with appropriate visuals and existing test evidence.
---

# PR Explainer

Prepare an experienced engineer unfamiliar with this area to examine the change. Explain its purpose, resulting behavior, mechanism, supporting evidence, and where to look closely. Generate one HTML artifact; leave the review verdict to the reader.

## Establish what is being explained

Resolve the requested repository and comparison before drawing conclusions. Read the PR's stated base/head and intent, or resolve the supplied Git refs. Read the full scoped diff and relevant surrounding code. Do not check out another branch, stash changes, or edit the source to investigate it.

Record full base/head identities. For local work, include the relevant staged, unstaged, and untracked changes and identify the reviewed working-tree snapshot, not merely HEAD. If scope or source identity is unresolved, clarify it rather than silently comparing a different change.

Use supplied design, plan, spec, issue, and decision records to establish intent and the part this PR delivers. Investigate directly relevant context; do not turn this into a repository audit. Missing supporting documents are a visible gap, not a reason to invent requirements or refuse an otherwise explainable change. Label inferred intent and rationale.

Ordinary use needs no GateReeve run. When a governed candidate or output destination is supplied, read [the invocation contract](references/invocation-contract.md) and use those authoritative inputs rather than substituting the live branch or another feature.

## Gather existing evidence

Distinguish tests added/changed, checks actually run, retained execution output, author-reported results, and observed runtime behavior. Identify which revision a result covers when known. A test's presence does not establish that it ran.

For visible behavior, deliberately look for existing screenshots and useful report, trace, or video attachments. Follow actual test/report/CI configuration and relevant evidence links, including ignored output directories; do not stop at absent default folders. Read [visual-evidence discovery](references/visual-evidence.md) for that investigation and qualification.

Use existing evidence by default. Do not run product tests, start the application, create fresh product-browser captures, change tests/CI, fix product code, post comments, or perform delivery actions. Additional evidence collection requires an explicit request within existing permissions. Checking the generated HTML itself is part of producing the artifact.

## Explain the change

Read [artifact composition](references/artifact.md) before generating HTML. Choose the page's shape for this change; these are responsibilities, not mandatory sections:

- Give the relevant domain/system context, problem, intended behavior, and delivered scope.
- Show meaningful before/after behavior or structure where useful. Distinguish observed captures from source-grounded diagrams and illustrative models.
- Explain how the parts work together in a logical reading order. Place selected annotated code/diff excerpts beside the explanation, with precise revision-bound source links or path/line references. Account for consequential changes outside the excerpts in the scope overview or reading guide.
- Explain what the available evidence covers and what remains unknown. Link raw evidence without making the page a log dump.
- Surface consequential assumptions, tradeoffs, and possible defects/spec mismatches as reviewer concerns with sources and uncertainty. Do not expand into a separate review, assign an approval verdict, or recommend merging.

Create useful diagrams and walkthroughs from the actual code even when runtime screenshots are unavailable. Do not fabricate product screenshots. Avoid fixed figure quotas, compulsory simulations, confidence scores, metrics dashboards, and unrequested quizzes. A quiz is optional when requested.

## Deliver

Honor an explicit destination. Otherwise use `pr-explainer.html` in the existing feature artifact directory or another durable task-owned output location. Choose a distinct change/revision directory when necessary; do not overwrite an unrelated artifact. Do not use a global temporary directory as the durable destination.

Make the HTML self-contained for reading, including styles, scripts, diagrams, and selected screenshots. Link bulky raw recordings/traces and source material as references. No external rendering plugin, network-loaded assets, or server is required to read the explanation.

Inspect the actual artifact at desktop and phone widths and exercise included controls, including keyboard use, with available host tools. Fix broken layout, references, or interactions. State any unavailable checks honestly. Follow the host's display rules; no automatic publication or hosting.

Return the artifact path, explained revision/snapshot, and material evidence or inspection limitations. Generating this page does not grant review acceptance or GateReeve passage.
