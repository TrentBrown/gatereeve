# Decision Scratchpad - tb-review-progress-retention

**Feature start:** 2026-11-27

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## [1] Claude stays on the schema path via stream-json

- **Answered by:** agent (empirical check, 2026-11-27)
- **Decision:** Switch Claude Code reviewers to `--output-format stream-json
  --verbose`, keeping `--json-schema`. Checked on Claude Code 2.1.332: the
  stream's final `type: result` event carries `structured_output`,
  `session_id`, `usage` and `total_cost_usd`, the same fields as the `json`
  envelope. So the structured result is kept and the stream is captured from
  the same stdout; no second capture path is needed.
- **Alternatives:** keep `json` and capture the activity another way (only
  needed if stream-json had lost the structured result).
- **Reversibility:** easy (one argument and the envelope reader).

## [2] Event streams are retained raw

- **Answered by:** human (Trent, 2026-11-27): "Retain raw (Recommended)".
- **Decision:** Tool-result bodies (source text the reviewer read) stay in
  the retained stream and are harvested with `objects/`.

## [3] Planning review round 1: retain the exact sent prompt

- **Answered by:** agent, from the Codex design review (round 1, F1, high)
- **Decision:** The adapter reports the exact stdin prompt through `onPrompt`,
  and it is retained as its own object next to the instructions, input and
  schema. Reconstruction does not rebuild it.
- **Reversibility:** easy.

## [4] Design approved

- **Answered by:** human (Trent, 2026-11-27): "Approve design" (after the Codex
  planning review round 2 PASS).

## [5] Amendment A1: run folders are never committed

- **Answered by:** human (Trent, 2026-11-28), in reply to the coordinator's
  run-data handoff: split "Fold (a) into #147"; key "Normal PR, no rewrite";
  commit policy "Never commit; remove copies".
- **Decision:** #147 also stops run folders being committed (per-run and root
  `.gitignore`) and removes the committed copies on the base, including a
  committed `runner-comparison.key`. Relocation (b), harvester changes (c) and
  a harvest-gated sweep (d) are separate issues.

## [6] Failed planning-review attempts

- **Answered by:** agent
- **Decision:** A planning review that fails after launch still throws as
  before and writes no `PLANNING_REVIEWED` event. Its activity goes into a
  `planning-review-attempt` object, linked from the journal by an existing
  `OBSERVATION` (kind `artifact`) event. That keeps planning-round and
  delegated-decision semantics unchanged: a later UNAVAILABLE record would
  otherwise supersede a cited PASS. Older readers also accept the event type.
- **Alternatives:** record a `PLANNING_REVIEWED` UNAVAILABLE (changes
  planning semantics); a new event type (older readers refuse unknown events).
- **Reversibility:** easy.
