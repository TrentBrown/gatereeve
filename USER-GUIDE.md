# Using the Agentic Development Workflow

This guide explains how to use the Agentic Software Development Workflow after
it has been installed and verified. If installation is not complete, begin with
[`INSTALL.md`](INSTALL.md) and do not continue until `workflow-doctor` reports
that your agent is ready.

> **Optional visual orientation:** The
> [`workflow site`](workflow-site/index.html) presents the philosophy, workflow
> layers, gates, artifacts, and nested feedback loops as an interactive visual
> model. It is useful background, but it is not a prerequisite for following
> this guide. The site is available in the source repository; an offline plugin
> bundle may contain only this operational guide.

## The shortest useful introduction

The workflow gives a coding agent a disciplined path from an idea to reviewed,
verified, pull-request-ready work. The agent does most of the mechanical work.
Your job is to supply intent, answer design questions, approve important
decisions, monitor progress, and intervene when judgment or authority is
required.

For a non-trivial feature, start a fresh agent session in the repository or
workspace and say:

> Use the software development workflow for `<feature description>`. Begin
> with Grill Me and ask one question at a time.

The agent should interview you before writing a design. It will then move
through explicit design, specification, planning, implementation, and review
boundaries. You remain **human on the loop**: monitoring and steering the work
without becoming the manual intermediary for every command, log, or test.

For newly initialized features, the plugin also creates a pinned workflow model
and append-only event journal. These records let GateReeve reject an illegal or
stale passage mechanically instead of relying only on an agent's description
of what happened. Existing in-flight feature folders without these files are
reported as legacy and may finish under the earlier artifact-driven process.

## See where the workflow is

The plugin supplies authoritative state directly to its skills and at session
start. If the optional Commander.js CLI is installed, the same information is
available to you and to automation:

```bash
gatereeve status
gatereeve snapshot
gatereeve next
gatereeve graph
gatereeve history
```

`status` is the quick operational view: feature state, active slice, active
boundary attempt, suspension and authorization state, blockers, and next
actions. `snapshot` returns the complete compact observational contract used by
the plugin, CLI, and graphical observers; `gatereeve read artifact <id>`,
`read events`, `read attempt <id>`, and `read model` lazily retrieve its larger
details. `next` distinguishes commands that are ready now, merely available in
principle pending fresh facts, or blocked by named prerequisites.
`graph` emits a Mermaid view of the current position; `graph --model` shows the
complete feature, slice, change, and PR-gate topology. `history` reads the
durable journal. Add `--json` for the stable machine-readable result envelope.

Hooks and CI can use `gatereeve check governed`, `check not-blocked`,
`check implementation-authorized`, or `check boundary-ready`. Ordinary queries
still exit successfully when they report a blocker or stale evidence; `check`
exits nonzero when the requested assertion is false.

The CLI does not run agents, schedule work, stage or commit files, or provide a
generic `advance` or force passage. Its `feature`, `slice`, `boundary`, `gate`,
and `change` families name the specific decision being recorded. Agents use
the plugin-local adapter, so absence of the PATH command does not weaken these
rules.

## Your first feature

### 1. Start in the right workspace

Open Codex or Claude Code in the directory that contains the code you want to
change. Start a fresh session so the installed workflow activation hook is
present.

Give the agent:

- the problem or outcome you want;
- the external task or issue number, when one exists;
- the repositories or systems likely to be involved; and
- any important constraints already known.

A useful opening prompt is:

> Use the software development workflow for issue 1234, “add a customer export
> endpoint.” This affects the API and web client. Begin with Grill Me and ask
> one question at a time.

You do not need to name every workflow skill. The workflow entry point should
load the appropriate procedures as the work advances.

### 2. Complete the design interview

During Grill Me, the agent explores intent, scope, behavior, constraints,
failure modes, and rejected alternatives. Answer one question at a time. Ask
for clarification when a choice or tradeoff is unclear.

The agent maintains `interview.md` as the live record. This protects important
context from session interruption and gives the later design, specification,
and plan access to the actual reasoning behind your answers.

### 3. Approve the design

After the interview, the agent synthesizes `design.md`. Review it for the
problem being solved, chosen approach, boundaries, risks, and important
alternatives.

The workflow cannot move into specification until you explicitly approve the
design. Approval can be simple:

> I approve the design. Proceed to the specification.

If the design is wrong or incomplete, correct it now. This is the least
expensive point at which to change direction.

### 4. Review the specification and plan

The agent turns the approved design into observable acceptance criteria and a
binary verification rubric in `spec.md`. It validates that specification
before producing `plan.md`, `issues.md`, and `tracker.md`.

Look for outcomes rather than implementation trivia:

- Can every acceptance criterion be observed or tested?
- Does the rubric make `PASS` and `FAIL` unambiguous?
- Does the plan cover the complete behavior without expanding the approved
  scope?
- Are tests and integration points represented?

When these documents look right, authorize implementation.

### 5. Stay human on the loop during implementation

The agent should execute the plan autonomously, run the code, inspect relevant
logs and data, and maintain the feature record. You should monitor progress and
steer when the agent encounters product judgment, missing authority, an
unexpected scope expansion, or a consequential tradeoff.

Whenever possible, give the agent direct access to the information and tools it
needs. For example, let it run tests, inspect application logs, query a safe
development database, use Git and GitHub CLI, or exercise a web interface with
Playwright. Avoid repeatedly copying information between the agent and a source
it could inspect itself.

Important implementation decisions are captured in `scratchpad.md`. At a PR
boundary, you decide which of them deserve promotion to the durable
`decisions.md` record.

### 6. Run the PR boundary

When a coherent, reviewable slice is ready, say:

> Run the workflow PR boundary for this slice and prepare it for human review.

The boundary is more than opening a pull request. The agent reconciles the
feature documents, verifies the intended code, evaluates the applicable
rubric, runs an independent judge, performs applicable Pattern Review and code
review, explains the diff, triages decisions, and assembles the evidence into
the draft PR.

The boundary deliberately refuses to evaluate an ambiguous local state. The
intended code must be committed, pushed, represented by the draft PR, and
synchronized with the remote PR head.

Review the resulting evidence and residual risks before requesting another
human's approval.

### 7. Complete or continue the feature

If the feature fits in one PR, the final boundary also verifies the complete
feature against every rubric criterion.

For a larger feature, prefer sequential PRs over one massive PR or a stack of
dependent branches:

1. Submit one small, coherent PR.
2. Wait for it to merge.
3. Update the integration branch.
4. Create a fresh delivery branch for the next slice.
5. Continue using the same stable feature ID and cumulative feature record.

The first branch may use the feature ID directly. Later branches include the
same feature ID plus an ordinal and description, such as:

```text
as-1234-customer-export
as-1234-customer-export-02-web-interface
as-1234-customer-export-03-observability
```

Each PR remains small and independently reviewable while the feature documents
retain the reasoning and progress of the whole effort.

## What the workflow creates

Specced work uses one cumulative feature folder:

```text
docs/issues/<featureId>/
```

The feature ID is stable across sequential PR branches. When an external task
number exists, preserve it in the ID—for example,
`as-1234-customer-export`—while storing the external task itself as structured
workspace configuration rather than relying on the name alone.

| File | What it tells you |
|---|---|
| `interview.md` | Your settled answers, examples, constraints, and open design questions |
| `design.md` | The approved problem definition and chosen solution shape |
| `spec.md` | Observable acceptance criteria and the verification rubric |
| `plan.md` | The implementation strategy mapped to rubric criteria |
| `issues.md` | The operational breakdown and current status of the work |
| `tracker.md` | Rubric progress, evidence, and the sequential PR log |
| `scratchpad.md` | Decisions captured while the implementation is moving |
| `decisions.md` | Human-promoted decisions worth preserving permanently |

At a PR boundary, the workflow also writes a per-PR evidence packet containing
the evaluation, judge, review, Explain Diff, and related reports. Treat these as
the evidence for one delivery slice; treat the feature folder above as the
cumulative record for the complete feature.

## Feature identity and workspace configuration

For a single-repository feature, the repository root can also be the workflow
workspace root. For a product composed of several repositories, create one
workspace above them and use a single `.agentic-workflow.json` to define the
stable feature ID and participating repositories.

The agent should create or maintain this configuration when sequential delivery
or a multi-repository feature requires it. A typical shape is:

```json
{
  "schemaVersion": 1,
  "featureId": "as-1234-customer-export",
  "externalTask": {
    "id": "1234",
    "url": "https://tracker.example/tasks/1234"
  },
  "repositories": {
    "product": {
      "path": ".",
      "remote": "origin",
      "integrationBranch": "main"
    }
  }
}
```

Without this file, the workflow retains legacy behavior: the current Git
repository is the workspace, the current branch name is the feature ID, and the
feature documents live in that repository.

## When to invoke a skill directly

Natural-language requests are preferred because they work in both Codex and
Claude Code. Name a skill when you want to force one specific operation or make
your intent unambiguous.

| What you want | What to ask for |
|---|---|
| Run the complete lifecycle | “Use the software-development-workflow skill.” |
| Interview and synthesize a design | “Run workflow-design” or “Grill me about this feature.” |
| Configure profile and branch prefix | “Run workflow-setup.” |
| Diagnose an installation | “Run workflow-doctor and preserve its real exit status.” |
| Create or repair feature documents | “Run workflow-branch-bootstrap.” |
| Evaluate implementation against the spec | “Run workflow-spec-evaluate.” |
| Run the complete PR boundary | “Run workflow-pr-boundary.” |
| Review a PR or local diff | “Run workflow-pr-review.” |
| Produce a reviewer-oriented walkthrough | “Run explain-diff.” |
| Capture a decision immediately | “Run workflow-decision-record.” |
| Save resumable session state | “Create a checkpoint.” |
| Transfer work to another agent | “Create a handoff for `<recipient>`.” |

The Pattern Review family is intentionally more specialized. Ask for
`pattern-help` to see its operations. In ordinary feature work, the PR-boundary
workflow runs the applicable pattern gate; users do not need to orchestrate the
complete rule-learning lifecycle manually.

## Common operating patterns

### Resume work in a new session

Start the new session in the same workspace and say:

> Resume feature `as-1234-customer-export` using its workflow documents. Inspect
> the current repository and PR state before continuing.

The agent should recover from the cumulative feature record, Git state, and any
current checkpoint rather than asking you to retell the feature history.

### Ask for a checkpoint

Use a checkpoint when you expect to pause and resume with the same agent:

> Create a checkpoint before we stop.

`CHECKPOINT.md` and `.checkpoints/` are local resumability artifacts. They are
not a substitute for maintaining `interview.md`, `tracker.md`, or decision
records, and they normally stay out of source control.

### Transfer work to another agent

Use a handoff when responsibility moves to a different agent or harness:

> Create a handoff for a new Codex agent whose objective is to complete the
> next PR slice.

The agent will ask for the recipient and objective before writing the handoff.
Handoffs live under `.handoffs/` and normally stay out of commits.

### Review work without implementing it

Say exactly what you want reviewed:

> Review PR 123 using workflow-pr-review. Do not modify the branch.

The reviewer should begin read-only, distinguish blocking findings from
optional suggestions, and cite concrete evidence.

### Work without the workflow temporarily

You can explicitly ask an agent not to use the workflow for one task. To pause
it across sessions, use the native plugin enable/disable controls described in
[`INSTALL.md`](INSTALL.md#1-pause-or-resume-the-workflow-at-any-time). Your
profile and branch-prefix configuration remain intact.

## Gates and your authority

The most important boundaries are:

- **Design gate:** you approve the synthesized design before specification.
- **Spec validation:** deterministic checks establish that the acceptance
  criteria and rubric are usable before planning.
- **PR boundary:** code and evidence are synchronized, reviewed, judged, and
  prepared for human review.
- **Feature completion:** every rubric criterion passes against the assembled
  feature, not merely the final PR slice.

Agents may recommend a decision and execute ordinary development work, but they
do not manufacture your approval. A failed judge or verification gate remains
blocking unless the underlying problem is fixed or you explicitly accept the
risk.

## Troubleshooting

### The workflow did not activate automatically

Start a fresh session and ask the agent to run `workflow-doctor`. For Codex,
also confirm that the plugin's `SessionStart` hook is trusted through `/hooks`.
Do not infer activation merely because a skill can be invoked manually.

### The agent asks for a branch prefix

Run `workflow-setup` and supply your own developer prefix. Do not copy another
developer's prefix. The selected profile and prefix are stored in namespaced
Git configuration and shared by the installed agents.

### The feature documents are missing or inconsistent

Ask the agent to run `workflow-branch-bootstrap` or diagnose the workspace
context. Do not create parallel feature folders merely because a later
sequential PR uses a different branch.

### The PR boundary refuses to proceed

This is often a synchronization safeguard rather than a defect. Check for:

- uncommitted intended changes;
- commits that have not been pushed;
- no draft PR for the current delivery branch;
- a local branch that differs from the PR head;
- a dirty target repository; or
- the wrong repository selected in a multi-repository workspace.

Resolve the reported mismatch and rerun the boundary. Do not bypass it by
reviewing a different diff informally.

### Installation or upgrade checks fail

Return to the troubleshooting section of [`INSTALL.md`](INSTALL.md#troubleshooting)
and preserve the complete doctor report. Diagnose Codex and Claude Code
installations independently.

## Glossary

- **Activity:** work performed by a human or agent, such as design synthesis,
  implementation, or review.
- **Artifact:** durable information consumed or produced by an activity.
- **Exit gate:** a condition that must pass before the workflow advances.
- **Human on the loop:** a person monitors, steers, and authorizes consequential
  decisions while agents execute the detailed work.
- **Feature ID:** the stable identity for one complete feature, independent of
  the branch used for an individual PR.
- **Delivery slice:** one coherent, independently reviewable PR within a larger
  feature.
- **Evidence packet:** the reports and provenance produced for one PR boundary.
- **Execution loop:** the agent's fast autonomous work-and-verify cycle.
- **Delivery loop:** the feature lifecycle from intent through merged slices.
- **Learning loop:** the process that turns downstream mistakes into proposed
  rules and tools.
- **Stewardship loop:** periodic review of the workflow itself as models,
  platforms, and needs evolve.

## Further reading

- [`workflow-site/index.html`](workflow-site/index.html) — interactive visual
  overview, when reading from the source repository.
- [`plugin-src/shared/resources/policy/WORKFLOW.md`](plugin-src/shared/resources/policy/WORKFLOW.md)
  — canonical workflow policy.
- [`plugin-src/shared/resources/policy/WORKSPACE-CONTEXT.md`](plugin-src/shared/resources/policy/WORKSPACE-CONTEXT.md)
  — feature identity, multi-repository work, and sequential PR delivery.
- [`INSTALL.md`](INSTALL.md) — installation, configuration, upgrades, and
  native plugin management.
