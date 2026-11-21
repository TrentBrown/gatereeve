# Interview - tb-unattended-autonomy

Design interview for a highest autonomy level that runs to a ready PR without
asking the human, using the harness-native goal loop (Claude Code `/goal`,
Codex `/goal`) or an equivalent.

## Context gathered before the interview

- Autonomy dial today: `supervised | delegated | autonomous`
  (`plugin-src/shared/resources/protocol/current/contracts.js:7`). Autonomous
  needs a named-run human mandate `{goal, constraints}` and release-branch
  protection; it permits agent adjudication of review disputes and amendments
  within the mandate. Final release merge always needs a per-PR human
  instruction; the current/8 protocol already names "a ready final PR" as the
  unattended endpoint.
- Sources of questions under `autonomous` today: the planning-backbone
  interview (WORKFLOW.md "Interview the user", grill-me "ask ONE question...
  wait") has no autonomy branch; start-up questions (full or light, workspace
  feature mismatch); turn endings while CI is pending or "shall I continue?".
- "Unattended authority" is already the protocol's collective term for
  delegated + autonomous (`adapter.js:79`).
- Native goal support observed in installed binaries (Claude Code 2.1.330,
  Codex 0.171.0), not docs: Claude Code `/goal`, model tools
  `set_goal`/`get_goal`/`pause_goal`, separate evaluator that checks the
  condition before stopping, `set_goal` asks first unless the user's own words
  stated the goal. Codex `/goal [objective|clear|edit|pause|resume]`, model tools
  `create_goal`/`get_goal`/`update_goal` (complete, blocked, paused), token
  budget, stalled state, app-server `thread/goal/set`.
- Reference: Theo Browne's `t3dotgg/tstack` (`full-send`, `full-stop`): no
  native goal; prose grant, ask only via the harness question tool for a short
  list of blockers, decide everything else and list decisions in the report,
  test-permission override, stay active with PR watchers.

## Decisions

### D1 - Shape and name

- **Question:** New rung, a flag on autonomous, or a redefinition of
  autonomous; and what to call it given "unattended authority" is already the
  collective term?
- **Answer:** New rung `goal`.
- **Answered by:** human
- **Decision:** The autonomy dial becomes `supervised | delegated | autonomous
  | goal`. `goal` carries autonomous authority plus a no-ask policy, an
  assumption log and native goal persistence. `autonomous` stays as the mode
  that may still ask.

### D2 - Behavior at a real blocker

- **Question:** At a blocker the agent cannot clear alone (missing second
  review provider, unprovable check, credentials/production, mandate change),
  park immediately, always reach a PR first, or never stop?
- **Answer:** Always reach a PR.
- **Answered by:** human
- **Decision:** A `goal` run advances as far as it can, then opens a draft PR
  listing unmet gates and blockers, then parks: pauses the native goal and asks
  through the harness question tool. The human always gets a PR to look at.

### D3 - No-ask enforcement

- **Question:** Enforce no-ask with a hook, or rely on instructions?
- **Answer:** Hook denies questions.
- **Answered by:** human
- **Decision:** Under `goal`, PreToolUse denies the harness question tools
  (Claude Code `AskUserQuestion`, Codex `request_user_input`) with a pointer to
  record an assumption instead, and admits them only after the run has a
  recorded park (blocker plus draft PR).

### D4 - Persistence

- **Question:** Agent arms the native goal, the human types `/goal`, or a
  GateReeve Stop hook only?
- **Answer:** Agent arms native goal.
- **Answered by:** human
- **Decision:** On the grant the agent calls `set_goal` (Claude Code) or
  `create_goal` (Codex) with a GateReeve-generated condition bound to its own
  state (`status` for the run reports a ready final PR or a recorded park). A
  GateReeve Stop hook is the fallback on harnesses without a native goal.

### D5 - Granting a goal run

- **Question:** A dedicated `goal` skill that front-loads every attended
  decision, plain-language grants, or both?
- **Answer:** Both.
- **Answered by:** human
- **Decision:** Add a `/goal <objective>` skill that checks prerequisites
  while the human is present (protection, workspace, rigor default full,
  constraints), creates the topic branch, records the mandate, starts the run
  and arms the native goal. Also recognize a plain-language grant, including
  raising an existing run to `goal` mid-run via `run.set-dial`.

### D6 - Assumption log

- **Question:** Record assumptions as protocol events checked by reviewers,
  or in docs only?
- **Answer:** Protocol record + PR.
- **Answered by:** human
- **Decision:** New `assumption.record` operation (question, options, choice,
  reason, reversibility). Planning and boundary reviewers assess recorded
  assumptions against the mandate. `review.publish` writes a "Decisions made
  for you" section into the PR; desktop shows them.

### D7 - Testing permission

- **Question:** Should a goal grant override project "ask before this test
  method" rules?
- **Answer:** Yes, scoped override.
- **Answered by:** human
- **Decision:** The grant covers test methods needed to prove the change
  (running the app, simulators/devices, browser automation, screenshots),
  listed in the PR. Rules on how to test still apply. Production, data
  deletion and harness/system approval prompts are not covered.

### D8 - Spend limit

- **Question:** Optional, required or no budget in the goal grant?
- **Answer:** No budget.
- **Answered by:** human
- **Decision:** GateReeve adds no budget field; spend is left to the
  harnesses. A harness usage limit is treated as a blocker (draft PR, park)
  when the agent can still act.

### D9 - Endpoint

- **Question:** End at a ready unmerged final PR, or let the grant authorize
  the final release merge?
- **Answer:** Ready PR, unmerged.
- **Answered by:** human
- **Decision:** Keep the current/8 rule: a goal run's success endpoint is a
  ready final PR; the release merge needs the per-PR human instruction and
  deployment remains separately authorized.

### D10 - One interview record with provenance

- **Question:** Keep separate stores for human answers (`interview.md`) and
  agent assumptions (`assumption.record` protocol events), or consolidate so a
  run can start with a human-led interview and switch to `goal` mid-way?
- **Answer:** Agreed: consolidate.
- **Answered by:** human
- **Decision:** One interview procedure and one record. Each `interview.md`
  entry carries **Answered by:** `human | agent`; agent entries also record the
  options considered and reversibility. Post-design decisions use the existing
  `scratchpad.md`/`decisions.md` records with the same field. grill-me is one
  procedure with a mode switch: it asks under human-attended autonomy and
  self-answers under `goal`, continuing from wherever the record ends. The
  `assumption.record` operation is dropped; planning approval pins the
  interview record by hash alongside the design, reviewers assess `agent`
  entries against the mandate, and the PR "Decisions made for you" section and
  desktop view are derived from `agent` entries. A returning human can confirm
  an `agent` entry (provenance becomes `human`) or override it with a new human
  entry that supersedes it (an amendment after approval).
- **Supersedes:** the separate-store part of D6.

### D11 - Rename the autonomous level

- **Question:** "autonomy: autonomous" is confusing. Rename the property or
  the level?
- **Answer:** Level -> `mandated`.
- **Answered by:** human
- **Decision:** The autonomy dial becomes `supervised | delegated | mandated |
  goal`. The property, `run.set-dial` dial name, events and metrics keep
  `autonomy`. Retained records and inputs that say `autonomous` keep working
  as an alias read as `mandated`. The `autonomous-evaluator` authority kind
  and the generic phrase "autonomous authority" (covering `mandated` and
  `goal`) are unchanged. Recorded as an amendment in this run.

## Closing summary

- **Solid:** new `goal` rung on the autonomy dial with autonomous authority;
  always reach a PR (draft on blockers) then park; hook-enforced no-ask;
  one provenance-tagged interview record (D10); agent-armed native goal with Stop-hook fallback; `/goal` skill plus
  plain-language and mid-run grants; agent-answered entries reviewed
  and published to the PR; scoped testing override; no budget; ready unmerged
  final PR.
- **Shaky:** native goal tool names and behavior are observed from installed
  binaries, not documentation, and may drift across harness versions; whether
  Codex PreToolUse can match `request_user_input` is unverified; the agent
  cannot be prevented from asking in a plain message, only steered.
- **Unresolved, consciously accepted:** exact goal-condition wording per
  harness evaluator; how a parked run resumes (answer to the question tool vs a
  new human message) to be specified at spec time.
