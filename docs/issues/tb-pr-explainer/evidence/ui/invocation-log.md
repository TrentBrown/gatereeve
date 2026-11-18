# Independent UI forward trial

Invocation: “Explain GateReeve PR #42 for an experienced engineer unfamiliar with this desktop area. Make a reviewer HTML walkthrough using existing evidence.”

Skill read: `/Users/trent.brown/Code/tb/.worktrees/gatereeve-pr-explainer/plugin-src/shared/skills/pr-explainer/SKILL.md`, plus its artifact, visual-evidence, and invocation-contract references. Skill left unchanged. Personal supplied AGENTS rules respected; no Git history operations or hosting occurred. Ancestor instruction files checked; none found.

Repository: `TrentBrown/gatereeve`, worktree `/Users/trent.brown/Code/tb/.worktrees/gatereeve-pr-explainer`. Existing unrelated changes preserved. Base `1d10d6da7b4acac054c31e65993a2f03bcbf0ee3`; head `faa30266bf0b60a03ac2285017762f76faf52b63`. Live PR metadata confirmed that tuple. No working-tree code was substituted for the pinned product source. The uncommitted skill itself was read as the skill under test.

Actions and sources:
- Read pinned product diff and surrounding renderer, resolver, build/package, protocol/window, and native smoke source through Git. Retained raw product diff under `evidence/product.diff`; examined all changed lock entries semantically as JSON (105 entries).
- Read pinned design, spec, plan, decisions, tracker, authored evaluations, and PR verification record. Did not open the historical generated `pr-42/explain-diff.html`. Documents are source/evidence, not fresh verification.
- Retrieved PR metadata and CI run 33428783903; retained run/artifact metadata and Ubuntu 22.04 Desktop contract log. That log records 137 passing tests, no failures/skips, and a 421,335-byte renderer bundle.
- Important provenance distinction: the run names requested head `faa30266…`, but the checked-out source is synthetic merge `e691de0d6e4ddd81ebcbe46b08e63fe5900b7d9a`, explicitly merging that head into the supplied base. The HTML says this rather than claiming standalone-head execution.
- Followed visual producers: Desktop package scripts, production visual fixture, native optional screenshot path, CI upload configuration, relevant local Desktop/feature files including ignored outputs, and CI artifact list. No relevant retained capture/report/trace/video was found; CI artifact list is empty. No fabricated product screenshot used.
- Created self-contained HTML with editorial explanation, explicitly illustrative before/after sketches, pipeline walkthrough, selected exact-source excerpts, ordinary-link/footnote policy comparison, bundle/distribution scope, evidence qualification, and three narrow reading concerns. No approval verdict, score, or merge recommendation.
- Validated all source links against pinned Git paths and line bounds. HTML static checks found no duplicate IDs, unresolved internal anchors, or externally loaded assets. Three native details controls and four scrollable code blocks are present. `static-artifact-checks.json` records the result.

Limitations and remaining artifact inspection:
- Actual desktop/phone rendering and keyboard/control inspection are delegated to the parent, per its explicit message. The parent reports the host preview unavailable and will use its Playwright fallback. No render or interaction check is claimed in this child invocation. The Playwright skill/reference was read and `npx` availability checked, but no browser was started by this child.
- Author browser/network, deterministic digest, audit, and performance claims are retained narrative evidence; their record ends at earlier revision `a981e3ed…`. Native CI results are separate startup/package evidence, not Markdown visual proof.
- No product tests, app runs, fresh product captures, source edits, commits, PR comments/posts, workflow actions, publishing, or delivery actions occurred. All generated files are inside this trial directory.

Skill behavior observations:
- No material instruction problem encountered. The supplied contract preserved the exact comparison and existing-evidence boundary; artifact and visual-evidence references supported useful explanation despite absent captures.
- There is no bundled rendering checker in this skill directory; host artifact checks are required. The host-preview limitation is environmental, not a demonstrated skill defect.
- One initial shell inventory returned nonzero and short-circuited the paired skill read; it was immediately retried independently. One initial generated source-link range exceeded the CI file and was caught by the generator assertion; corrected before output. Neither caused product mutation.
