# Interview: lightweight mode (and autonomy switch)

Source: handoff from the MyLifeMap UX-refinement session (upcloud-1, 2026-11-15),
PRs TrentBrown/mylifemap#290 and #291.

## D1 — Structural shape of light mode

**Question:** Is light mode (A) a governed run with a reduced obligation set, keeping
the run record, event log, standing grants and `protectedMerge`, or (B) GateReeve
standing aside with only a thin floor checker and no run or feature home?

**Answer:** A.

**Decision:** Light mode is a governed GateReeve run with a smaller set of required
obligations. It reuses the existing run, event log, authorization and protected-merge
machinery. Escalating to full adds obligations to the same run rather than starting a
new one.

## D2 — Two independent dials, both in this design

**Question:** Should light mode and the "master switch" for autonomous running be
modeled as two independent dials, and which belongs in this design?

**Answer:** Yes to the terminology and meaning. Both dials are in the current design.

**Decision:** GateReeve gets two orthogonal run dials:
- **Rigor:** `full | light`, which obligations a run must satisfy.
- **Autonomy:** `supervised | delegated`, who may pass human decision points.

Both are designed (and delivered) in this work. The names are adopted as user-facing
terminology. Both must be highly visible: run events, `gatereeve status`, SessionStart
context, and the desktop app. Both must be stamped on performance metrics records so
runs can be segmented by them.

## D3 — Where the dials live; no configured delegation

**Question:** Should both dials be run properties captured at run start, with defaults
from config layers, and should a configured default be allowed for autonomy?

**Answer:** Agreed.

**Decision:**
- Rigor and autonomy are properties of a run (one run = one branch/feature), captured
  in the event log at run start.
- There is no new "effort" entity.
- Rigor may have a configured default.
- Autonomy has no configured default. `delegated` is always a per-run human decision,
  recorded with the observed instruction at the moment it is given.
- Any future issue-intake design must not introduce standing delegation for runs that
  do not yet exist without a separately designed bound (label, allowlist, expiry).

## D4 — Rigor default is full; light is explicit-only

**Question:** What is the rigor default, and may config default a repository to light?

**Answer:** Built-in default `full`. Make light explicit-only.

**Decision:**
- Rigor defaults to `full`, built in. Missing, unreadable or invalid input resolves
  to full.
- `light` can only be chosen explicitly, per run, at run start or at a later
  sanctioned toggle point.
- No config layer may default rigor to light. Since config could then only restate
  `full`, neither dial has a config layer: both are explicit per-run choices over
  built-in defaults (`full`, `supervised`).
- The run records each dial's value and its source (`explicit | built-in`), plus who
  chose it.

## D5 — Toggle points

**Question:** When may each dial change mid-run, and who may change it?

**Answer:** Agreed with the proposed asymmetric rules.

**Decision:**
- **Rigor light → full:** any time, by the human or the agent, recorded with a reason.
  Full-only obligations (spec, plan, applicable judge gates) are backfilled before
  acceptance.
- **Autonomy delegated → supervised:** any time, by the human or the agent (the agent
  may hand back control when uncertain).
- **Autonomy supervised → delegated:** human only, at any point, recorded with the
  observed instruction.
- **Rigor full → light:** human only, never by the agent and never under delegation.
  Refused while any required gate has an unresolved FAIL for the current candidate:
  the FAIL must be fixed or explicitly waived first. Recorded evidence is retained;
  lowering rigor removes future obligations only.

## D6 — Light-mode floor

**Question:** Which existing gates remain required under light rigor, and does light
keep an independent code review?

**Answer:** Accepted the proposed mapping; keep `code` in light (Option 1).

**Decision:** Light rigor requires:
- `context`
- `packet`
- `verification`, which must state provenance: agent-run commands, hosted CI on the
  exact head SHA, or none. CI-only is allowed if stated.
- `explanation`
- `code`, an independent code review, in every light run regardless of autonomy
- `retention`, at completion

Light drops `reconcile`, `spec`, `judge`, `triage`, `pattern`, `whiteboard`.

The only commitments document is `brief.md` (goal, scope, findings log). Merge always
goes through `protectedMerge`: exact PR/head/base binding, green hosted checks, no
direct pushes.

## D7 — Delegation covers slice merges; the final merge is always human

**Question:** Does delegation include merge? How do slices and the final PR relate,
and what happens to single-PR light runs that target `main`?

**Answer:** Delegation should allow approving and merging intermediate slice PRs, but
never the final PR. Slice PRs merge into an integration branch; the final PR is the
single merge into `main`. A merge into the release branch always needs the human,
regardless of rigor (option a). Agents are free to create slices and should use an
integration branch for them. Configuration may be reworked to make this clearer.

**Decision:**
- Delegated autonomy authorizes acceptance and merge of `SLICE` candidates whose PR
  targets the run's integration branch.
- Delegated slice merges require an integration branch distinct from the release
  branch. With `integrationBranch == releaseBranch`, there are no delegated merges.
- The final PR (`FEATURE` scope, integration → release) is always accepted and merged
  by the human. No dial, standing grant or rigor level authorizes an agent merge into
  the release branch. This tightens current behavior, which lets standing grants
  name the release branch.
- Scope is bound to target: `SLICE` PRs must target `integrationBranch`; only the
  `FEATURE` PR may target `releaseBranch`.
- The final PR (head = integration branch) needs its own recognized shape in
  `prepareMerge` and authorization.
- Single-PR light runs into `main` are merged by the human (or the human
  merges/authorizes explicitly per PR). Friction 1 is resolved by an explicit,
  sanctioned human merge path, not by agent merges into `main`.
- Configuration (`.agentic-workflow.json` and the Git fallback) may be reworked so
  integration vs release, and slice vs final, are explicit.

## D8 — Human merge authority means words, not hands

**Question:** Does "a merge into main always needs you" mean (i) a per-PR human
instruction that the agent then executes through `protectedMerge`, or (ii) the human
physically merging on GitHub? Is blanket pre-approval rejected for the release
branch?

**Answer:** (i). If Trent tells the agent it can merge a specific PR, the agent may do
so. Blanket pre-approval must not apply to the final PR into `main` (the release
branch).

**Decision:**
- A per-PR human instruction ("merge #N") is recorded as a human `authorize-merge`
  bound to that PR and its exact head SHA. The agent executes it via `protectedMerge`.
  This is how merges into the release branch happen, in any rigor.
- This path must work for light runs, which resolves friction 1.
- Blanket or standing pre-approval never authorizes a merge into the release branch.
- Standing or delegated merge authority applies only to slice PRs into a distinct
  integration branch.

## D9 — Delegated planning approval requires an independent check

**Question:** Under delegation, how may `approve-design` and `authorize-implementation`
pass without the human: (a) agent self-approval, (b) an independent evaluator PASS
substituting for the human, or (c) delegation only after human planning approval?
And may a delegated agent amend approved scope?

**Answer:** (b). Keep the amend restriction for now; Trent may relax it after using
the new version for a while.

**Decision:**
- Under delegated autonomy, each pre-implementation human decision may pass only after
  an independent evaluator PASSes the relevant artifact: spec validation for spec and
  rubric, and an independent design review for the design. In light runs, this is an
  independent review of `brief.md`.
- The decision is recorded as delegated, citing the human's delegation instruction and
  the evaluator result.
- Any scope-changing `amend` under delegation automatically drops autonomy to
  supervised and stops for the human.
- This is explicitly provisional: revisit after real use.

## D10 — Escalation tripwires

**Question:** Should GateReeve detect light-run changes that warrant full rigor, or rely
on the mandatory `code` review and judgment?

**Answer:** Use the proposed tripwires.

**Decision:**
- Deterministic, repository-configurable tripwire classifiers (path/glob and content
  patterns, like pattern-review triggers) evaluate the candidate diff in light runs.
- Initial categories:
  - migrations / schema
  - auth / security paths
  - secrets / credential patterns
  - declared public API / contract files
  - data deletion
- **Light + supervised:** a tripwire stops for the human, who either escalates to full
  or stays light with a durable recorded reason.
- **Light + delegated:** a tripwire automatically escalates the run to full. The
  agent cannot record a "stay light" justification for itself.

## D11 — Merge guard and server-side precondition for delegation

**Question:** Should delegation require GitHub branch protection, and on which
branches, given the QualityCode repository survey (2026-11-15)?

**Survey evidence** (read-only, non-admin access, 9 QualityCode repositories):
- Release branches are protected in 8 of 9 repositories. `fca-it/careNav-admin` `main`
  is unprotected.
- No repository requires status checks. 8 of 9 have no CI workflows at all.
- `fca-it/careNav-help` uses a ruleset requiring PRs and 1 approving review.
- No ruleset covers integration-branch name patterns anywhere.

**Answer:** Accept the revised proposal.

**Decision:**
- Delegation may start only when the run's release branch is observed as protected on
  GitHub (readable `protected` flag; no admin access required).
- Integration branches need no server-side protection: everything landing there is
  re-reviewed by the human in the final `FEATURE` PR (D7/D8).
- The PreToolUse guard is widened to cover:
  - `gh pr merge` variants
  - `gh api` merge endpoints
  - `git push` to configured integration or release branches outside
    `protectedMerge`

  It honestly states that it is best-effort.
- **Consequence for D6:** where a repository has no hosted CI, light `verification`
  cannot be satisfied by CI. It must cite agent-run checks, and "no checks reported"
  must be stated as such, never presented as green CI.
- **Consequence for D8:** required-review rules (e.g. careNav-help) can block a
  human-authorized agent merge because the PR author cannot self-approve. GateReeve
  must report this as an external blocker, not a gate failure.
- Only follow-up request for Brad: protect `fca-it/careNav-admin` `main`.

## D12 — Actionable recovery commands and state-reporting SessionStart

**Question:** Should guard and status messages name only commands available in the
environment, and should SessionStart report run state instead of prescribing the full
workflow? With no run, should the agent ask "full or light?" up front?

**Answer:** Confirm both. Ask up front: no harm, and it saves trouble later.

**Decision:**
- Every denial and status message names an entry point that exists in the current
  environment: the plugin-bundled adapter (or a thin wrapper shipped with the plugin),
  or the `gatereeve` CLI only when found on `PATH`. This resolves friction 3; the
  sanctioned merge path must be reachable from a plugin-only install.
- SessionStart reports state rather than pushing the full workflow (friction 4):
  - **No run:** defaults are stated.
  - **Light run:** shows rigor/autonomy/phase/blockers and loads the light procedure.
  - **Delegated run:** additionally shows delegation scope and what hands control back.
- With no run, before non-trivial work, the agent asks the human "full or light?" up
  front. The answer is the explicit rigor choice required by D4. The rigor choice lives
  in the run record, not agent memory.

## D13 — Measurement, built on the existing metrics projection

**Question:** How is the light/delegated experiment measured, including defects that
escape a light run and are fixed later? Who supplies the defect-to-origin link?

**Context found:** The merged metrics work (PRs #97, #100, #101, #103) already
projects every run event (decisions, milestones, gate results, findings, model, cost)
into reporting observations (`projectWorkflow`). It also supports `workflow.observe`
notes of kind `escaped-defect` with `fixId`/links.

**Answer:** Both: Trent states the link when he knows it, and the agent proposes links
for confirmation.

**Decision:**
- Dial settings, dial changes, delegated approvals, tripwire hits, escalations and
  hand-backs are recorded as run events, so they flow into metrics through the
  existing projection with no new pipeline.
- Reporting observations gain rigor and autonomy (the observation field allowlist is
  extended), so every observation is segmentable by dial.
- Decision observations gain who decided: human vs. delegated under evaluator PASS.
  This enables human-touch counts.
- Elapsed time, gate FAILs, cost and escalation counts derive from existing data.
- **Escaped defects:**
  - Trent states "this fixes a bug from #N" when he knows it, and the agent records an
    `escaped-defect` observation linking the fix to the origin run/PR.
  - On fix runs, the agent also proposes candidate origins (e.g. via blame of the
    changed lines against recent runs) and records a link only when the human
    confirms.
- Reports must not present an absent defect record as evidence that light is safe.
- **Meta:** this design was initially read from a stale local `main` (31 commits
  behind). The design branch was moved to `origin/main` `df1c27c`, and D6 is revisited
  against contract `gatereeve/current/6`.

## D14 — D6 revised for contract `gatereeve/current/6`; explanation via the PR

**Question:** Under contract 6, full requires only `context`, `review`,
`verification`, `packet` at acceptance (`retention` at completion); `code`, `judge`,
`spec`, `explanation`, `triage`, `pattern`, `reconcile` are supplemental. Should light
mirror full's required gates and differ only in planning? Should `explanation` be
required in light, or in both?

**Answer:** Accepted the revision. No separate `explanation` gate in either rigor;
instead the independent review summary must appear on the PR in both rigors.

**Decision (supersedes D6's gate list):**
- **Light requires the same gates as full:** `context`, `review`, `verification`,
  `packet`; `retention` at completion. Supplemental gates remain opt-in in both.
- **Light differs only in planning:** its sole commitment is `brief.md` (goal, scope,
  findings log); there is no design/spec/plan/issues and no spec validation.
- **`review` in light** assesses against `brief.md` goal and scope rather than a
  rubric: code defects, interactions, verification sufficiency, scope. This satisfies
  D6's "independent code review in every light run."
- **`verification`** must state its evidence source: agent-run, hosted CI, or none
  (D6/D11).
- **No `explanation` gate is reintroduced**: its responsibility was consolidated into
  the `review` summary by `tb-implementation-efficiency` (PR #103).
- **New presentation rule, both rigors:** the independent `review` summary is
  published on the PR (description or pinned comment) before the PR is handed to the
  human for review or merge authorization. Whether the current PR flow already does
  this is to be checked during design.

## D15 — Brief approval under light + supervised

**Question:** Under light + supervised, is the human's light instruction itself
implementation authority, or must the human confirm `brief.md` before
implementation?

**Answer:** (b): the human confirms the brief.

**Decision:**
- Under light + supervised, the agent writes a short `brief.md` and shows it.
  Implementation is authorized only by the human's explicit confirmation ("go"),
  recorded as `authorize-implementation` against the brief's identity.
- Under light + delegated, D9 applies: an independent brief review substitutes for
  that confirmation.

## Closing summary (2026-11-15)

**Solid (D1–D15):**
- **Two run dials.** Rigor (`full|light`) and autonomy (`supervised|delegated`) are
  captured in the run event log and visible in status, SessionStart, the desktop app
  and metrics.
  - Built-in defaults: `full`, `supervised`.
  - `light` and `delegated` are explicit per-run choices only; there are no config
    defaults.
- **Asymmetric toggles.** Escalating rigor or handing back control is always allowed.
  Lowering rigor is human-only and blocked by unresolved FAILs. Delegating is
  human-only.
- **Light mirrors full's required gates** (`context`, `review`, `verification`,
  `packet`, `retention`) and differs only in planning: a human-confirmed `brief.md`.
  Verification states its evidence source. The review summary is published on the PR
  in both rigors.
- **Delegation.**
  - Pre-implementation approvals require an independent evaluator PASS.
  - A scope-changing amend hands back control (provisional).
  - Delegation may accept and merge `SLICE` PRs into a distinct integration branch.
  - It requires the release branch to be observed as protected on GitHub.
- **Release-branch merges** always require a per-PR human instruction, which the agent
  then executes via `protectedMerge`. Blanket approval never applies.
- **Tripwires:** ask under supervised; escalate automatically under delegated.
- **Hooks.** The merge guard is widened and honestly best-effort. Recovery messages
  name available entry points. SessionStart reports state and asks "full or light?"
  when there is no run.
- **Metrics** reuse the existing event projection. Records gain dial fields and
  decision authority. Escaped-defect links are human-stated and agent-proposed.

**Shaky:**
- Delegated planning approval by an evaluator (D9) is the largest new trust boundary
  and is untested.
- QualityCode repositories mostly lack CI, so agent-run verification carries the load.
- The final PR shape (head = integration branch) needs new `prepareMerge` and
  authorization handling. Config rework is approved in principle only.

**Unresolved, consciously deferred:**
- Issue-tracker intake and any bounded standing delegation for future runs (D3).
- Relaxing the amend restriction after use (D9).
- Whether the current PR flow already publishes the review summary (D14).
- Request to Brad: protect `fca-it/careNav-admin` `main`.

## D16 — Rigor can never be lowered within a run (revises D5)

**Question:** After four independent reviews of S1 each found a further gap in
deciding whether a required FAIL was resolved before rigor could be lowered, should
full → light (a) stay allowed with a stricter acceptance-only rule, (b) be deferred
to S2, or (c) be prohibited, with restarting as a new light run as the only path?

**Answer:** Trent: lowering rigor is "a workflow that we shouldn't be doing
generally". Prohibit it; restarting the whole workflow is always the human's way out.
"Yes, this is clearly the way to go … We're saying that you can't reduce rigor at
all. It's a simple rule for people to understand, and there's always an out for the
human to restart the whole workflow again."

**Decision:**
- A run's rigor can rise (light → full) but never fall.
- Full → light is rejected for every actor and autonomy setting, with a message
  naming the path forward: start a new light run (new topic branch and feature home).
- The old run's evidence is retained and abandoned, not resolved.
- No restart-in-place operation is added now.
- Supersedes D5's full → light row.

