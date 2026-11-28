# Decisions - tb-review-progress-retention

**Feature start:** 2026-11-27

Permanent record of decisions promoted from `scratchpad.md` and
`interview.md` at the PR boundary. Rigor full; autonomy supervised, then
mandated by Trent after he approved the spec.

## DEC-1. Claude stays on the schema path through stream-json

- **Answered by:** agent (empirical check)
- **Decision:** Claude Code reviewers run with `--output-format stream-json
  --verbose` and keep `--json-schema`. The stream's last `type: result` event
  carries `structured_output`, `session_id`, `usage` and `total_cost_usd`, as
  the `json` envelope did, so no second capture path is needed. A Verification
  receipt runs the installed Claude Code to confirm it, and three live
  boundary rounds ran on it.
- **Alternatives:** keep `json` and capture activity another way.
- **Reversibility:** easy.
- **Source:** interview D1, scratchpad [1].

## DEC-2. Retained activity: five objects referenced from `activity`

- **Answered by:** agent; exact-prompt retention from the Codex design review
  round 1.
- **Decision:** Each launched attempt retains a `review-activity/1` object
  referencing the exact sent prompt, instructions, input, schema and raw
  stdout, referenced from the review record's `activity` field, never from
  `artifacts`, so it never reaches a later reviewer.
- **Reversibility:** additive record field.
- **Source:** interview D3-D5, scratchpad [3].

## DEC-3. Event streams are retained raw

- **Answered by:** human (Trent): "Retain raw (Recommended)".
- **Decision:** Tool-result bodies stay in the retained stream and are
  harvested with `objects/`.
- **Source:** interview D6, scratchpad [2].

## DEC-4. Watch view, output limit and progress lifetime

- **Answered by:** agent
- **Decision:** A read-only `review.progress` operation behind `gatereeve
  review watch`; a 64 MiB output limit, equal to the store's object limit;
  finished progress files pruned after 24 hours.
- **Source:** interview D7-D9.

## DEC-5. Failed planning attempts keep planning semantics

- **Answered by:** agent; record kind from boundary round 1 (codex/F2).
- **Decision:** A planning review that fails after launch still fails and
  writes no `PLANNING_REVIEWED` event; its activity is referenced from a
  `planning-review` record marked `failedAttempt`, linked by an `artifact`
  observation.
- **Alternatives:** an UNAVAILABLE `PLANNING_REVIEWED` (would supersede a
  cited PASS); a new event type (older readers refuse it).
- **Source:** scratchpad [6].

## DEC-6. Run folders are never committed (amendment A1)

- **Answered by:** human (Trent): "Fold (a) into #147"; key: "Normal PR, no
  rewrite"; commit policy: "Never commit; remove copies"; then "a" (relocation
  separate).
- **Decision:** Per-run and root `.gitignore` ignore everything in a run
  folder except its `.gitignore`; the committed copies on the base, including
  a `runner-comparison.key`, are removed without a history rewrite. Moving run
  stores outside worktrees is #173; a harvest-gated sweep is #174.
- **Source:** spec Changes A1, scratchpad [5].

## DEC-7. Failure categories never read the reviewer transcript

- **Answered by:** agent, from boundary round 1 (claude-code/F2)
- **Decision:** A failed provider run is classified from stderr and the
  stream's error and result events only, for both adapters.
- **Source:** scratchpad [7].
