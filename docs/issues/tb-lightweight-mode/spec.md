# Spec - tb-lightweight-mode

**Feature:** `tb-lightweight-mode`
**Created:** 2026-11-15
**Design:** [design.md](design.md), approved 2026-11-15
**Status:** Proposed delivery requirements derived from approved design; implementation not authorized.

## Summary

Every GateReeve run carries two explicit, visible, independently set dials:

- **rigor** (`full | light`)
- **autonomy** (`supervised | delegated`)

What the dials provide:

- **Light runs** are first-class governed runs. They have a single human-confirmed
  brief, the same required acceptance gates as full runs, and honest verification
  provenance.
- **Delegated runs** may pass planning only through independent evaluator PASS, and
  may merge only slice PRs into a distinct integration branch.
- **Merges into the release branch** always need a per-PR human instruction, which
  the agent may then execute through the protected merge.

Supporting changes:

- Tripwires escalate risky light work.
- The merge guard covers the common merge paths and names commands that exist.
- SessionStart reports run state instead of prescribing the full workflow.
- The independent review summary appears on every PR.
- Both dials, and who made each decision, are measurable in the existing metrics
  projection.

## Definition of Done

The governing software-development workflow applies to delivery of this change. Its
currently installed obligations remain in force until the changed product is
approved, validated and activated. Passing document lint is not proof of
implementation or independent review. Merge, publishing, installation and release
retain their separate authority.

## Acceptance Criteria

- **AC1. Explicit, recorded, visible run dials.**
  - **Defaults and choice.** A newly started run is `rigor: full`,
    `autonomy: supervised` unless an explicit choice is supplied at start.
    - No global, repository-local or workspace configuration can change either
      default.
    - Missing, unreadable or invalid dial input resolves to the defaults or is
      rejected; it never resolves to `light` or `delegated`.
  - **Provenance.** Each dial value and every change is recorded in the run's event
    history with:
    - its value;
    - its source (`explicit` or `built-in`);
    - who set it (human or agent);
    - the observed instruction or reason;
    - the time.
  - **Existing runs.** A run created before this change, which has no dial events, is
    reported as `full`/`supervised` without rewriting or replaying its history.
  - **Visibility.** Both current dial values appear in:
    - `status`/`snapshot`/`next` output;
    - the CLI status display;
    - the desktop app's workflow header;
    - the SessionStart context.
  - **Ask up front.** When no run exists, the activation guidance directs the agent to
    ask the human "full or light?" before non-trivial work.

- **AC2. Asymmetric dial changes.**
  - **Light → full:** may be performed by the human or the agent, with a reason.
    Acceptance then requires the full commitments (design, spec, plan, issues, and
    spec validation).
  - **Full → light:** accepted only with an observed human instruction.
    - It is rejected when the agent requests it.
    - It is rejected while autonomy is `delegated`.
    - It is rejected while any required gate has an unresolved FAIL for the current
      candidate.
    - Previously recorded evidence remains retained and visible.
  - **Supervised → delegated:** accepted only with an observed human instruction
    naming the run.
  - **Delegated → supervised:** may be performed by the human or the agent, with a
    reason.

- **AC3. Light rigor commitments and gates.**
  - **Brief.** A light run's sole planning commitment is `brief.md`, containing a
    goal, scope and findings log. Design, spec, plan, issues and spec validation are
    not required.
  - **Implementation authority:**
    - Under `supervised`, implementation authorization requires a human
      `authorize-implementation` bound to the current brief's identity. A changed
      brief invalidates it.
  - **Required gates.** Light acceptance requires the same gates as full:
    - `context`, `review`, `verification` and `packet` at acceptance;
    - `retention` at completion.

    Supplemental gates remain opt-in.
  - **Light `review`.** The `review` gate in a light run assesses the change against
    the brief's goal and scope, covering code defects and interactions, verification
    sufficiency and scope. It is run by an independent evaluator in a fresh context,
    as in full.
  - **Verification provenance, both rigors.** Verification evidence records, for each
    claim, whether it came from an agent-run command with receipt, a hosted CI run on
    the exact head SHA, or no checks. A repository reporting no hosted checks is
    presented as "no CI checks," never as passing CI.

- **AC4. Escalation tripwires.**
  - **Classifiers.** Repository-configurable deterministic classifiers (path/glob and
    content patterns) evaluate a light run's candidate diff at candidate preparation
    and at acceptance. Built-in categories:
    - migrations/schema;
    - auth/security paths;
    - secrets/credential patterns;
    - declared public API/contract files;
    - data deletion.
  - **Under `supervised`:** a hit blocks acceptance until the human either escalates
    to full or records a stay-light decision with a reason bound to that hit.
  - **Under `delegated`:** a hit escalates the run to full automatically, and an agent
    stay-light decision is rejected.
  - **No hits:** a run without hits is unaffected.

- **AC5. Delegated autonomy.**
  - **Precondition.** Delegation is rejected unless the run's release branch is
    observed as protected on GitHub with non-admin access.
    - Loss of that protection hands control back to the human.
    - No standing or configured delegation exists for runs not yet started.
  - **Planning.** Under delegation, `approve-design` and `authorize-implementation`
    can be recorded without a live human decision only after an independent evaluator
    PASS on the relevant artifact:
    - design review for `design.md`;
    - spec validation for spec and rubric;
    - brief review for `brief.md` in light runs.

    Such decisions carry a delegated authority kind that cites the human's delegation
    instruction and the evaluator result. They are distinguishable from
    `human-confirmed` everywhere they are reported.
  - **Slice delivery.** Delegation authorizes acceptance and protected merge only of
    `SLICE` candidates whose PR targets the run's integration branch, and only when
    every required gate PASSes.
  - **Hand-back.** Delegation drops back to supervised and stops for the human on:
    - a scope-changing amendment;
    - an agent hand-back;
    - an external merge blocker;
    - loss of release-branch protection.

- **AC6. Slice, integration and release delivery.**
  - **Scope bound to target.** When integration and release branches differ:
    - a `SLICE` PR must target the integration branch;
    - only a `FEATURE` PR from the integration branch to the release branch may
      target the release branch;
    - any other pairing is rejected at merge preparation.
  - **Same branch.** When the integration branch equals the release branch, no
    delegated or standing merge authority exists.
  - **Release merges, any rigor:**
    - A release-branch merge requires a human `authorize-merge` from a per-PR
      instruction, bound to that PR's number, head and base.
    - Under that authorization, the agent can execute the merge through the protected
      merge path. This works for light runs.
  - **Standing grants:**
    - A standing grant naming the release branch is rejected for new grants.
    - Existing grants naming it are reported as no longer authorizing merges.
  - **External blockers.** A merge blocked by a hosting rule, such as a required
    approving review the author cannot give, is reported as an external blocker, not
    a gate failure.
  - **Review summary on the PR.** In both rigors, the independent `review` summary is
    published on the PR (description or pinned comment) before the PR is presented
    for human review or merge authorization.

- **AC7. Merge guard and session guidance.**
  - **Guard coverage.** The PreToolUse guard denies, with reasons:
    - shell `gh pr merge` in all forms;
    - `gh api` pull-request merge endpoint calls;
    - `git push` to a configured integration or release branch;
    - forms using `-R`/`--repo`, absolute or relative executable paths, or chained
      commands.

    Its guidance states that it is best-effort.
  - **Actionable recovery.** Every denial and status recovery message names an entry
    point present in the current installation: the bundled adapter or a shipped
    wrapper, or the `gatereeve` CLI only when it is on `PATH`.
  - **SessionStart.** SessionStart reports run state rather than instructing the agent
    to load the full workflow:
    - **No run:** defaults and the up-front question;
    - **Light run:** rigor, autonomy, phase and blockers, and the light procedure;
    - **Delegated run:** additionally, delegation scope and hand-back triggers.

- **AC8. Measurement and rollout.**
  - **Events reach metrics.** Dial settings and changes, delegated decisions, tripwire
    hits and dispositions, escalations and hand-backs are run events that the existing
    workflow projection publishes as reporting observations.
    - Every projected observation of a run carries its rigor and autonomy.
    - Decision observations carry their authority kind.
    - Projection failure never changes workflow authority.
  - **Escaped defects.** An `escaped-defect` observation can link a fix to an origin
    run or PR.
    - Agent-proposed origin links are recorded only after human confirmation.
    - Reports do not present the absence of escaped-defect records as evidence of
      safety.
  - **Rollout.**
    - The changed protocol is a new contract version.
    - The CLI, desktop, MCP and plugin copies behave identically.
    - Existing runs and documents are neither converted nor deleted.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Defaults, provenance and no config path (AC1) | New runs default to full/supervised. Explicit choices are recorded with value, source, actor, instruction and time. No configuration layer or invalid input yields light or delegated. Pre-change runs report full/supervised unchanged. | Any config, invalid input or missing value produces light or delegated; dial events lack provenance; or existing runs are rewritten or misreported. | Pre-merge protocol tests for start, resume and invalid inputs; fixture of a contract-6 run. |
| R2 | Dial visibility (AC1) | Both dials appear in status/snapshot/next, CLI status, the desktop workflow header and SessionStart. With no run, activation guidance requires the up-front "full or light?" question. | Any listed surface omits or contradicts a dial, or no-run guidance lacks the question. | Adapter/CLI output tests, desktop renderer test or visual capture, SessionStart unit tests. |
| R3 | Asymmetric toggles (AC2) | Light→full and delegated→supervised succeed for human or agent. Full→light succeeds only for a human, while supervised, with no unresolved required FAIL. Supervised→delegated succeeds only for a human. Retained evidence survives lowering. | Any disallowed actor, autonomy or FAIL state can lower rigor or delegate; or lowering discards evidence. | Pre-merge protocol acceptance/rejection tests covering each transition and actor. |
| R4 | Light commitments and authority (AC3) | A light run reaches acceptance with only `brief.md`. Supervised implementation needs human authorization bound to the brief's hash; a changed brief invalidates it. Light→full requires full commitments before acceptance. | Light requires full planning documents; implementation proceeds without brief-bound authority; or a stale brief keeps authority. | Pre-merge protocol tests for a light run lifecycle and brief changes. |
| R5 | Light gates, review basis and verification provenance (AC3) | Light acceptance requires exactly the full required gate set. Light `review` uses the brief as its requirement basis via an independent fresh evaluator. Verification records agent-run/CI/none per claim, and an absent CI set is never shown as passing CI. | Light omits or adds a required gate; light review lacks an independent evaluator or brief basis; or provenance is missing or misrepresented. | Pre-merge gate/evaluator contract tests, verification receipt tests with stubbed `gh pr checks` results. |
| R6 | Tripwires (AC4) | Each built-in category triggers on a representative diff and is repository-configurable. A supervised hit blocks until escalation or a hit-bound human stay-light decision. A delegated hit auto-escalates and rejects agent stay-light. No-hit runs are unaffected. | A category fails to trigger, triggers are not configurable, a hit can be bypassed without the specified decision, or delegated runs can stay light. | Pre-merge classifier unit tests and protocol tests for supervised and delegated hits. |
| R7 | Delegation precondition, planning substitution and hand-back (AC5) | Delegation requires the release branch observed as protected (non-admin read). Delegated planning decisions require a qualifying independent PASS and carry a distinct authority kind. Each hand-back trigger returns the run to supervised and stops. | Delegation starts without observed protection; a delegated planning decision lacks a PASS or is reported as human-confirmed; or a trigger fails to hand back. | Pre-merge protocol tests with stubbed GitHub branch responses, evaluator receipts and trigger scenarios. |
| R8 | Delivery targets and merge authority (AC5, AC6) | Delegated merges succeed only for `SLICE` PRs into a distinct integration branch with every required gate PASS. Scope/target mismatches are rejected. The integration==release configuration yields no delegated or standing merges. A per-PR human instruction lets the agent execute a release merge via the protected path, including for light runs. New release-branch standing grants are rejected and existing ones are reported as non-authorizing. External blockers are reported distinctly. | Any agent merge into the release branch without per-PR human authority; a slice merges outside the integration branch; light runs cannot use the protected human-authorized merge; or external blocks appear as gate failures. | Pre-merge `prepareMerge`/`protectedMerge`/standing-validation tests with stubbed `gh`/git, including FEATURE-shaped final PRs. |
| R9 | Review summary on the PR (AC6) | Before human review or merge authorization is requested, the PR description or a pinned comment contains the current independent `review` summary for the candidate head, in both rigors. | A PR is presented for review or authorization without the current review summary. | Pre-merge tests of the PR publication step with stubbed `gh`; guidance parity. |
| R10 | Guard coverage and actionable recovery (AC7) | The guard denies each listed merge/push form, including `-R`/path/chained variants, and leaves unrelated commands alone. Every denial/recovery message names an entry point that exists in the test installation (adapter or wrapper, CLI only when on `PATH`). | A listed form is admitted; unrelated commands are denied; or a message names an unavailable command. | Pre-merge hook unit tests with command corpora; tests with and without CLI on `PATH`. |
| R11 | State-reporting SessionStart (AC7) | No-run, light, full and delegated states each produce the specified context. No state instructs the agent to load the full workflow when the run is light. | SessionStart still prescribes the full workflow for light runs or omits specified state. | Pre-merge SessionStart unit tests over adapter status fixtures. |
| R12 | Measurement and rollout (AC8) | Projected observations carry rigor, autonomy and decision authority kind. The specified run events appear as observations. Escaped-defect links are recorded, with agent-proposed links only after confirmation. Reports don't treat absent defects as safety. The new contract version is used, plugin/desktop/CLI/MCP copies match, and existing runs are untouched. | Observations lack dial or authority fields; events are missing from projection; unconfirmed proposed links are stored; projection failure affects authority; copies diverge; or existing runs are converted. | Pre-merge projection/fleet tests, report wording tests, package parity checks, compatibility fixture tests. |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
