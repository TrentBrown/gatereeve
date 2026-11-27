# Decision Scratchpad - tb-review-self-validation

**Feature start:** 2026-11-26

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1. Rigor full, goal autonomy

- **Promoted:** DEC-1 in `decisions.md` (2026-11-26)

- **Answered by:** human
- **Decision:** Full rigor (issue #150's "standard" maps to full; GateReeve has
  only full and light) with goal autonomy, relayed from the coordinating
  thread: "Trent granted goal autonomy for tonight's work and is asleep, so use
  the agentic-development-workflow `goal` skill and work unattended to a ready,
  unmerged PR without asking the human." Planning decisions are
  `autonomous-evaluator` decisions citing independent planning reviews.

## S2. A missing incorporated document fails the dependent criterion

- **Promoted:** DEC-6 in `decisions.md` (2026-11-26)

- **Answered by:** agent
- **Decision:** Design review round 1 (Codex, high) found that a non-blocking
  note for an unincluded document could let a PASS skip a required document.
  The note stays non-blocking for the reviewer outcome (issue #142), but a
  selected criterion that cannot be judged without the document is failed with
  evidence naming it. Design item 6, interview D5 and spec AC7 updated.
- **Alternatives:** make any note block (rejected: issue #142 asks for a
  non-blocking note, and most links are context); raise the bounds only
  (rejected: does not address a missing file).
- **Reversibility:** one instruction sentence.

## S3. Spec review round 1 fixes; the server runs under Node's permission model

- **Promoted:** DEC-8 in `decisions.md` (2026-11-26)

- **Answered by:** agent
- **Decision:** Spec planning review round 1 (Claude, three medium blocking
  findings) asked for a consistent AC1/AC5, rubric rows that check every
  stated instruction (dependent-criterion rule, external links, after-merge
  instruction, transient retry), and real evidence that the tool is
  read-only. The spec now states the Definition of Done trigger phrase and
  contents, the exact adapter additions and the guidance in
  `commands/pr-review.md`. For read-only evidence, the server is launched
  under Node's permission model (`--permission`, read access only to the
  protocol resources and its context file, no write, child-process or worker
  allowance), so a write or spawn would be refused at runtime, not only
  absent from the code. Under Electron (no permission flags supported in its
  Node mode) the flags are omitted; the desktop does not run reviews.
- **Alternatives:** static import checks (rejected: the shared module graph
  legitimately imports modules that can spawn elsewhere); a temp-directory
  diff only (rejected by the review as insufficient).
- **Reversibility:** launch flags only.

## S4. Test methods beyond unit tests

- **Promoted:** DEC-10 in `decisions.md` (2026-11-26)

- **Answered by:** agent
- **Decision:** Besides the CLI tests, the real Claude Code and Codex CLIs were
  each run once through GateReeve's own adapters with the exact
  self-validation launch (permission flags included): both called
  `validate_verdict` from their read-only sandboxes and returned the error it
  reported (`review.summary is required`). The launch was also checked on
  Node 22 (the oldest supported line) as well as Node 24. These are smoke
  checks, not committed tests: they need provider credentials and spend
  tokens.
- **Alternatives:** CI-only evidence with fake adapters (rejected: it cannot
  show the provider CLIs accept the MCP configuration).
- **Reversibility:** none needed; no repository change.

## S5. Local verification leaves host-dependent tests to CI (revised after round 1)

- **Promoted:** DEC-11 in `decisions.md` (2026-11-26)

- **Answered by:** agent
- **Decision:** The local broad receipt runs the CLI suite without
  `local-agent-idle-inhibitor.test.js` (hangs on macOS),
  `scratch-cleanup.test.js` (host installer-root ownership, #159) and
  `metrics-repair.test.js` (`Unsafe metrics directory` on this host). Each is
  recorded as failing or hanging the same way on unmodified `main` on this
  host (earlier runs and #159), and this change does not touch their code. Hosted Ubuntu acceptance runs them.
- **Revision (review round 1, Claude EV1-EV3):** those files are affected
  suites, so verification now also runs `metrics-repair.test.js` (it passes
  here now), `local-agent-idle-inhibitor.test.js` with only its three
  hanging wrapper-signal tests skipped by name (`ignores SIGTERM`,
  `interrupting the evaluator`, `closes its streams`), the desktop test suite,
  and `plugin validate` and `plugin build` (round 1, Codex). The original
  broad receipt is kept unchanged so its identity stays covered.
- **Alternatives:** keep them and accept a failing local receipt (rejected:
  unrelated host conditions).
- **Reversibility:** verification configuration only.

## S6. The incorporated-documents set is part of every full-rigor review input

- **Promoted:** DEC-9 in `decisions.md` (2026-11-26)

- **Answered by:** agent
- **Decision:** Every full-rigor independent execution records
  `incorporated` (possibly empty), and the reuse comparison includes it. A
  result retained before this change has no such field, so it is not reused
  after upgrade; the evaluator instructions changed too, so such results
  would not be reused anyway (as with PR #152 and PR #158).
- **Alternatives:** record the field only when non-empty (rejected: an
  emptied link list would then compare equal to "never computed").
- **Reversibility:** one comparison.

## S7. Mandate-assessment format repair left to #167

- **Promoted:** DEC-12 in `decisions.md` (2026-11-27)

- **Answered by:** agent
- **Decision:** The coordinating thread reported a review UNAVAILABLE with
  `Format repair must preserve mandate assessment`. `validateFormatRepair`
  still compares `mandateAssessment` by identity, so a repair cannot supply
  an omitted assessment. Changing it alters the repair contract beyond this
  spec (an amendment), so it is filed as #167 and not folded in.
- **Alternatives:** fold it in with a spec amendment (rejected: widens a PR
  already in review rounds).
- **Reversibility:** a separate small PR.

## S8. Review round 1 fixes

- **Answered by:** agent
- **Decision:** Fixed codex/incorporated-parenthesized-link (high): link
  destinations now keep balanced parentheses, angle brackets and backslash
  escapes (CommonMark), with tests. Addressed claude-code/L1 (low): the tool's
  corrections include the execution-level ones known before launch (a dropped
  stale claim). claude-code/L2 (low): PROTOCOL.md names the Codex server's
  environment entry. Evidence findings (codex/missing-boundary-build,
  claude-code/EV1-EV3) are answered by the added checks in S5. The Codex
  mandate assessment was UNAVAILABLE because the PR description is not in
  the pinned evidence; the decisions it asks to see are DEC-1 to DEC-12 here,
  and the PR description lists them under "Decisions made for you".
- **Reversibility:** code and verification configuration.

## S9. Review round 2 fixes

- **Answered by:** agent
- **Decision:** Fixed codex/nested-parenthesized-link (high; Claude rated the
  same class low as N1, so the pair records high): inline link destinations
  are now read by a scanner that balances parentheses at any depth, honours
  backslash escapes and angle brackets, and ignores an unbalanced
  destination, with tests for nested and deep cases. The Codex mandate
  assessment was UNAVAILABLE because the PR description is not in the
  pinned evidence, so `decisions.md` now records what it contains.
- **Reversibility:** code only.

## S10. Review round 3 fixes; the PR state is observed by verification

- **Answered by:** agent
- **Decision:** Fixed codex/nested-markdown-link-label (high): inline links
  are found from the `](` that closes their label, so label content never
  hides a link; reference-definition labels accept escaped brackets; tests
  added. For the Codex mandate assessment (UNAVAILABLE: the PR state was only
  an implementer note), the PR was marked ready for review and a
  verification check observes it with `gh pr view` (number, state, draft
  flag, base, merged time, body), giving a retained receipt. Claude's round 3
  delta was refused because the agent decision entries changed after its
  prior PASS, so round 4 runs both reviewers in full.
- **Alternatives:** keep parsing labels (rejected: each nested form is a new
  edge case); leave the mandate UNAVAILABLE (rejected: not adjudicable).
- **Reversibility:** code and verification configuration.
