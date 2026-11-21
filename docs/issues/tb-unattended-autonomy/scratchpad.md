# Decision Scratchpad - tb-unattended-autonomy

**Feature start:** 2026-11-21

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Stop hook stall valve

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Reversibility:** Reversible: STALL_LIMIT is one constant

**Blast Radius:** protocol/current/stop.js; goal runs only

Admit the stop after 3 consecutive blocks with no new protocol event; any recorded event resets the count. The counter lives in a per-run file under the OS temp directory, not in the repository.

**Triggered by:** A Stop hook that always blocks a non-terminal goal run could loop forever when the agent cannot make progress (for example, it cannot open a PR)

**Alternatives considered:**
Block unconditionally (runaway token spend); rely on the harness goal's own stall detection (absent on Claude Code, and the Stop hook is the floor everywhere).

## [2] ready-pr recorded at publication, not observed live

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Reversibility:** Reversible: a live check can be added to the Stop hook later

**Blast Radius:** goal.js, core.js review.publish, status.goal

review.publish records GOAL_READY from the PR it just observed (open, head equals candidate head) for a goal run's FEATURE candidate. status combines that record with the live acceptance milestone and the current candidate. A later host-side change (the PR closed or merged elsewhere) is not re-observed by status.

**Triggered by:** status must stay cheap and deterministic, but the ready-pr condition depends on the PR's live host state

**Alternatives considered:**
Query GitHub on every status (slow, needs network, nondeterministic hook behavior).

## [3] Skill named goal coexists with the native /goal command

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Reversibility:** Reversible: rename the skill directory and inventory entry

**Blast Radius:** shared/skills/goal

Keep the skill name goal (spec AC7). The plugin namespace qualifies it, and its description triggers on 'goal mode' and on asking GateReeve to use /goal. The skill states that the native /goal alone only arms the harness loop; it does not grant GateReeve authority.

**Triggered by:** Both harnesses ship a built-in /goal command, which shadows a plugin skill invoked as /goal

**Alternatives considered:**
Rename to workflow-goal (diverges from the spec name); override /goal (not possible).

## [4] Agent-decision review input only for goal runs

[ ] **Promote**

**Answered by:** agent

**Confidence:** HIGH

**Reversibility:** Reversible

**Blast Radius:** execution.js boundary review value, delegation.js planning packet

agentDecisions (entries plus an assessment rule) is added to the planning packet and the boundary-review input only when autonomy is goal. The shared reviewer prompts are unchanged; the rule travels in the input, which reviewers read in full.

**Triggered by:** Adding a field to every review input or prompt would change input identities and invalidate reusable proof for in-flight non-goal runs

**Alternatives considered:**
Change the shared prompts (invalidates existing proof reuse).

