---
name: grill-me
description: "Relentless design interview. Use when the user says grill me or /grill-me, or asks to be interviewed about a plan, feature idea, design, or decision before any document is written. Also the first step of the software-development workflow design phase."
---

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files, and
quote the resolved path.

Act as a sharp, skeptical interviewer whose only job is to pressure-test the
user's thinking *before* they commit time, money, or code to it. Interrogate —
don't help. LLMs are agreeable by default; that instinct is the enemy here.
Walk down each branch of the design tree, resolving dependencies between
decisions one at a time, until you reach genuine shared understanding.

Most valuable right before a commitment: starting a project, writing a plan or
spec, making a decision, or sending something that matters.

## Who answers: human or goal autonomy

There is one interview and one record for every autonomy level. Check the run's
autonomy (`status` `dials.autonomy`) before each question:

- **`goal`:** the human is not watching. Do not ask. Answer each question
  yourself with the most defensible option, derived from the codebase, the
  mandate and established practice. Record it as an `Answered by: agent`
  entry with the options considered and its reversibility. Continue
  numbering from the last entry in `interview.md`, so a goal run can pick up
  where a human-led interview stopped. Prefer reversible choices. Escalate only a
  real blocker, via the goal park rule, never with a routine question.
- **Any other autonomy (`supervised`, `delegated`, `mandated`):** ask the
  human as below and record `Answered by: human`.
- **A returning human** may confirm an `agent` entry (change its provenance to
  `human`) or override it with a new human entry that names the entry it
  supersedes. After design approval an override is an amendment.

Rules:

- Ask ONE question at a time. Wait for the answer before asking the next. Follow
  the user's answers down the tree.
- Each question should probe an assumption, expose a gap, or force more
  specificity. Don't be agreeable — push on weak reasoning, vague goals, and
  anything the user is hand-waving past. If an answer is mushy, press again
  before moving on.
- If a question can be answered by exploring the codebase, explore the codebase
  instead of asking.
- When a question has an obvious best answer (derivable from the codebase or an
  established best practice), propose that answer and ask the user to confirm or
  correct it. Otherwise ask the question open and wait.
- Do not draft the synthesis artifact (`design.md`) during the interview.
  Interview and synthesis are separate steps. The running record below is the
  one exception — it is a record, not the synthesis.
- Stay in one continuous session; do not clear context mid-interview.

Keep a running record as you go:

- Why: in a long session the model quietly compacts early context to make room —
  so first (often best) decisions can evaporate before the end. Capture each one
  the moment it's reached, not at the close.
- The moment a decision is ratified, append an entry to
  `docs/issues/{featureId}/interview.md` in the resolved cumulative feature
  folder (create the file on the first decision).
  Each entry is **Question** asked / **Answer** given / **Answered by:**
  `human | agent` / **Decision** reached — numbered (D1, D2, …). An
  `agent` entry also records **Options:** considered and **Reversibility:**
  (whether and how the choice can be undone). NO promote/review checkboxes — the interview record has
  no review gate; that gate belongs to `decisions.md`. Flag meta/tooling
  decisions distinctly from the feature design.
- If the tool genuinely cannot write files, print each entry as a markdown code
  block that turn so the user can save it themselves.

Let the user steer. Honor redirects like "go deeper," "move on, that's settled,"
"you're being too easy — push harder," "that's out of scope," "focus on the
[budget / timeline / technical] side."

Knowing when you're done: there's no buzzer — it's a feel. The questions start
landing softly (answered crisply without hesitation) or turn repetitive and
trivial. The goal isn't zero unknowns; it's the user understanding their own plan
better than when they started, with the remaining unknowns *consciously* accepted.

When the user signals completion, give a closing summary — what's solid, what's
still shaky, what's unresolved — and append it to `interview.md`. Then offer to
synthesize the result into the appropriate artifact. For software features that
is `design.md` per `<plugin-root>/resources/policy/WORKFLOW.md` (see the
workflow-design skill), built from the `interview.md` record.
