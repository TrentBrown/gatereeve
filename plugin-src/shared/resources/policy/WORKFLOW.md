# Software Development Workflow

This is the canonical, tool-agnostic workflow for software development. Agent
adapters such as Claude Code slash commands and Codex skills should point here
rather than duplicating the policy.

> Visual overview: [`WORKFLOW.mermaid`](WORKFLOW.mermaid)

## Version Control

- Load the selected policy profile and repository instructions before deciding
  which branches are protected or which branching strategy applies.
- Do not commit directly to a protected branch unless the active profile or
  explicit user instruction defines a repository-specific exception.
- Feature branch names use the configured `agentic-workflow.branchPrefix`.
  If no prefix is configured, stop and run `workflow-setup` rather than
  guessing another developer's identity.
- Use `git mv` for file moves and renames.
- Before committing, inspect `git status` and `git diff`, stage only intended
  files, and preserve unrelated user changes.

## Feature Folder

Every specced feature uses one canonical cumulative feature folder:

```text
docs/issues/{featureId}/
```

Resolve the feature ID and participating repository from
[`WORKSPACE-CONTEXT.md`](WORKSPACE-CONTEXT.md). In configured workspaces, the
stable feature ID is independent of the fresh delivery branch used by each
sequential PR. Without `.agentic-workflow.json`, legacy work continues to use
the current branch as `featureId`.

The folder contains:

| File | Purpose | Mutability |
|---|---|---|
| `interview.md` | Grill Me interview record; captures settled answers, examples, rationale, and open questions before design synthesis | Live during design interview |
| `design.md` | Problem, intent, and chosen shape; synthesized from the grill interview | Frozen at design gate; amendable with changelog |
| `spec.md` | Requirements: acceptance criteria and rubric | Amendable with changelog |
| `plan.md` | Implementation strategy, steps mapped to rubric | Evolves deliberately |
| `issues.md` | Operational task breakdown, estimates, status | Fluid, appended during work |
| `tracker.md` | Rubric status and PR log | Updated at PR boundaries |
| `scratchpad.md` | Raw decision log | Append-only during sessions |
| `decisions.md` | Promoted permanent decisions | Grows at triage boundaries |

Each file's H1 includes the stable feature ID.

For multi-repo features, default to one feature-level tracker in the canonical
feature folder. It represents the complete feature, not one repository. Create
repo-local trackers only when there is a clear process reason; the canonical
tracker remains the source of truth.

## Design Phase

Every non-trivial feature begins with a design interview, not a spec. The
`grill-me` skill drives a relentless interview about the feature intent,
walking each branch of the design tree and resolving dependencies between
decisions one by one. When a question has an obvious best answer, the agent
proposes it for confirmation; otherwise it asks open and waits.

The interview is not purely ephemeral. Maintain `interview.md` continuously
during Grill Me. It is the primary design-memory artifact for this phase and
should capture:

- Settled answers and constraints
- Draft contracts, examples, and configuration shapes
- Concrete file/path references
- Important rationale and rejected alternatives
- Open questions still being resolved

Operational rule: update `interview.md` after each settled decision or other
high-value design clarification. The goal is to cap potential loss from
compaction or interruption to at most one recent item.

`design.md` is synthesized from `interview.md` after the interview concludes;
the interview and the synthesis are separate steps. The design gate (explicit
user approval of `design.md`) must pass before any spec work begins. If the
design is rejected outright, delete the branch; nothing downstream was
touched.

`design.md` is frozen at the design gate and thereafter amendable only with
a changelog entry, in the same style as spec amendments.

## Branch Start

1. Resolve or establish the workspace context and create
   `docs/issues/{featureId}/`. The feature-level tracker task (The Tree) exists
   first and supplies the issue ID embedded in `featureId` when one is
   available. Each later sequential PR uses a fresh delivery branch while
   preserving this folder.
2. Create `interview.md` from template.
3. Run the `grill-me` interview on the feature intent and keep `interview.md`
   current as the interview progresses, ideally updating it after each settled
   decision or other high-value design clarification.
4. Synthesize `design.md` from `interview.md`.
5. Design gate: the user approves `design.md` before spec work begins.
6. Create `spec.md` with acceptance criteria and rubric. `design.md` is the
   controlling input; `interview.md` is a required supporting input for
   examples, draft contracts, rationale, concrete references, and edge-case
   detail. Pressure-test the spec against the existing codebase
   (unconditional whenever a codebase exists).
7. Validate the spec before planning.
8. Create `plan.md` with stable plan step IDs (`P1`, `P2`, ...), each mapped
   to rubric criteria. `spec.md` is the controlling input; `design.md` and
   `interview.md` are required supporting inputs for implementation shape,
   rationale, concrete references, and edge-case detail.
9. Create `issues.md` with the initial task breakdown derived from the plan.
10. Sync coarse-grained issues to the external tracker (The Tree) as
   title + description text blocks.
11. Create `tracker.md` with all rubric criteria initially `NOT YET`.
12. Create `scratchpad.md` and `decisions.md` for development-phase decision
   logging and promotion.

Use `scripts/bootstrap_branch_docs.py` for the mechanical bootstrap when useful.

## Decision Logging

Maintain `docs/issues/{featureId}/scratchpad.md` throughout the feature. Record a
decision when any trigger fires.

Tier 1 triggers, always record:

- Change outside primary task scope
- Cross-repo change
- SQL/schema modification
- Dependency change
- Security-relevant change
- API contract change
- Incidental bug fix
- Reversal of a previous PR decision

Tier 2 triggers, record when applicable:

- Choosing one approach over an apparently simpler alternative
- Code that would surprise a competent reviewer
- Invariant not visible in the diff
- Constraint not visible in code, such as infrastructure limits or downstream
  consumers

Heuristic: if the code would need an explanatory comment, or a peer would ask
"why?" in review, record the decision.

Scratchpad entry format:

```markdown
## [N] Short descriptive title

[ ] **Promote**

**Confidence:** HIGH | LOW

**Blast Radius:** what could be affected

Full body here.

**Triggered by:** the symptom or question that surfaced this decision

**Alternatives considered:**
- Option A - why rejected
- Option B - why rejected
```

At each PR boundary, triage all scratchpad entries:

- `[x]` promotes to `decisions.md`.
- `[-]` remains dismissed in `scratchpad.md`.
- `[ ]` blocks triage.

## Specification Standards

Spec drafting uses both design-phase artifacts:

- `design.md` is authoritative after the design gate. It controls scope,
  product direction, constraints, and rejected alternatives.
- `interview.md` is required supporting material. Use it to recover concrete
  examples, draft schemas, rationale, file references, and edge cases that were
  intentionally compressed out of `design.md`.

If `interview.md` contains detail that is consistent with the approved design,
the spec may include it. If it contradicts `design.md`, expands scope, or would
change the chosen shape, do not silently include it; amend `design.md` first
or ask the user.

Verification has three layers:

```text
Definition of Done
  Acceptance Criteria
    Rubric
```

The Definition of Done applies to every task. Acceptance criteria and rubric
apply when the task has a spec.

Acceptance criteria must describe observable behavior. They must be
independently verifiable and unambiguous. If the user gives a vague feature
request, draft AC and rubric and get approval before planning.

Every required evidence type must be obtainable at the lifecycle boundary
where its criterion is evaluated. A pre-merge feature gate must not require
credentials, trusted artifacts, deployment state, or other evidence
intentionally available only after merge. Preserve that obligation as an
explicit post-merge release or deployment acceptance gate; do not waive it,
expose protected authority earlier, or infer it from a development artifact.

The rubric is a binary pass/fail evaluation instrument derived from the AC.
Every criterion must have explicit pass, fail, and evidence expectations.
Prefer outcome-level checks over incidental implementation details.

AC and rubric live in `spec.md`, not `plan.md`.

## Spec Amendments

When implementation reveals requirements not covered by the original spec:

1. Add a `## Changes` section entry in `spec.md`.
2. Include date, rationale, new AC, and new rubric criteria.
3. Do not remove or weaken original criteria.
4. Add new rubric criteria to `tracker.md` as `NOT YET` at the next boundary.

## Planning Standards

Planning begins only after the design gate has passed and the spec has been
validated. Plan drafting uses three input layers:

- `spec.md` is authoritative. It controls what must be built, what must be
  verified, and which rubric criteria each plan step advances.
- `design.md` is required context. Use it for the chosen architecture,
  constraints, implementation boundaries, and rejected alternatives.
- `interview.md` is required supporting material. Use it to recover concrete
  examples, draft contracts, rationale, file references, and edge cases that
  make the plan more accurate.

Every implementation step in `plan.md` should map to at least one rubric
criterion, except explicitly labeled coordination or final verification steps.
The plan may choose sequencing, code areas, test strategy, and integration
touchpoints, but it must not smuggle in new requirements. If `design.md` or
`interview.md` reveals necessary work that is not represented by `spec.md`, add
a spec amendment before adding that work to the plan.

## Task Breakdown

`issues.md` is the operational counterpart to `plan.md`. Each issue has a
stable ID and references plan steps plus rubric criteria.

```markdown
## I-{N} - Short descriptive title

- **Status:** open | in-progress | blocked | in-review | closed
- **Estimate:** 0.5d | 1d | 2h | unknown
- **Plan steps:** P{n}
- **Rubric criteria:** R{n}
- **Depends on:** issue IDs or none
- **PR:** PR number/URL or -

Free-form body.
```

Do not reuse issue IDs. Append newly discovered work as new issues rather than
expanding old ones silently.

## PR Boundary

When a natural PR boundary is reached:

1. Complete provisional verification, commit and push every intended source
   change, and open or update the draft PR.
2. Resolve and persist one authoritative PR context from the clean synchronized
   checkout. Every formal gate must consume `boundary_gate.py` output from that
   same context; no gate may independently infer its upstream, base, head,
   feature folder, packet, or filename.
3. Update `tracker.md` with plan steps covered and rubric criteria addressed.
4. Reconcile `issues.md` against completed work. Move shipping issues to
   `in-review` with the PR number/URL once available.
5. Build the per-PR verification matrix and execute it. It must explicitly
   cover, or explicitly mark as not applicable, each of:
   - Build/typecheck.
   - Lint/format checks on changed files.
   - Unit tests for changed logic.
   - Integration tests for changed API contracts, database flows, or cross-repo
     data flows.
   - End-to-end or Playwright/browser smoke tests for user-facing frontend
     flows when practical.
   - Application runtime verification for affected screens or services.
   Record exact commands, results, and any known unrelated failures.
6. Run scoped `spec-evaluate` for criteria that should be satisfied by the
   completed work. Update `tracker.md` from evidence only and write the report
   to the active packet.
7. Run an independent `judge` pass for specced significant work. Treat `FAIL`
   as blocking until fixed or explicitly accepted by the user. Preserve the
   judge's findings in the active packet, tracker, and PR description.
8. Run pattern review when applicable, PR/code review, and `explain-diff` on
   the exact pinned base/head. Persist each artifact at its fixed active-packet
   path.
9. Triage decisions.
10. Recheck the remote PR head, finalize the manifest and cumulative tracker
   link, and open or update the PR description with summary, decisions, verification
   matrix, judge result, PR-review result, explain-diff artifact, known
   failures, and manual checks.
11. When evidence is tracked, commit and push only declared boundary artifacts.
   Finalize PR synchronization and run deterministic packet validation from the
   clean checkout.
12. Request human review only after the prior steps complete or are explicitly
   waived by the user.

## Feature Completion

1. Use the last real delivery PR as the `feature-final` boundary. Preserve its
   immediate slice base and the configured original feature base; do not create
   a completion pseudo-boundary.
2. Detect when all rubric criteria are `PASS`.
3. Run full verification against the complete spec and assembled feature while
   retaining focused review of the final PR slice.
4. Run an independent judge pass. Treat `FAIL` as blocking until fixed or
   explicitly waived by the user.
5. Confirm zero `NOT YET` and zero `FAIL` criteria remain.
6. Produce a completion report with concrete evidence and the deterministic
   feature-record retention status.

## Feature Close-out

After final verification passes:

1. Ensure the final PR description is the record of the feature: summary,
   promoted decisions, verification matrix, and judge result.
2. Update the external tracker (The Tree): mark the feature task complete
   with a closing comment summarizing the outcome and linking the PRs.
3. Inspect the retention report. If the centralized feature record is not fully
   tracked, require an explicit human retention decision before discarding the
   workspace; do not silently copy it or claim archival.
4. Retire the feature folder: `issues.md` is frozen as the permanent task
   log; no further edits to any branch document.
5. Write a final checkpoint (see Context Primitives) capturing the end
   state.

## Definition of Done

A task is not complete until all applicable items are true:

1. The code builds without errors and without new warnings.
2. Linting/formatting passes on changed files.
3. New logic has tests:
   - Unit tests for new backend/frontend utilities, services, models, and
     state transitions.
   - Integration tests when API contracts, database writes, migrations,
     webhooks, or cross-repo data flows change.
   - End-to-end or Playwright/browser smoke tests for new user-facing frontend
     workflows when practical.
4. Existing and new tests pass. Run the broad suite when feasible, plus
   targeted suites for changed areas. Do not skip failing tests without
   explicit human approval; document known unrelated failures with evidence.
5. Frontend/backend integration is verified end-to-end when the task spans both.
   Do not rely on isolated frontend and backend tests when the feature is a
   cross-stack workflow.
6. The application runs and the feature works in the running app when applicable.

If something cannot be tested because of credentials, services, or environment
limits, mark the status as implementation complete pending manual verification
and provide exact manual steps. Do not mark it fully complete.

## Completion Report

For all tasks:

```markdown
## Completion Report

### Definition of Done
- **Build status:** PASS/FAIL - command ran
- **Lint status:** PASS/FAIL - command ran
- **Tests written:** files and coverage
- **Test suite status:** PASS/FAIL - command ran and summary
- **Integration verified:** Yes/No/N/A - what was checked
- **Application runs:** Yes/No/N/A - what was verified
- **Pending manual verification:** None or exact steps
```

For specced tasks, add:

```markdown
### Acceptance Criteria
| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|

### Rubric
| # | Criterion | Result | Scope | Notes |
|---|-----------|--------|-------|-------|
```

At per-PR boundaries, `NOT YET` is acceptable for out-of-scope criteria. At
feature completion, zero `NOT YET` criteria may remain.

## Gates and Determinism

### Protocol governance

New features initialize through the plugin-packaged GateReeve protocol core and
are governed by default. The core writes `workflow-model.lock.json`,
`events.jsonl`, and `interview.md`, then enters `DESIGNING`. Existing in-flight
feature folders without a model lock and journal are explicitly legacy and may
finish under the prior artifact-driven process; v1 does not reconstruct or
adopt their history.

For governed features, every state-affecting skill follows the same contract:

1. Query the plugin-local protocol adapter for authoritative state, eligibility,
   blockers, guard inputs, and output locations.
2. Perform the adaptive agent work inside the current state.
3. Submit the semantic passage or evidence through the adapter.
4. Accept passage only when the core freshly revalidates and appends the event.

The adapter and core live inside the native plugin package. A PATH-installed
Commander CLI is an optional observer/adapter over the same core. Rejected
mutations append nothing. Hooks and CI may query or assert state but never
record passage. The core does not stage, commit, launch agents, schedule work,
or install Git hooks.

Every gate is backed, where practical, by a validator script that exits
nonzero on failure. The skill or command owning a boundary must run its
validator; passage is mechanical, not rhetorical. Validators live in
`scripts/`:

- Branch docs structure: `validate_branch_docs.py` (exists).
- Spec lint: `lint_spec.py` - AC entries present and concrete, rubric table
  parses, every row has explicit pass/fail/evidence cells (exists).
- Issues lint: `lint_issues.py` - unique IDs, every issue references at least
  one plan step and one rubric criterion, valid status values (exists).
- Triage gate: `gate_triage.py` - fail on any unreviewed `[ ]` scratchpad
  entry (exists).
- Tracker lint: `lint_tracker.py` - valid statuses; `--final` enforces zero
  `NOT YET`/`FAIL` at feature completion (exists).

Gate inventory: design gate, spec validation, per-PR DoD, per-PR judge
(blocking; explicit user waiver is the only bypass), decision triage, human
PR review, final verification.

## Context Primitives

Checkpoint and handoff are context-management primitives, not workflow
phases. Any phase may invoke them at its boundaries.

### Checkpoint

A checkpoint freezes session state for later resumption by the same agent
(or a fresh session of it). Invocation modes:

- At will, whenever the user asks.
- Automatically when the context window nears exhaustion (intentional
  compaction; on Claude Code a PreCompact hook may trigger it).
- Deterministically when any gate passes.

Convention: write `CHECKPOINT.md` (stable latest pointer) plus a timestamped
archive copy under `.checkpoints/` in the worktree root, with header
metadata: timestamp, repo, branch, originating session. Checkpoints capture
state (goal, current position, in-flight work, exact next action, relevant
paths and commands). During the design interview phase, `interview.md` is the
authoritative design-memory file and should be kept current continuously;
checkpoints remain secondary resume artifacts. During development phases,
checkpoints normally reference `scratchpad.md`/`decisions.md` for decisions
rather than duplicating them. `.checkpoints/` stays out of commits via the global
gitignore.

Hooks and other automation should treat checkpointing as a resumability
mechanism only. They should not be responsible for authoring or maintaining
`interview.md`; that remains an explicit workflow responsibility of the agent
during Grill Me.

### Handoff

A handoff transfers work to a different agent or persona. It is always
interactive: before writing, ask the recipient and their objective, plus
anything load-bearing that is not obvious from the work so far (a
mini-grill).

Convention: write to `.handoffs/` in the worktree root, gitignored globally.
Schema: goal/intent, current state, decisions plus rationale, dead ends
already tried, open questions, exact next action, relevant paths and
commands, the recipient, and the recipient's objective.

## Command Adapters

Command-level procedures live in `commands/`. Codex skills and Claude commands
should load the relevant command file on demand.

Supplementary standards (testing protocol, tracker format, spec gates,
constraint architecture) live in `STANDARDS.md` beside this file.
