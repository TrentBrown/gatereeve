# Decision Scratchpad - tb-convergence-severity-calibration

**Feature start:** 2026-11-27

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1. Rigor full, goal autonomy

- **Answered by:** human
- **Decision:** Full rigor with goal autonomy, relayed from the coordinating
  thread: "Trent granted goal autonomy for tonight's work and is asleep, so use
  the agentic-development-workflow `goal` skill and work unattended to a ready,
  unmerged PR without asking the human." Planning decisions are
  `autonomous-evaluator` decisions citing independent planning reviews.

## S2. Design approved by autonomous judgment at planning round 5

- **Answered by:** agent
- **Decision:** The design planning review (Codex gpt-6-sol, high) failed in
  rounds 1-5. Rounds 1-3 found real gaps, all fixed (whole-run grandfathering,
  docs bar lowering brief requirements, inconsistent wording). Rounds 2, 4 and
  5 then disagreed with each other on resumed runs: round 2 objected to
  grandfathering an unverifiable resumed spec, round 4 required the warning
  the source D11 settled for a resumed run on an old spec, and round 5
  objected to the resulting exemption. Round 6 would hand back (park). The
  design was approved under `autonomous-evaluator` authority with a recorded
  judgment: round 5's finding is accepted residual risk (it needs a
  resumption approval that misstates what the human approved), and the spec
  narrows it further (S3).
- **Alternatives:** park at round 6 for Trent (rejected: the open question is
  settled input from D11, not a new defect); drop the resumed-run warning
  (rejected: contradicts D11, round 4).
- **Reversibility:** high; the resumed-run rule is one condition in
  `core.js`.

## S3. Only an implementation approval grandfathers a spec on resumption

- **Answered by:** agent
- **Decision:** `run.resume-current` grandfathers the spec it validates only
  when the supplied `planning.implementation` approval names the current
  commitments, whose identity includes the exact spec bytes. A design-only
  resumption does not grandfather (round 5's concrete hole: a design approval
  does not bind the spec).
- **Alternatives:** any resumption approval grandfathers (rejected: a design
  approval does not cover spec bytes); no resumption grandfathers (rejected:
  D11).
- **Reversibility:** high.

## S4. Requirement identifiers are not numeral bounds

- **Answered by:** agent
- **Decision:** The numeral bound ignores requirement identifiers (`AC1`,
  `R2`, `I-3`, `D4`, `P5`); otherwise every AC heading and rubric row would
  carry a numeral and pass the lint. Other numbers (counts, values such as
  `42`) count as a bound, as D4 decided.
- **Alternatives:** count only numbers next to a unit or comparator
  (rejected: guesswork the lint cannot get right).
- **Reversibility:** high; one regular expression.

## S5. Instruction builders exported for tests

- **Answered by:** agent
- **Decision:** `execution.js` exports `evaluatorInstructions` and
  `delegation.js` exports `planningInstructions`, so tests assert the exact
  text each reviewer receives. No other change to those modules beyond the
  instruction text and `REVIEW_CONTRACT_VERSION`.
- **Alternatives:** assert through a fake reviewer request only (kept for the
  light path in `current-light.test.js`; the unit test is more direct).
- **Reversibility:** high.

## S6. Boundary round 1 fixes

- **Answered by:** agent
- **Decision:** Paired review round 1 (Codex, Claude) findings, all fixed:
  - A fresh start through `run.resume-current` (nothing to resume) no longer
    grandfathers; only resuming an active run or a retained activation with an
    implementation approval does (Codex F1).
  - `TODO` inside a fenced example no longer marks the Failure model section
    unresolved (Codex F2).
  - Local Verification now also runs the desktop contract check and the
    smoke fixture (Codex F3).
  - The portable lint has a test (Claude F1).
- **Reversibility:** high.

## S7. The portable lint gets a warn mode for CI record checks

- **Answered by:** agent
- **Decision:** `lint_spec.py` keeps applying the failure-model rules as
  failures (spec AC5). A `--specification-rules=warn` option reports them as
  warnings instead. CI's review-artifact validation and the
  portable-acceptance check of `workflow-state-machine-cli` pass it: they
  check records of feature homes that may hold a spec `spec.validate`
  grandfathered (an in-flight run's evidence-only push), and enforcing there
  would fail CI for specs the protocol accepted with warnings (Claude F1 and
  F2). Rule enforcement stays with `spec.validate`.
- **Alternatives:** enforce in CI (breaks in-flight runs such as #142 and #144
  once this merges); add failure models to every old feature home (rewrites
  dozens of historical records); no portable enforcement (contradicts AC5).
- **Reversibility:** high; two CI lines.

## S8. Boundary round 2: one CommonMark fence rule for extraction and rules

- **Answered by:** agent
- **Decision:** Codex round 2 found that a three-backtick line closed a
  four-backtick fence, so a sample `## Failure model` heading inside a longer
  fence counted. Class: fence tracking that ignores the opening run's length.
  Sites (searched `planning.js` for fence matching): the new rules pass and
  the existing fact extractor `planningFacts`. Both now use one `fences`
  helper: a fence closes only on a run of the same character at least as long
  as the opening run, with nothing else on the line. Tests cover the rules
  pass and extraction (sample AC inside a longer fence; unclosed longer
  fence).
- **Alternatives:** fix only the new rules pass (leaves the extractor
  disagreeing with the rules, which the first test run showed).
- **Reversibility:** high.

## S9. Boundary round 3: indented headings; CI lint receipt

- **Answered by:** agent
- **Decision:** Codex round 3: section headings indented up to three spaces
  (and closed ATX headings) now count as headings for the Failure model check,
  the linted sections and section ends; four spaces is code, as in
  CommonMark. Local Verification gains a receipt that runs the changed CI
  record lints exactly as CI invokes them.
- **Reversibility:** high.

## S10. Boundary round 4: repeated sections linted; indented fence opening kept

- **Answered by:** agent
- **Decision:** Codex round 4 F2: a repeated `## Acceptance Criteria` (or
  `## Rubric`) section is now linted too; every matching section is read.
  Codex round 4 F1 (a four-space-indented fence line opens a fence, so an
  indented literal fence line can leave extraction "unclosed"): not changed.
  The base extractor opens fences at any indentation (`^\s*` in `planningFacts`
  before this change), so this is pre-existing behaviour, and restricting the
  opening to three spaces would stop recognising fences inside list items,
  which spec authors use. The scenario needs an unusual layout, and the
  failure is a reported refusal with a clear diagnostic, not a wrong pass.
  Claude round 4 low (setext headings do not end a section) is a follow-up.
- **Alternatives:** CommonMark's three-space limit (breaks fences nested in
  list items); full list-aware Markdown parsing (out of scope for a lint).
- **Reversibility:** high.
