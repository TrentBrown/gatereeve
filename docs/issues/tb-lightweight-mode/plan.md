# Plan - tb-lightweight-mode

**Feature:** `tb-lightweight-mode`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-15

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

The feature is delivered as sequential slices on an integration branch, using the
slice model this feature formalizes.

**Branches and PRs:**

- **Integration branch:** `tb-lightweight-mode`. It already holds the approved
  design records and is based on `origin/main` `df1c27c`.
- **Slice branches:** each slice is `tb-lightweight-mode-NN-<slice>`, cut from the
  updated integration branch. It opens a `SLICE` PR into `tb-lightweight-mode`.
- **Final PR:** a `FEATURE` PR from `tb-lightweight-mode` into `main`. Trent accepts
  and authorizes it per-PR.
- **Workspace config:** the local `.agentic-workflow.json` (untracked) configures
  `integrationBranch: tb-lightweight-mode`, `releaseBranch: main` and a
  `featureBaseSha`, before the first slice is cut.

This run is `full`/`supervised` throughout. Slice merges into the integration branch
still need Trent's acceptance and merge authorization, because this run is not
delegated.

**Where code changes:**

- **Canonical source is `plugin-src/shared/resources`.** The desktop app stages its
  protocol copy (`npm run stage:protocol`), and generated plugin packages are built
  from the shared tree.
- **Protocol** (`protocol/current/`):
  - `contracts.js`: contract version, decision/authority kinds, gate basis.
  - `core.js`: run start, dial state, toggles, milestone checks, commitments.
  - `authorization.js`: standing and delegated authority.
  - `actions.js` / `delivery.js`: merge preparation, protected merge, external
    blockers.
  - `evidence.js`: candidate scope and target, verification provenance.
  - `adapter.js`: snapshot.
- **Context** (`protocol/context.js`): integration/release/scope configuration.
- **Hooks:**
  - `protocol/current/pre-tool-use.js`
  - `scripts/session_start.py`
- **Metrics:**
  - `performance/workflow-projection.js`
  - `performance/fleet.js` (observation allowlist)
  - report wording
- **Surfaces:**
  - `cli/src` status and help
  - `apps/desktop/renderer/current-view.js` (header badge)
  - MCP status passthrough
- **Guidance:**
  - `resources/PROTOCOL.md`
  - `commands/` (pr-boundary, design, spec-draft, plan)
  - `policy/WORKFLOW.md`, `policy/WORKSPACE-CONTEXT.md`
  - a new light-run procedure
  - skills routing light runs
- **Inventory:** `plugin-src/contracts/workflow-inventory.json` and
  `platform-contracts.json` for any added files or hook behavior.

**Test strategy:**

- **Protocol tests.** Pre-merge `node --test` suites extend the existing
  `cli/test/current-*.test.js` patterns: core, delivery, hook, planning and source.
  They use stubbed `gh` and git runtimes (as `current-delivery.test.js` and
  `hosted-checks.test.js` do).
- **Python tests.** SessionStart tests go in `resources/scripts/tests/`.
- **Desktop tests.** These use the desktop test suite.
- **Compatibility.** Fixtures cover a contract-6 run with no dial events.
- **Parity.** Package parity uses the existing contract and inventory tests.

## Steps

- **P1. Contract 7 and run dials.**
  - Bump `CONTRACT` to `gatereeve/current/7`.
  - Add dial state to run start (`rigor`, `autonomy` inputs with built-in defaults
    and rejection of invalid values) and dial-change events. Each event records
    value, source, actor, instruction/reason and time.
  - Enforce the AC2 transition matrix: rigor only rises; full → light is always
    rejected with a message to start a new light run (design Changes 2026-11-16).
  - Expose dials in the snapshot. Interpret runs without dial events as
    `full`/`supervised`.
  - Ensure no configuration layer is read for dials.
  - **Advances:** R1, R3, R2 (snapshot data).

- **P2. Light rigor.**
  - Add `brief.md` as the light commitment set. The commitment subject is derived
    from the brief, and full documents are not required while light.
  - Bind brief-based `authorize-implementation`, so a changed brief invalidates
    authority.
  - When rigor rises to full, require the full commitments and spec validation
    before acceptance.
  - Give the `review` gate a requirement basis of the brief (goal and scope) for
    light runs, with an unchanged independent-evaluator qualification. The required
    gate set is the same for both rigors.
  - Add verification provenance (agent-run receipt / hosted CI on exact head / none)
    to verification evidence and presentation, for both rigors. Absent hosted checks
    are labeled as such.
  - **Advances:** R4, R5.

- **P3. Delivery targets and release merge authority.**
  - Bind candidate scope to PR target:
    - `SLICE` → integration branch;
    - `FEATURE` integration → release only.
  - Add the FEATURE-shaped final PR (head = integration branch) to `prepareMerge`
    and authorization, using `pr_lifecycle.py`'s existing `feature-final` rule as
    prior art.
  - When integration equals release, no standing or delegated merge authority
    exists.
  - **Release merges:**
    - Per-PR human `authorize-merge` lets the agent run `protectedMerge`, including
      for light runs.
    - New standing grants naming the release branch are rejected.
    - Existing ones are reported as non-authorizing in status.
  - Report hosting-rule merge blocks (e.g. required review) as external blockers.
  - **Advances:** R8 (non-delegated paths).

- **P4. Review summary on the PR.**
  - Add a PR publication step: description section or pinned comment. It writes the
    current independent `review` summary for the candidate head before review or
    merge authorization is requested.
  - Make the protocol and PR-boundary guidance require it in both rigors.
  - **Advances:** R9.

- **P5. Tripwires.**
  - Add deterministic classifiers with built-in category patterns and repository
    configuration, modeled on pattern-review trigger configuration.
  - Evaluate them at candidate preparation and acceptance for light runs.
  - Supervised hits block acceptance until escalation or a hit-bound human stay-light
    decision.
  - Delegated hits auto-escalate, and agent stay-light decisions are rejected.
  - **Advances:** R6.

- **P6. Delegated autonomy.**
  - **Delegation decision.** Add a delegation decision with an observed human
    instruction naming the run. It has a release-branch protection precondition,
    read via the non-admin `branches/<name>` `protected` flag.
  - **Delegated authority kind** for `approve-design` / `authorize-implementation`.
    It requires a qualifying independent evaluator PASS on the relevant artifact
    (design review, spec validation, brief review), cites the delegation and the
    evaluator receipt, and is reported distinctly from `human-confirmed`.
  - **Slice delivery.** Delegated acceptance and protected merge apply only to
    `SLICE` PRs into a distinct integration branch with all required gates PASS.
  - **Hand-back triggers:**
    - scope-changing amend
    - agent hand-back
    - external blocker
    - protection lost
  - **Advances:** R7, R8 (delegated paths).

- **P7. Guard, recovery messages, SessionStart and visibility.**
  - **Guard.** Widen `pre-tool-use.js` to the specified `gh pr merge` variants,
    `gh api` merge endpoints and `git push` to the configured integration or release
    branch. State best-effort in the guidance.
  - **Recovery.** Resolve the recovery entry point from the installation: bundled
    adapter or shipped wrapper, and the CLI only when on `PATH`.
  - **SessionStart.** Rewrite `session_start.py` to report no-run / light / full /
    delegated state. With no run, ask "full or light?" up front.
  - **Visibility.** Add dial display to CLI status and a desktop header badge.
  - **Advances:** R2, R10, R11.

- **P8. Measurement and rollout.**
  - Extend the `fleet.js` observation allowlist with rigor, autonomy and decision
    authority kind.
  - Populate them in `workflow-projection.js` for all observations. Project dial,
    delegation, tripwire, escalation and hand-back events.
  - Support agent-proposed `escaped-defect` origin links that are recorded only
    after human confirmation.
  - Adjust report wording so absent defect records are never presented as safety
    evidence.
  - Confirm CLI/desktop/MCP/plugin parity and contract-6 compatibility fixtures.
  - **Advances:** R12.

- **P9. Guidance and inventory.**
  - Update `PROTOCOL.md`, `WORKFLOW.md`, `WORKSPACE-CONTEXT.md` (integration vs
    release, slice vs final) and the command procedures.
  - Add a light-run procedure, route skills to it, and update the inventory/platform
    contracts.
  - This is supporting work that is required for consistent behavior. It carries no
    separate rubric row and is checked within R2, R9, R11 and R12 parity evidence.

- **P10. Workspace configuration at run start and feature-final review fixes.**
  - Run start writes a minimal `.agentic-workflow.json` when a repository with a
    GitHub remote has none: the current branch as the feature, the observed default
    branch as integration and release, added to the local Git excludes, and recorded
    with the run start. A configuration naming a different feature stops run start
    until a human instructs its replacement. A standalone operation writes it for an
    existing unconfigured run, and merge preparation names that operation.
  - Feature-final review fixes: a changed light brief hands delegation back whatever
    authority approves it (NEW1); the guard denies matching refspecs `:` and `+:`
    (NEW3); asking for light on a light run reports "already light" (F13).
  - **Advances:** R8, R7, R10 (design and spec Changes 2026-11-17).

## Slices

| Slice | Branch | Steps | Depends on |
|---|---|---|---|
| S1 | `tb-lightweight-mode-01-run-dials` | P1, P9 (protocol and dial docs) | — |
| S2 | `tb-lightweight-mode-02-light-rigor` | P2, P9 (light procedure) | S1 |
| S3 | `tb-lightweight-mode-03-delivery-targets` | P3, P4, P9 (workspace context) | S1 |
| S4 | `tb-lightweight-mode-04-guard-and-session` | P7 | S1 |
| S5 | `tb-lightweight-mode-05-tripwires-and-delegation` | P5, P6 | S2, S3 |
| S6 | `tb-lightweight-mode-06-measurement` | P8, P9 (inventory finalization) | S1–S5 |
| S7 | `tb-lightweight-mode-07-final-records` | Records only (S6 merge) | S6 |
| S8 | `tb-lightweight-mode-08-workspace-config` | P10 | S1–S7 |
| Final | `tb-lightweight-mode` → `main` | Whole-feature `FEATURE` review | S1–S8 |

## Verification

- **Each slice:**
  - Run focused protocol, hook and Python tests for its steps.
  - Run the full `cli` and `apps/desktop` test suites before the slice is declared
    ready.
  - Run the required acceptance gates through the current core with `SLICE` scope and
    the slice's rubric rows.
- **Final step:**
  - Prepare a `FEATURE` candidate from `featureBaseSha` covering every rubric row.
  - Run the full required gates and rubric evaluation, publish the review summary on
    the final PR, and produce the completion report.
  - Merge into `main` only on Trent's per-PR instruction.
