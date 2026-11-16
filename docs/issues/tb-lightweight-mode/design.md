# Design - tb-lightweight-mode

**Status:** approved (gate passed 2026-11-15)
**Date:** 2026-11-15
**Source:** [Interview](interview.md), decisions D1–D15 (D14 supersedes D6's gate list).
Evidence: handoff from the MyLifeMap UX-refinement session; TrentBrown/mylifemap#290
and #291; QualityCode repository survey (D11). Read against `origin/main` `df1c27c`,
contract `gatereeve/current/6`.

## Problem

GateReeve has one way to run work: design → spec → plan → acceptance → merge, with
every human decision observed live. That is too costly for small, interactive slices,
and too supervised for work Trent wants to hand off.

**The lightweight experiment.** Trent ran UX slices on MyLifeMap outside GateReeve to
measure the cost of the full workflow. Development was faster, but GateReeve had no
model of it, and the friction landed on its controls:

1. **The merge guard blocks pre-approved merges.** `pre-tool-use.js` denies every
   shell `gh pr merge`. Without a run there is no path for Trent's explicit approval to
   become a merge, so he merged #290 and #291 by hand. Nothing verified that the
   merged head SHA was the one that was reviewed.
2. **The guard is a regex over `gh pr merge`.** `gh api` merge calls, `git push` to
   protected branches, and scripts all get past it.
3. **The recovery command doesn't exist on plugin-only hosts.** The denial says "use
   gatereeve merge prepare", but upcloud-1 has no `gatereeve` on `PATH`, although the
   bundled `plugin-adapter.js` can run `merge.prepare`/`merge.execute`.
4. **SessionStart pushes the full workflow every session.** Light mode survived only
   through an agent memory note.
5. **Verification claims get blurred.** CI ran 26 checks and the agent ran a few.
   Nothing recorded who verified what.

**The autonomy problem.** Trent also wants to let a run finish without him ("finish
this yourself and give me a PR"), and eventually to point GateReeve at tracker
issues. Today every decision needs an observed `human-confirmed` instruction.
Standing grants delegate only acceptance and merge, and only after human-approved
planning and implementation authority.

**What has changed since the experiment began.** Contract 6
(`tb-implementation-efficiency`, PR #103) already made acceptance lean. Required
gates are `context`, `review`, `verification`, `packet`, and `retention` at
completion; everything else is supplemental. The remaining cost of full rigor is
almost entirely planning.

## Intent

Give every run two explicit, highly visible, independently set dials:

- **Rigor** (`full | light`): which commitments and obligations a run must satisfy.
- **Autonomy** (`supervised | delegated`): who may pass the human decision points.

The aims:

- Make light runs first-class GateReeve runs, with the same acceptance floor as full,
  exact-SHA merges, and honest verification provenance.
- Make delegation safe enough for unattended work: independent checks replace human
  approvals, merges stay inside the integration branch, and the final merge into the
  release branch always needs a specific human instruction.
- Make both dials measurable, so the light and autonomy experiments can be judged
  rather than assumed.

## Chosen shape

### 1. Run dials

- **Each run carries rigor and autonomy** as recorded events. One run is one branch
  or feature home; there is no new "effort" entity (D3).
- **Built-in defaults:** `full`, `supervised`.
  - There is no config layer for either dial (D4).
  - `light` and `delegated` exist only as explicit per-run choices.
  - Missing, unreadable or invalid input resolves to the defaults.
- **Provenance.** Each dial value records its source (`explicit | built-in`), who set
  it, the observed instruction, and when.
  - A run with no dial events (every existing run) is `full`/`supervised`.
- **Asking up front.** When there is no run and non-trivial work begins, the agent
  asks "full or light?" up front (D12). The answer is the explicit rigor choice.
- **Visibility.** Both dials appear in:
  - `status`/`snapshot`/`next`
  - the SessionStart context line
  - the CLI
  - the desktop app header, as a prominent badge
  - every metrics observation

**Toggle rules (D5):**

| Change | Who | Condition |
|---|---|---|
| Rigor light → full | Human or agent, with a reason | Any time. Full commitments (design, spec, plan, issues; spec validation) are backfilled before acceptance. |
| Rigor full → light | Human only; never under delegation | Refused while any required gate has an unresolved FAIL for the current candidate. Recorded evidence is retained. |
| Autonomy supervised → delegated | Human only | Any time, recorded with the observed instruction. Requires the preconditions in §4. |
| Autonomy delegated → supervised | Human or agent, with a reason | Any time. Automatic on the hand-back triggers in §4. |

### 2. Light rigor

- **Commitments.** The only planning document is `brief.md`: goal, scope, and a
  findings log maintained during the run.
  - No interview, design, spec, plan or issues; no spec validation.
  - The run's commitment subject is derived from the brief's identity.
- **Brief approval (D15).**
  - **Light + supervised:** the agent shows the brief and waits.
    `authorize-implementation` is recorded only on Trent's explicit confirmation,
    bound to the brief's hash.
  - **Light + delegated:** an independent brief review substitutes for that
    confirmation (§4).
- **Required gates are the same as full (D14):** `context`, `review`,
  `verification`, `packet`, and `retention` at completion. Supplemental gates remain
  opt-in.
- **`review`** assesses the change against the brief's goal and scope instead of a
  rubric: code defects and interactions, verification sufficiency, scope. It runs in
  a fresh, independent context as in full. This is the light run's mandatory
  independent code review (D6).
- **`verification` must record provenance** for each claim (D6/D11, both rigors):
  - agent-run command and receipt;
  - hosted CI run on the exact head SHA;
  - or explicitly none.

  "No checks reported" is never presented as green CI. In repositories without CI,
  light verification rests on agent-run checks.

### 3. Tripwires (D10)

- **Classifiers.** Deterministic, repository-configurable classifiers (path/glob and
  content patterns, modeled on pattern-review triggers) evaluate the candidate diff
  of a light run at `candidate.prepare` and again at acceptance.
- **Initial categories:**
  - migrations/schema
  - auth/security paths
  - secrets/credential patterns
  - declared public API/contract files
  - data deletion
- **Light + supervised:** a hit stops for Trent, who escalates to full or stays light.
  Staying light is a recorded human decision with a reason, bound to the hit.
- **Light + delegated:** a hit automatically escalates the run to full. The agent
  cannot record a stay-light justification.

### 4. Delegated autonomy

- **Entering delegation.** Delegation is a human decision naming the run, recorded
  with Trent's instruction. It is refused unless the run's release branch is observed
  as protected on GitHub. The readable `protected` flag is enough; admin access is not
  needed (D11). There is no standing or configured delegation for runs that don't yet
  exist (D3).
- **Planning under delegation (D9).** `approve-design` and `authorize-implementation`
  may be recorded as delegated decisions only after an independent evaluator PASS:
  - spec validation for spec and rubric;
  - an independent design review for `design.md`;
  - an independent brief review for `brief.md` in light runs.

  The decision cites the delegation instruction and the evaluator result. It is a new
  authority kind, distinct from `human-confirmed`, so it is never counted as a human
  touch.
- **Slice delivery under delegation (D7).** Delegation authorizes acceptance and
  merge of `SLICE` candidates whose PR targets the run's integration branch, when:
  - every required gate PASSes;
  - the merge goes through `protectedMerge`.
- **Hand-back triggers.** Delegation drops back to supervised and stops for Trent on:
  - any scope-changing `amend` (provisional, D9);
  - agent uncertainty, which is always allowed;
  - an external blocker, such as a required review the PR author cannot give;
  - loss of release-branch protection;
  - a delegated attempt to lower rigor.

### 5. Slices, integration and release

- **Scope is bound to target (D7).** When `integrationBranch ≠ releaseBranch`:
  - `SLICE` PRs must target `integrationBranch`;
  - only the `FEATURE` PR (head = integration branch, base = release branch) may
    target `releaseBranch`.
- **Delegated and standing slice merges require distinct branches.** With
  `integrationBranch == releaseBranch` (the current documented default and MyLifeMap's
  practice), no delegated or standing merge exists.
- **The final PR gets its own recognized shape** in `prepareMerge`, scope checks and
  authorization, because its head is the integration branch rather than a slice
  branch.
- **Release-branch merges always need a per-PR human instruction (D8).**
  - "Merge #N" is recorded as a human `authorize-merge` bound to that PR, head and
    base, and the agent executes it through `protectedMerge`. This applies in any
    rigor, and resolves friction 1 for light runs.
  - No standing grant, delegation or rigor level authorizes a release-branch merge.
  - Standing-grant validation rejects `baseBranch = releaseBranch`. This tightens
    current behavior.
- **External blocks are reported as blocks.** If a required-review rule blocks an
  authorized merge (e.g. `fca-it/careNav-help` requires one approval, and the author
  can't self-approve), GateReeve reports an external blocker. It is not a gate failure.
- **Configuration.** `.agentic-workflow.json` and the Git fallback are reworked so the
  integration and release branches, and slice vs final, are explicit. The Git fallback
  (no integration branch) supports light and supervised runs and per-PR human merges,
  but not delegated merges.

### 6. Guard and session hooks

- **Wider merge guard (D11).** `pre-tool-use.js` also denies:
  - `gh pr merge` in all forms;
  - `gh api` PR-merge endpoints;
  - `git push` to a configured integration or release branch outside `protectedMerge`.

  It says plainly that it is best-effort; GitHub branch protection is the real
  enforcement.
- **Actionable recovery (D12).** Every denial and status message names an entry point
  that exists in the current environment:
  - the bundled `plugin-adapter.js`, or a thin wrapper shipped with the plugin;
  - the `gatereeve` CLI only when it is found on `PATH`.
- **State-reporting SessionStart (D12).** `session_start.py` reports state instead of
  prescribing the full workflow:
  - **No run:** defaults are stated, and the agent asks "full or light?" before
    non-trivial work.
  - **Light run:** rigor, autonomy, phase and blockers are shown, and the light
    procedure is loaded.
  - **Delegated run:** additionally shows the delegation scope and the hand-back
    triggers.

### 7. Presentation (D14)

In both rigors, the independent `review` summary is published on the PR (description
or pinned comment) before the PR is handed to Trent for review or merge
authorization. No separate `explanation` gate is reintroduced. Whether the current PR
flow already does this is to be checked during spec work.

### 8. Measurement (D13)

- **Events, not a new pipeline.** Dial settings and changes, delegated approvals,
  tripwire hits and dispositions, escalations and hand-backs are recorded as run
  events. They then reach metrics through the existing `projectWorkflow` projection.
- **New observation fields.** The allowlist in `fleet.js` `observation()` gains:
  - rigor and autonomy;
  - for decisions, the authority kind: human vs delegated-under-evaluator-PASS.
- **Derived from existing data:** elapsed time, gate FAILs, cost, escalation and
  hand-back counts, and human-touch counts.
- **Escaped defects** use the existing `workflow.observe` `escaped-defect`
  observation with `fixId`/links:
  - When Trent states that a fix addresses a bug from #N, the agent records it.
  - On fix runs, the agent also proposes candidate origins (blame of the changed lines
    against recent runs) and records a link only on Trent's confirmation.
- Reports never present an absent defect record as evidence that light is safe.

## Alternatives considered

- **Light as GateReeve standing aside (no run, a thin floor checker).** Rejected
  (D1). It would lose SHA-bound merges, the event log, standing authority and cheap
  escalation.
- **One master switch for "light and autonomous".** Rejected (D2). It cannot express
  light + supervised (the MyLifeMap experiment) or full + delegated (issue fixing).
- **Configured defaults for light, or for delegation.** Rejected (D3, D4).
  - A light repo default makes "forgot to choose" mean "chose less rigor."
  - Configured delegation would be standing authority over work that doesn't yet
    exist.
- **Agent self-approval of planning under delegation**, or delegation only after
  human planning. Rejected (D9). The first leaves the most expensive mistake
  unchecked; the second rules out issue-driven work.
- **Light runs merging to `main` under a standing grant.** Rejected (D7). A merge into
  the release branch always needs a per-PR human instruction.
- **Human merges by hand on GitHub only.** Rejected (D8). It loses exact-SHA binding
  and gains nothing over a per-PR instruction.
- **Branch protection on integration branches as a delegation precondition.**
  Rejected (D11). It needs admin rulesets in all nine QualityCode repositories, while
  everything on the integration branch is reviewed again in the final PR.
- **A separate `explanation` gate in light or both rigors.** Rejected (D14). It would
  reverse PR #103's consolidation; the PR presentation rule covers the real risk.
- **No tripwires, relying on `review`.** Rejected (D10). Review asks whether a change
  is correct, not whether it should have had a spec.

## Constraints

- **Contract.** This changes the contract: new decision and authority kinds, dial
  events, scope/target binding, and stricter standing-grant validation. It requires a
  contract version bump from `gatereeve/current/6`.
  - Existing runs remain valid and are interpreted as `full`/`supervised`.
  - Old events are not replayed or rewritten.
- **Release-branch standing grants.** Existing grants naming the release branch stop
  authorizing merges. That is an intentional tightening and must be reported
  visibly, not failed silently.
- **Shared protocol copies.** The protocol and performance code live under
  `plugin-src/shared/resources` and are mirrored into `apps/desktop/resources`. The
  CLI, desktop, MCP and plugin must change together.
- **Plugin-only installs** (no CLI on `PATH`) must reach every sanctioned operation,
  including protected merge.
- **Metrics stay non-authoritative.** Projection failure never changes workflow
  authority, as `projectWorkflow` already guarantees.
- **GitHub access.** GateReeve assumes only non-admin access: it reads the
  `protected` flag and does not read protection details or rulesets that need admin.
- **No CI in most QualityCode repositories.** 8 of 9 have none, so nothing may assume
  hosted CI exists.
- **GateReeve's own process.** This feature itself runs at full rigor and supervised
  autonomy, because it changes the authorization model.

## Open risks

- **Delegated planning approval** (an evaluator PASS standing in for Trent) is the
  largest new trust boundary and is untested. A shared blind spot between the
  implementer and evaluator models could pass a wrong design.
  - Mitigations: final-PR human review; per-PR human release merges; encouraged model
    diversity; metrics on delegated runs.
- **Brief quality.** `review` in light checks drift from the brief, not whether the
  brief captured intent. Human brief confirmation (D15) is the only guard under
  supervision; an independent brief review is the only guard under delegation.
- **Tripwire coverage is partial.** Path and content classifiers will miss risky
  changes in unexpected places and may over-trigger. Thresholds and patterns need
  tuning from real hits.
- **The final-PR shape** (head = integration branch) touches `prepareMerge`, scope
  checks and standing validation, which are subtle code. Regressions there could block
  or mis-authorize merges.
- **The best-effort guard** can still be bypassed by an agent determined to do so.
  Delegation's real safety rests on release-branch protection, and
  `fca-it/careNav-admin` `main` is currently unprotected (request pending with Brad).
- **The defect metric may stay sparse** if fix attribution isn't confirmed
  consistently. Light's safety could then look better than it is.
- **The amend hand-back may be too strict** for real delegated runs (provisional, D9).
- **Deferred:** issue-tracker intake and any bounded standing delegation for future
  runs.

## Changes

### 2026-11-16 — Rigor can never be lowered within a run (revises D5)

- **Rigor full → light is prohibited** for every actor and autonomy setting. This
  supersedes the "Rigor full → light" row of the §1 toggle table and the
  "delegated attempt to lower rigor" hand-back trigger in §4, which can no longer
  occur.
- **To work at light rigor after starting full,** the human and agent start a new
  light run: a new topic branch and feature home. The old run and its evidence are
  retained unchanged and abandoned, not resolved.
- **A restart-in-place operation** (superseding the active run on the same branch) is
  deliberately not added; it can be designed separately if needed.
- **Reason:** after four review rounds, safely deciding whether failing evidence is
  resolved enough to drop obligations kept producing new edge cases. Lowering rigor
  is not a normal workflow. A simple rule ("rigor only goes up") is easy to
  understand, and restarting is always available.
- Approved by Trent on 2026-11-16.

