# Light Run Procedure

Use this procedure only when the current run's `status` reports
`dials.rigor: light`, or when the human has just answered "light" to the
up-front "full or light?" question. Read
`<plugin-root>/resources/PROTOCOL.md` (Run dials, Light rigor, Tripwires,
Delegated autonomy, Delivery targets) for the exact operation inputs. Do not load the full planning procedures
(design, spec-draft, spec-validate, plan, branch-bootstrap) for a light run.

## 1. Choose and start

- Light is an explicit per-run human choice. No configuration makes a run light,
  and "forgot to choose" means full.
- Start the run with `run.start` and
  `rigor: {value: "light", authority: <the human's observed instruction>, reason}`.
  Autonomy stays `supervised` unless the human explicitly delegates this run.
- A full run never becomes light. To work light after starting full, start a new
  light run on a new topic branch and feature home; the old run and its evidence
  stay retained.

## 2. Write the brief

`brief.md` in the feature home is the run's only planning commitment. It needs
these headings (content is the agent's; GateReeve checks the structure):

```markdown
# Brief - <featureId>

## Goal
What the change must achieve, in observable terms.

## Scope
What is in and out: files, behavior, interfaces.

## Findings log
- Dated notes on discoveries, decisions and scope questions during the run.
```

No interview, design, spec, plan, issues or spec validation is required.

## 3. Get implementation authority

**Supervised.** Show the brief to the human and wait. Record their explicit
confirmation as `human.decide` kind `authorize-implementation` against the
brief-derived subject from `status` `commitments`. Changing the brief afterwards
invalidates that authority: show the changed brief and record a new authorization
before continuing. `amend` is not used in a light run.

**Delegated** (only when the human delegated this run by name). Run
`planning.review` with `artifact: "brief"` in a fresh independent context. On
PASS, record `authorize-implementation` with authority
`{kind: "delegated-evaluator", delegation: <status delegation.event>, evaluation: <the PLANNING_REVIEWED event>}`.
A FAIL means fix the brief and review again, or hand back. Updating the findings
log needs a new brief review and delegated re-authorization; any other change to
the brief (preamble, goal, scope, sub-headings or other sections) is a scope
change that hands control back to the human. After any hand-back, stop: a human
`authorize-implementation` is needed before more implementation, candidates or
gates.

## 4. Implement and keep the findings log

Work freely within the authorized phase. Keep the findings log current. If the
work turns out to need design or specification (risky schema, auth, public API or
data-deletion changes, or a scope the brief does not cover), raise rigor with
`run.set-dial` `{dial: "rigor", value: "full", reason}`; then backfill interview,
design, spec, plan and issues and follow the full workflow.

**Tripwires.** `candidate.prepare` classifies the change (migrations/schema,
auth/security, secrets, public API, data deletion, plus the repository's
`.gatereeve/tripwires.json`), and acceptance checks it again. The result's
`tripwires` and `status` `tripwires` list the hits.

- Supervised: a hit blocks acceptance. Stop and show the hits to the human. Either
  raise rigor to full, or record their explicit decision to stay light as
  `human.decide` kind `stay-light` with `subject` = `status` `tripwires.subject`
  and their reason. Never record stay-light on your own judgment. A later
  candidate with new hits needs a new decision.
- Delegated: a hit raises rigor to full automatically. Continue with the full
  workflow (delegated planning still needs independent planning review PASSes).

## 5. Acceptance

Light acceptance requires the same gates as full: `context`, `review`,
`verification` and `packet`, and `retention` at completion.

- Prepare the candidate with `criteria: ["brief"]` (no rubric IDs).
- Run `verification` with real checks. Record provenance honestly: agent-run
  receipts, hosted CI on the exact head, or none. "No CI checks" is never green CI.
- Run `review` in a fresh, independent context. It assesses code defects and
  interactions, verification sufficiency and scope against the brief's goal and
  scope. `spec`, `judge`, `reconcile` and `triage` are refused for a brief-based
  candidate; `code`, `pattern` and `explanation` remain available.
- Run `review.publish` so the PR description carries the current review summary
  before presenting the PR for human review or merge authorization.
- Supervised: present the candidate and risks for the human's `accept`.
- Delegated: for a `SLICE` PR into a distinct integration branch with every
  required gate PASS, `merge.prepare` then `delegation.apply` with that action
  records the delegated acceptance and merge authority. Anything else (a `FEATURE`
  PR, a release-branch target, a gate that is not PASS) goes to the human.

## 6. Merge

Merges go through `merge.prepare` and `merge.execute`, never a shell
`gh pr merge`, `gh api` merge call or `git push` to the integration or release
branch (the PreToolUse guard denies the common forms on a best-effort basis). A
release-branch merge needs a per-PR human instruction ("merge #N") recorded as
`authorize-merge`; the agent then runs `merge.execute`. A hosting-rule refusal is
an external blocker to report to the human, not a gate failure.

## 7. Delegation hand-back

Under delegation, stop and hand control back to the human when any trigger fires.
GateReeve records the hand-back itself for an amendment or brief scope change, an
external merge blocker and observed loss of release-branch protection. When you
are uncertain, hand back yourself with `run.set-dial`
`{dial: "autonomy", value: "supervised", actor: "agent", reason}`; that is always
allowed. Only the human can delegate again.
