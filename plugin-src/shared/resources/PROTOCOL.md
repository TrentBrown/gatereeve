# GateReeve current protocol

`resources/protocol/plugin-adapter.js` is the authoritative native adapter.
The optional `gatereeve` CLI and desktop read the same current contract,
`gatereeve/current/8`. Send one JSON request on stdin or via `--request-file`:

```json
{"operation":"status","cwd":"/absolute/workspace"}
```

Use `status` before a milestone; use `milestone.check` for eligibility and the
protected operation for passage. Readiness is a declaration, not a review launch.
The core does not constrain individual edits, commits or the model's chosen
execution order. Missing/failed proof leaves repair available. There is no
remediation-attempt cap. Respect explicit human pause/escalation instructions.

## Operations

All mutations take `input` and an optional stable `operationId`. Reuse the same
identity and exact input after an uncertain response. Conflicting reuse fails.

| Operation | Input and purpose |
| --- | --- |
| `status`, `snapshot`, `next` | Current phase, commitment hashes, obligations, applicability, exceptions and milestone blockers |
| `read` | Top-level `kind` = artifact/events/model/result; artifact/result `id` must come from status |
| `run.start` | `implementers`: actual implementing context IDs; optional `runId`, `optionalGates: ["whiteboard"]`, `rigor`/`autonomy` choices `{value, authority?, reason?}` (defaults `full`/`supervised`; every explicit choice needs `authority` or `reason`, and a non-default value needs an observed human `authority`; `delegated` and `autonomous` also need the protected release branch; autonomous additionally needs a fixed human mandate); optional `workspace: {confirmFeature, authority}` or `{replace: true, authority}` (see Workspace configuration). In a repository with a GitHub remote and no workspace configuration it writes a minimal one and records it in `STARTED.workspace` |
| `workspace.configure` | Optional `{confirmFeature, authority}` or `{replace: true, authority}`. For an existing run without a workspace configuration, write it under the run-start rules and record `WORKSPACE_CONFIGURED`; reports `written: false` when the configuration already names the feature |
| `run.set-dial` | `dial: rigor|autonomy`, `value`, `actor: human|agent`, `reason`, `authority` (required for `human`, forbidden for `agent`). Raising rigor or returning to supervised is open to either actor. Rigor never falls within a run: to work light, start a new light run on a new topic branch; this run and its evidence stay retained. Asking for `light` on a light run reports that it is already light Delegating (`autonomy: delegated`) is human-only, must name the run (`runId`) and needs the release branch observed as protected (see Delegated autonomy) |
| `planning.review` | `artifact: design|spec|brief`, `configuration: {provider, model, reasoningEffort?}`; an independent fresh-context review of the planning artifact, recorded as `PLANNING_REVIEWED` with its exact subject. A delegated planning decision cites a PASS |
| `delegation.apply` | `action`: the exact prepared `SLICE` merge action into the integration branch. Under delegation only: records `accept` + `authorize-merge` with the `delegated-evaluator` authority when every required gate PASSes and the review summary is published |
| `run.resume-current` | Same run identity; optional `planning.design` and `planning.implementation` observed human decisions. Establishes current authority without interpreting old journals. When nothing is retained to resume (no current run and no earlier activation), it starts a fresh run under the `run.start` workspace rules, including `workspace`; resuming an existing run or activation refuses `workspace` and writes nothing |
| `human.decide` | See decisions below |
| `decision.ask` | `kind`, optional `subject`, `question` (at most 500 characters): record that a decision question is being presented to the human, as a `DECISION_PENDING` event with `asked: true`. It carries no authority and is not a pending decision; metrics measure the human's wait from it to the human-confirmed answer of the same kind |
| `spec.validate` | Run trusted spec lint after the model's semantic review of AC, rubric and boundary feasibility |
| `candidate.prepare` | `repositories: [{alias,base,head,target?}]` full commit IDs, `scope: SLICE|FEATURE`, `criteria: ["R1", ...]`; FEATURE requires every rubric row. A full-rigor run fails naming `decisions.md` when the feature's decisions log is missing. A light run has no rubric: `criteria` is exactly `["brief"]` for either scope, and its change is classified by the tripwires (result `tripwires`) |
| `candidate.ready` | Declare the pinned candidate ready; launches nothing |
| `gate.execute` | `gates: [id]` or `["code","spec"]`, explicit `configuration`, typed `consumed`, bounded `history`, labeled `claims`, optional `prior` for a delta |
| `job.abandon` | `jobId`, `reason`: records `JOB_ABANDONED` for a pending verification or acceptance-assessment job whose owning process is verifiably gone (its recorded process identity no longer matches). An abandoned job no longer invalidates proof recorded before it. Refused for a live process, a job with a retained outcome (reconcile it), a job without an owner record, and delivery (completion) jobs |
| `milestone.check` | `name: implementation|acceptance|merge|completion`; reports missing proof/authority without writing |
| `milestone.pass` | Record an allowed milestone; merge must use its protected action |
| `merge.prepare` | `repository`, PR `number`, `method`; derive the exact source/target action, including `deliveryTarget: integration|release`, to present for authorization. In default open delivery the PR must be open; a draft and a PR ready for review are both accepted, and draft status is not part of the action. Rejects a PR whose candidate scope does not match its target (see Delivery targets). Without a workspace configuration it fails naming `workspace.configure` |
| `review.select` | `observations`, exactly two `reviewers`, `reason`, optional developer `instruction` and replacement `previous` selection event. Record runtime discovery and daily-driver/high-effort choices after applying configured reviewer preferences |
| `review.execute` | Run the selected pair in parallel; optional `consumed`, bounded `history`/`claims`, `coverageClaims`, per-provider `prior` and shared non-identity `configuration`. Requires a current passing verification: order `candidate.prepare` → `gate.execute ["verification"]` → `review.execute`; without one it refuses with `VERIFICATION_REQUIRED` and records nothing (see Paired review outcomes). Individual `gate.execute review` results alone do not satisfy acceptance |
| `review.adjudicate` | Autonomous authority (`mandated` or `goal`) only: exact `candidate` hash and `pair` identity, complete material-finding `dispositions`, `reason`, retained `evidence`, optional `stopReason`; preserves original reviewer outcomes |
| `review.publish` | `repository`, PR `number`; write the current independent `review` summary for the candidate head into a delimited section of the PR description. Idempotent; refuses without a current qualifying review result or when the PR head differs from the candidate head |
| `merge.execute` | Same action selector; requires current proof, human acceptance, authorization bound to the prepared action and the current review summary on the PR. A hosting-rule refusal fails with `EXTERNAL_BLOCKER`, not a gate failure |
| `integration.observe` | `repository`, optional configured `branch`; fetch and verify actual reviewed-content integration, independent of acceptance |
| `run.pause`, `run.continue` | Actual `authority` instruction; continuation never follows merely from elapsed time. A human `run.continue` also clears a goal park |
| `goal.park` | Goal autonomy only: `pr: {repository, number}`, non-empty `blockers` and `evidence`. The PR must be open (draft or ready for review) and its description must list every blocker. Records `PARKED`; `status` `goal.terminal` becomes `parked` (see Goal autonomy) |

Unsupported old operations are rejected. Start a current run; do not replay,
convert, overwrite or delete old locks/journals. A resume with missing approvals
reports those obligations. Supply observed prior instructions for unchanged
commitments; ask only for genuinely missing decisions. Do not restart an
unchanged interview or invent provenance.

## Run dials

Every run carries `rigor` (`full | light`) and `autonomy` (`supervised | delegated | mandated | goal`; `mandated` was called `autonomous` before current/8 goal autonomy, and `autonomous` remains an accepted alias that records and replays as `mandated`),
recorded in `STARTED` and in each `DIAL_SET` event with value, source
(`explicit | built-in`), actor, instruction or reason, and time. Defaults are
`full` and `supervised`. No global, repository or workspace configuration changes
them. `status` reports current values in `dials` and the defaults in
`dialDefaults`, and the configured delivery branches in `branches`. With no run,
ask the human "full or light?" before non-trivial work. Delegated autonomy is a
human decision naming the run (see Delegated autonomy). `DIAL_SET` events the
protocol records itself carry `source: automatic`, `actor: gatereeve` and a
`trigger` (`tripwire` raises rigor; `amend`, `external-blocker` and
`protection-lost` return autonomy to supervised). A run from an earlier contract is retained unchanged and
reported as needing `run.resume-current`; the resumed run starts at the defaults
unless a choice is supplied.

### Light rigor

A light run's sole planning commitment is `brief.md` in the feature home, with
goal, scope and findings-log sections. Interview, design, spec, plan, issues and
spec validation are not required. The commitment subject is derived from the
brief (contract, feature, `rigor: light`, brief hash) and appears in `status`
`commitments`. Under supervision, a human `authorize-implementation` naming that
subject is the implementation authority; no `approve-design` or `spec.validate`
precedes it. It is accepted in any phase before integration. The findings log
may grow during the run: while the brief matches the authorized brief outside its
findings log section (with its nested sub-headings), `commitments`
keeps the authorized subject and no new decision is needed. Whitespace compares
as Markdown renders it: in prose, trailing whitespace and inner whitespace runs
are ignored, a blank line counts as a block separator (runs of blank lines count
as one; blank lines at the ends are ignored), leading indentation counts (it carries list
structure), and a hard line break counts (two or more trailing spaces before a line
that is neither blank nor a heading; the number of spaces does not matter); fenced
code, lines indented four or more columns (tabs advance to the
next multiple of four; indented code, including blank lines between such lines),
raw HTML `<pre>`, `<textarea>`, `<script>` and `<style>` content (from the line
that opens the tag, unescaped and outside code and HTML comments, to the line that closes it,
or to the end when unclosed; tracked outside the findings log only, and headings
are still found there) and inline code spans compare verbatim. The same
comparison decides a delegated hand-back. Any other change
(goal, scope, preamble or another section) no longer matches the authorized
subject, so implementation, candidates and gates stop until the changed brief is
authorized again; that decision supersedes earlier authority, acceptance and
exceptions. A candidate still pins the exact brief bytes, so a findings-log edit
after `candidate.prepare` needs a fresh candidate (no human decision). `amend` is
refused while light.

Raising rigor to full voids the brief-bound authority: the subject becomes the
full design/spec subject and the phase returns to `DESIGNING`. Backfill interview,
design, spec, plan and issues, then record `approve-design`, `spec.validate` and a
new `authorize-implementation` and prepare a rubric candidate before acceptance.
Light candidates and their evidence do not qualify for the full candidate.

Light acceptance requires the same gates as full (context, review, verification
and packet; retention and the other completion obligations at completion).
The step-by-step light procedure is `resources/commands/light-run.md`; skills route
light runs to it instead of the full planning procedures.

### Tripwires

Light candidates are classified by deterministic tripwires at `candidate.prepare`
and again at every milestone check from acceptance on. Path rules match every
changed path between the candidate's base and head (added, modified or deleted);
content rules match lines the head adds (binary files and files over 1 MiB are
classified by path only and listed as `skipped`). Built-in categories:

| Category | Built-in rules (examples) |
| --- | --- |
| `migrations-schema` | `migrations/`, `migrate/`, `alembic/` paths; `*.sql`, `*.prisma`, `schema.rb`; `schema/` directories; added `CREATE/ALTER/DROP TABLE...`, `ADD COLUMN`, migration calls |
| `auth-security` | path segments such as `auth`, `security`, `permissions`, `oauth`, `login`, `password`, `credentials`, `crypto`, `rbac`, `acl`, `jwt`, `session`; any change to `.gatereeve/tripwires.json` |
| `secrets` | `.env*`, key material (`*.pem`, `*.key`, `*.p12`, ...), `id_rsa`-style keys, `credentials*`/`secrets*`, `.npmrc`/`.netrc`; added private-key blocks, AWS, GitHub, Slack and provider API keys, quoted secret assignments |
| `public-api` | OpenAPI/Swagger documents, `*.proto`, GraphQL schemas, `*.avsc`, `*.schema.json`, `*.d.ts` |
| `data-deletion` | added `DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE FROM`, bulk-delete calls, recursive removal |

A repository extends or narrows them in `.gatereeve/tripwires.json` (modeled on
pattern-review triggers), read from the candidate's pinned **base** commit so a
change cannot weaken its own tripwires:

```json
{"schemaVersion":1,"categories":{"public-api":{"paths":["plugin-src/contracts/**"],"content":[{"pattern":"export\\s+interface","ignoreCase":true}]},"secrets":{"excludePaths":["test/fixtures/**"]},"auth-security":{"builtIn":false}}}
```

`paths`/`excludePaths` are globs (`**`, `*`, `?`, `{a,b}`; no `/` matches the file
name anywhere), `content` entries are regular expressions, and `builtIn: false`
drops a category's built-in patterns (never the configuration-file rule). An
invalid configuration makes classification unavailable, which blocks acceptance.
Hits record category, rule, repository, path and line, never matched text; they
are recorded in `TRIPWIRES_EVALUATED` and shown in `status` `tripwires`.

- **Supervised:** a hit blocks acceptance until the human escalates to full
  (`run.set-dial rigor full`) or records `stay-light` with `subject` equal to the
  hit-set identity in `status` `tripwires.subject`. That decision covers only the
  hits it names: a new hit needs a new decision, and a re-authorized brief voids it.
  A hit is identified by category, rule, repository and path, not by line or
  content, so further risky content added to an already-covered path under the
  same rule stays covered (deliberate: fix iterations on the same hits do not
  re-ask). Re-check such paths before relying on a stay-light decision.
- **Delegated:** a hit raises rigor to full automatically (recorded `DIAL_SET`,
  `trigger: tripwire`), at preparation or when acceptance or `delegation.apply` is
  attempted. Any `stay-light` decision is rejected.
- **Full rigor:** not classified. A run without hits is unaffected.

## Decisions

A decision includes `kind`, exact `subject` hash from current status or the
captured design, `reason`, `consequences` and:

```json
{"authority":{"kind":"human-confirmed","instruction":"Actual user quote","context":"Concrete proposal and conversation context"}}
```

Available message/conversation IDs are optional. This is a cooperative record,
not authentication. Kinds: `approve-design`, `authorize-implementation`, `accept`,
`waive`, `amend`, `policy-amend`, `authorize-merge`, `authorize-standing`,
`revoke-standing`, `stay-light` (see Tripwires).

Authority kinds: `human-confirmed` (an observed human instruction),
`delegated-evaluator` under delegated autonomy, and `autonomous-evaluator` under
explicit autonomous authority (see the current/8 sections below). Status,
snapshot and decision records always carry the kind; a delegated decision is never
reported or counted as human-confirmed.

`authorize-merge` (alone or as an `accept`/`waive` continuation) is refused
unless the PR description already carries the current review summary from
`review.publish` for the prepared head (see Delivery targets).

Waivers name `gates` and preserve FAIL/UNAVAILABLE. They default to this candidate.
A current `verification` waiver also covers the verification obligations checked
after a PASS outcome (prior-behavior coverage, the assessed-evidence or CI
qualification and the hosted-CI exact-head check): each waived residual is kept
on the verification outcome as `waivedCoverage` (and so in the acceptance
`MILESTONE` record) instead of blocking. A `waive` decision records `observed`:
each waived gate's outcome, reason and any `waivedCoverage` from the milestone
check when the human decided. A waive-and-accept that is still blocked is refused
naming what is missing. A PASS with `waivedCoverage` is not a passing gate for
standing, delegated or autonomous acceptance, adjudication and merge (they still
need every required gate to PASS), and the PR explainer shows each waived
residual.
Optional `findings` narrows an exception to named current blocking findings; it
cannot satisfy another finding. The core binds command/configuration, evaluator
rules, blocking findings and live runtime assumptions, including consumed proof
transitively, external expiry, current pattern policy, support documents and integration state. Changed risk needs a new scoped decision. An interrupted decision
retains its original risk scope; repeating it never expands that authority.
Unknown decision fields are rejected rather than silently ignored.
An amendment names the latest commitment decision in `previousSubject`; old/new documents remain retained. It supersedes earlier direct planning, candidate acceptance, merge authority and exceptions even when old bytes return. If the
same instruction expressly authorizes implementation, use
`actions: ["authorize-implementation"]`; the core revalidates the amended spec.
A waiver can include `actions: ["accept","authorize-merge"]` only when the quote
expressly includes those actions and `action` is the exact prepared merge object.
No action is inferred from a risk acceptance. Explicit policy amendments can
change named reconciliation, triage, explanation or Whiteboard exception policy for this candidate; integrity, factual truth and actual authority cannot be waived. Explanation requires such a policy amendment. An ordinary enabled-Whiteboard waiver requires `waiverBasis: { classification: "NON_BEHAVIORAL", evidence: <retained reference> }` from the observed human decision. The basis bytes must remain intact. Behavioral or unknown changes require an explicit Whiteboard policy amendment instead.

Specification validation uses the current factual Markdown extractor, bound to its
parser, policy and Node runtime. Stable IDs and pass/fail/evidence fields are
required; layout is flexible. Duplicate or ambiguous requirements fail extraction.
Issue/tracker lint checks references; feature coverage and material-decision triage
are independent judgments batched into existing reviews. No per-task rubric mapping
or checkbox can grant passage. `spec.validate` refreshes unchanged commitments
without new implementation authority. Failed validation remains retained.
Python remains a leaf provider for Git integration/context checks; it does not
control semantic planning acceptance.

## Delegated autonomy

A human delegates one named run: `run.set-dial` with `dial: autonomy`,
`value: delegated`, `actor: human`, the observed instruction and `runId`, or an
explicit `autonomy` choice at `run.start`. Delegation is rejected unless every
configured repository's release branch is observed as protected through the
non-admin branches API (`GET repos/{owner}/{repo}/branches/{release}`, field
`protected`). The observations are recorded on the `DIAL_SET` (`protection`). The
Git fallback names no release branch, so it cannot delegate. There is no
configured or standing delegation for runs that do not exist yet. Status
`delegation` reports the event, instruction, scope, hand-back triggers, hand-backs
and delegated decisions.

**Planning.** `planning.review` runs an independent fresh-context review of
`design` (design.md, approve-design), `spec` (spec, design, plan and issues,
authorize-implementation) or `brief` (brief.md, light authorize-implementation).
While delegated, `human.decide` for `approve-design` or `authorize-implementation`
may carry `{"kind":"delegated-evaluator","delegation":"<status delegation.event>","evaluation":"<PLANNING_REVIEWED event>"}`
instead of a human instruction. It is accepted only when the cited review is a PASS
of that artifact for exactly the decision's subject, no later review of that
subject supersedes it, the reviewer is not an implementing context and release
protection is re-observed. The recorded authority cites the delegation instruction
and the evaluator result. Full runs still need `spec.validate`. Other kinds, and
any delegated authority while supervised, are rejected. In a run raised from light
rigor (for example by a tripwire), design and spec reviews also receive the brief
last authorized while light and must block commitments that go beyond its goal or
scope; a delegated decision must cite such a review.

**Delivery.** `delegation.apply` accepts and authorizes the merge of a `SLICE`
candidate only for a prepared PR into a distinct integration branch, with every
required gate PASS (no exceptions) and the review summary published.
`merge.execute` then merges through the protected path after re-observing
protection. `FEATURE` PRs, release-branch merges and repositories whose
integration and release branches are the same have no delegated merge; they need
the per-PR human `authorize-merge`. `delivery.resume` applies delegation for a
SLICE PR into integration.

**Hand-back.** Autonomy returns to supervised, recorded as `DIAL_SET`, on:

- a scope-changing amendment: any `amend` recorded while delegated, or a light
  re-authorization of a brief that changed anywhere outside its findings section
  (the Findings heading and its nested sub-headings); preamble, goal, scope,
  sub-headings and any other section count as scope. Under any authority: a
  delegated one is refused and hands back; a human-confirmed one is recorded and
  hands back (the `DIAL_SET` precedes the `DECIDED`);
- an agent hand-back (`run.set-dial autonomy supervised`, `actor: agent`, with a
  reason; always allowed);
- an external merge blocker (`MERGE_BLOCKED`). The recorded blocker voids the
  delegation's authority even if recording the hand-back fails (the error then
  carries `handBackFailed: true`);
- release-branch protection observed lost before a delegated decision,
  `delegation.apply` or a delegated merge. An unobservable state refuses the
  action without handing back.

After a hand-back the delegated acceptance no longer authorizes, delegated
decisions are refused, and a delegated `authorize-implementation` no longer
counts: implementation, candidates and gates stop until the human records
`authorize-implementation` (a full run may re-authorize its unchanged validated
commitments in place). `status` shows a `hand-back` blocker until a human decision
is observed. Only a human can delegate again.

## Execution and evidence

Required acceptance obligations: context, verification, review and packet, in
both rigors. Two fresh independent cross-provider `review` perspectives each cover code defects/interactions, every approved
criterion, validation sufficiency, scope/decision reconciliation, project rules,
findings/fixes and a useful human explanation. Each perspective's five explicit responsibility
conclusions are `code`, `requirements`, `evidence`, `scope`, `findings`.
`code`, `spec`, `judge`, `reconcile`, `triage`, `pattern` and `explanation` remain
available supplemental assessments, not a mandatory second review sequence.
Completion retains finalization, release observation, retention, whole-feature
coverage and actual integration. Whiteboard remains opt-in.

In a light run the requirement basis is `requirements/brief.md`. The `review`
gate assesses code defects and interactions, verification sufficiency and scope
against the brief's goal and scope, scoring the single `brief` criterion, with the
same fresh independent-evaluator qualification as full. Blocking findings use
`brief` or `gate:<gate>`; findings about the brief cite `requirements/brief.md`.
Rubric criteria and spec/planning paths are rejected. `spec`, `judge`,
`reconcile` and `triage` need a rubric or planning record and are refused for a
brief-based candidate; `code`, `pattern`, `explanation` and an enabled Whiteboard
remain available.

Use the test pyramid as a heuristic: choose quick focused deterministic checks
and useful early independent discovery while implementing. Run wider integration
and browser checks when changed behavior warrants them. The agent chooses order,
review count, batching, scope and model diversity, within the round policy below.
Strongly consider independent models for consequential persistence/authority
changes, uncertain findings, repeated misses or divergent conclusions. Record a
short strategy/reason through `workflow.observe`, preferably at an existing work
boundary. Ordinary implementer self-review is not another mandatory gate.

### Round policy

Each review scope has a round counter: the slice PR candidate scope (`slice`),
the feature-final review (`feature-final`) or one planning document
(`planning:<artifact>`). One round is one paired review of one candidate revision
(one planning review of one document revision), including rounds where a reviewer
ran and was UNAVAILABLE. A round in which no reviewer was launched (every outcome
`refused`, see Paired review outcomes) is not counted. Only consecutive reviews of one revision share a round: returning
to an earlier revision is a new round, so the counter never moves backwards, and
retained proof of an earlier revision is qualified under the scope's next round
(it cannot pass the round 6 hand-back). Planning regression history reads every
completed planning review of the scope, retries of one revision included. Only a
human-approved amendment (`amend`, or in a light run a human re-authorization of a
changed brief) resets the counters; observing a slice's integration closes its
scope, so the next slice PR starts at round 1. Rounds executed before this policy
are not counted. `status.rounds` shows each scope, its round and band, and advice.

- Rounds 1-3: every in-scope finding with a failure scenario that is not low
  blocks (the reviewer's `blocking` flag).
- Rounds 4-5: only `high` findings and `medium` regressions of the previous fix
  block. A regression is a finding new in this round on a path (planning: a
  document) the previous round's fix changed; it keeps the status of the round
  that first raised it, even when re-reported, until it is resolved; a finding
  fixed and later reintroduced is judged afresh. A finding of a class a `fixed`
  claim swept (its `classId` equals a sweep record's `classId`, from a round no
  later than this one) is also a regression of the previous fix, whether it is
  new or an earlier finding still present, unless it is that record's own
  claimed finding (see Fix claims and sweep records). Peer reviews of one round are
  judged together: a finding counts as resolved only when no other reviewer of
  that round still marks it present or re-reports it as a finding (an ID an
  earlier report raised), so a disagreement keeps its regression status. Within
  a round each provider's latest report is its perspective, so a same-revision
  re-review (for example after a disputed claim) supersedes that provider's
  earlier report, and the round that first raised a finding can still close
  it; the next round's history carries every closure of the finding, so a
  finding resolved and later reintroduced keeps being judged from its
  reintroduction. A round is the round policy's scope epoch (how many times the scope
  has closed), round and revision (`packet.roundPolicy` carries all of them),
  so two individual selection-tagged reviews of one revision are judged as one
  round. A planning round that failed at
  the provider keeps its documents as the next round's regression baseline. Reviewers
  receive `packet.roundPolicy` (scope, round, band and the previous fix's changed
  paths) and apply the band themselves. Other findings stop blocking and stay
  visible on the pair member (`demotedFindings`). The mechanical demotion only
  corrects a blocking flag the band no longer allows: a reviewer FAIL counts as
  PASS for the pair only when it rests on demoted findings alone, with every
  criterion, responsibility and coverage decision passing, complete coverage and
  a passing mandate; any failed row keeps the FAIL. Such a demoted peer FAIL is
  not newer blocking evidence against the other reviewer's PASS in the same
  round.
- Low never blocks in any round, including a low regression. Findings without a
  severity (earlier contracts) read as `unrated` and block exactly as before.
- Round 6: the review is not qualifying until the human records
  `human.decide {kind:"review-rounds", reviewScope, choice:"continue"|"split",
  subject}` (subject: the current candidate hash, or for a planning scope its
  current document revision), an `amend`, or a `waive`. After continue, later
  rounds keep the round 4-5 band; a split ends the scope, so each part starts at
  round 1. A new revision is not reviewed past round
  6 until then. In a goal run the hand-back is `goal.park` with the PR and round
  evidence. `review.adjudicate` (and autonomous planning judgment) at round 6 or
  later is refused.

A round is counted (`ROUND_COUNTED`) when the first review of a new revision
starts, on every entry path: `review.execute`, an individual selection-tagged
`gate.execute` review, or a planning review. A provider error, timeout or
malformed output therefore still uses its round. A new revision past round 6 is
refused without the human decision. A review run under this policy records
`roundPolicy` in its input.

Every execution input records `reviewContractVersion`. A result retained from an
earlier version keeps its recorded qualification on resume although the
evaluator rules changed since (spec AC11); within one version the rules
fingerprint must match exactly.

Planning reviews and light runs follow the same schedule; when a light run's
counter reaches 4, `status` advises raising rigor (advice only).

Runner configuration is `checks: [{repository,command,args,purpose,ciCheck?,timeoutMs?,replaces?}]`.
`replaces: [{repository?,command,args,reason}]` declares earlier check identities
the check replaces (the repository defaults to the check's own). Each declaration
becomes a `check-replacement` coverage claim in any review, spec or judge
assessment that consumes the verification; acceptance counts the replaced identity
as covered once that assessment passes the matching coverage decision, with no
extra round. A rejected replacement leaves the identity uncovered.
No dependency directory, toolchain or external runtime-tree fingerprint is taken.
`externalRuntimeInputs` from older configurations is historical declaration only;
it creates no equivalence assurance. Declared controlled environment, runtime
metadata, source/configuration, actual command results and artifact integrity are
retained. Source and approved-document hashes remain authoritative for their own
purposes. A local check is an observation at execution time, never proof that
mutable installed dependencies or remote services remain unchanged.

For acceptance, the consumed Verification must include `configuration.validation`:
`{kind:"ci", runs:[{alias,repository,run,attempt,requiredChecks:[...]}]}` fetches
actual completed GitHub jobs for the exact candidate head. Executed, skipped and
failed jobs remain visible; the independent review assesses the declared required
scope. Missing/insufficient CI can use `{kind:"alternative",reason,scope}` with
actual local check receipts. This is a proposal until independently assessed.
A green badge alone is insufficient. Focused local loops do not require this
broad backstop until acceptance is requested. A CI run reporting no jobs is "no CI
checks" and leaves Verification UNAVAILABLE; it is never passing CI.

**CI after review convergence.** `candidate.prepare`, `review.execute` and
`alternative` Verification work on a head that exists only as a local commit.
During rounds, the Verification a round consumes needs at least one passing
runner receipt on the candidate tree (otherwise the review is not qualifying), plus
receipts for the focused tests of every changed source area and every affected
test suite; reviewers assess that coverage in the evidence dimension and report a
missing receipt as an evidence finding. After the scope converges, push once and
record a `ci` Verification for the exact head (`checks` may be empty for a `ci`
Verification). A runner-role check, with no model call, qualifies it against the
converged reviews: the run is on the exact candidate head (a same-tree other
commit never qualifies); every CI job the converged reviews' consumed local
Verification planned in `validation.ciRequiredChecks` (assessed by the
reviewers during the rounds; a list applies to every selected repository, an
object names jobs per repository alias) is a passing required check of that
repository's run; every required check
passed, every other job of the run succeeded or was skipped; and every local
receipt the reviews
consumed is covered, either because its `ciCheck` (else its `purpose`) is among
the run's passing required checks, or because the final Verification carries a
passing receipt of the same check on the identical tree. An uncovered receipt
fails the check by name. A qualified CI Verification keeps the converged reviews
qualifying and reusable (`review.execute` reuses them; reuse reason
`ci-qualified`); `milestone.check` shows the result as `ciQualification` on the
verification outcome. A `ci` Verification for a different tree is rejected naming
both trees, and a different commit with the same tree is not the exact head.
Acceptance refuses a latest Verification that is local evidence the converged
reviews did not assess (rerunning the same checks on the same tree is the same
evidence). A candidate repository with hosted CI (workflows under
`.github/workflows/` in its tree) is accepted only on a passing `ci`
Verification for the exact candidate head; local evidence alone never suffices
there. A repository without hosted CI keeps the independently assessed local
alternative (interview D35). These acceptance rules apply once a pair member was reviewed under
the round policy; a pair retained from an earlier contract keeps its recorded
qualification (spec AC11). After a hosted CI failure, fix locally, run one paired delta review of
the fix (one round), then rerun hosted CI. The PreToolUse guard warns, without
denying, on `git push` to a topic branch while the current candidate's paired
review is not a qualifying PASS.

Every Verification result and runner record carries `provenance` (both rigors):
`agentRun` lists each agent-run command with outcome and receipt (index and
retained stdout/stderr), `hostedCi` lists each CI run observed on the exact head
with its jobs, `none` marks the absence of both, and `summary` states "no CI
checks" whenever no hosted job was observed. The summary is appended to the
result summary, and the verification outcome in `milestone.check`/`status`
includes the structured `provenance`.

The effective per-check limit is `check.timeoutMs ?? configuration.timeoutMs ??
600000` milliseconds. For example, `configuration.timeoutMs: 5400000` allows a
90-minute integration check. Limits must be integers from zero through
2147483647; an explicit zero disables the timer. Receipts record the effective
limit and distinguish an actual timeout from a nonzero exit or process/launch
failure. A timeout remains UNAVAILABLE and does not count as a completed check.

Declared execution context is checked before/after execution and on reuse.
Context comparison does not enumerate runtime trees or require a per-file cache.
Changed source, approved requirements, configuration, explicit validity or
consumed evidence still invalidates applicability. Preserve every executed
receipt when postflight fails. Never relabel past checks as fresh executions.

Request
real project build/lint/test/runtime checks; do not substitute `true` or a fabricated
receipt. Only results in a completed recorded job and its retained service
outcome can qualify. Passing runner results require successful receipts for all
declared checks; copied result objects cannot become consumed or delta proof.
The public provider receipt contract is `2.1.0` with `read-only/deny/isolated`
policy; old provider receipt requests are rejected. Release-observer messages
use their separate observation contract, not an old workflow interpreter.
Finalization checks bind the observed integration SHA. Publishing or
deploying needs separate explicit authority; a generic check request is not that
authority. The model chooses substantive checks appropriate to approved scope.

Independent configuration names `provider: codex|claude-code` and explicit
`model`, optionally `reasoningEffort`. Each boundary review uses a fresh context independent of implementation and its peer, and
consumes applicable Verification. Supplemental assessments are optional. Prior reports are context, not
instructions; claimed dispositions are labeled. Reviewers must find new
supported defects, verify affected fixes and cover interactions. Missing or
contradictory output is UNAVAILABLE, never PASS.

**Idle-stop inhibitor.** Reviewers wait on the model API for long quiet
stretches. On Linux, when `systemd-inhibit` is on `PATH` and grants the lock,
every reviewer process runs as `systemd-inhibit --what=idle --mode=block
--who=GateReeve --why="<provider> <role> review: <feature>"` (the reason is at
most 120 characters, single-line, and carries no prompt text or environment
values; every local user can read it with `systemd-inhibit --list`). The lock
belongs to the reviewer process and is released when it exits or crashes, so
idle-stop automation such as Fleet treats the host as busy while a review runs.
A refused lock, a missing `systemd-inhibit` or another platform launches the
reviewer exactly as before. Receipts record `isolation.idleInhibitor:
true|false`. The wrapped launch stays in the evaluator's process group, so an
interrupt or cancellation of the evaluator still ends the reviewer and releases
the lock. A timeout or the output limit sends SIGTERM and, two seconds later,
SIGKILL to the wrapper, the descendants recorded before the first signal and
any they started since; the SIGKILL fires even if the wrapper has already
closed, so a reviewer that ignores SIGTERM is still ended.

Frozen requirements, source manifests, inputs, results and receipts live beneath
canonical `docs/issues/<featureId>/.gatereeve-current/`. Git is optional for those
records. Source itself remains in Git, protected by owner/run-specific refs under
`refs/gatereeve/`; source files are not copied into the retained evidence store.
Candidate publication requires complete owned base/head/target pins and filtered
manifests. Exact commits establish provenance; equivalent filtered content can
still reuse qualifying evidence. Routine qualification checks identities and
object availability, trusting Git between substantive reads. Reviewer views verify
raw blob contents while streaming, then expose complete isolated source trees.

Path-recognized records are excluded before blob reads; ambiguous workflow JSON
has an 8 MiB classification bound and rejects above it with a specific diagnostic.
The retained metadata/evidence object's 64 MiB limit remains; there is no aggregate
source byte limit. Symlinks and gitlinks retain the existing non-following view
semantics. No checkout filters, archive substitutions or implicit source fetches
are used. Source Git must support `--no-lazy-fetch`; older unsupported Git fails
closed rather than silently fetching missing objects. Missing source blocks
affected proof and requires repair or fresh review.

Retain non-source referenced evidence, including failed specification validation
inputs and diagnostics. Lost failed-validation proof stays visible after later
success and blocks retention until restored. This refactor does not prune old
source-copy stores or change log retention. No automatic bundles or backups are
created. Deleting workspace data still requires scoped authorization.

Completion checks run with source pins intact. After durable completion, release
only the completed run's refs not needed by active jobs; independent active runs
own their own pins. Interrupted or conflicting cleanup stays pending and retries
on a later mutation. Status is read-only. Historical completion survives expected
pin release; missing retained non-source evidence is still reported. Later reuse
requires available source and active ownership, never an assumption that the old
refs survived. Current/4 does not qualify old source-copy proof: resume unchanged
planning with observed approvals and obtain fresh validation. Historical files
remain intact.

Equivalent qualifying input content permits reuse; bookkeeping and identical-tree
SHAs alone do not require reruns. Changed requirements, configuration, declared
environment assumptions or consumed proof require refresh. Unknown
relevance means wider proof. Qualified deltas retain earlier proof and explicitly
cover changed paths/interactions. Provider retries reconcile recorded jobs;
uncertain in-flight jobs do not automatically relaunch. Repository selections and
compatible gate sets have canonical identity independent of caller ordering.
The latest qualified review may reuse its own finding closures when explicit
claims, selected history, consumed proof and other inputs remain equivalent;
a later failure cannot be skipped to resurrect an older pass.

## Enforcement coverage

Protected merge and milestone adapters consult the core and deny unavailable
checks. Milestone checks bind the checked run and journal revision; a concurrent
state change requires a fresh check. Protected merge keeps the same candidate
and authority state through hosted waiting and the write, and its integration
observation cannot be attributed to a replacement candidate. Arbitrary shell writes
and GitHub actions outside these adapters are not claimed to be intercepted.

**Merge guard (best-effort).** Both packages configure a PreToolUse guard on
shell tool calls. It denies, with a reason:

- `gh pr merge` in any form, including `--auto`, `-R`/`--repo`, absolute or
  relative executable paths, environment prefixes and `sudo`/`env`/`command`/
  `exec`/`timeout`/`xargs` wrappers, and `gh alias set` for it;
- `gh api` calls to `repos/{owner}/{repo}/pulls/{n}/merge` with any method other
  than an explicit `GET`/`HEAD`, and GraphQL `mergePullRequest`/
  `enablePullRequestAutoMerge` mutations given inline;
- `git push` that would update a configured integration or release branch of any
  configured repository: explicit refspecs (`main`, `+main`, `HEAD:main`,
  `refs/heads/main`, `:main`, `--delete`), `--all`/`--mirror`, matching globs, and
  an implicit destination or `HEAD` while on that branch, and the matching
  refspec `:` or `+:` (it may update every protected branch). `--tags` with no
  other refspec pushes only tags and is allowed; with a protected refspec it is
  denied. An unconfigured Git workspace names no protected branch; the
  configuration `run.start` writes protects the default branch. Protection is
  read from the repository the push acts on (below).

It follows quoting, `&&`/`||`/`;`/`|`/`&`/newline chains (each command of a chain
is checked), subshells, `$(...)` (including heredoc bodies inside it), backticks,
`bash -c`/`sh -c`, `eval`, `env -S` and shell heredocs, and leaves quoted text
(for example a commit message mentioning `gh pr merge`) and unrelated commands
alone.

*Coverage list: the repository a push acts on.* This is what spec AC7/R10
require (amended 2026-11-17). The repository is the directory Git runs in or,
when set, the Git directory (`--git-dir` over a `GIT_DIR=` prefix; a `.git`
directory stands for its parent). A work tree (`--work-tree`, `GIT_WORK_TREE`)
selects only the checkout. The directory starts at the hook's directory and
follows, in order:

- literal `cd`/`pushd` commands earlier in a plain top-level sequence joined by
  `;`, `&&` or newlines. A `cd` is assumed to succeed, except that a command
  right after `cd … ||` runs where the shell was. A `cd` after `&&` may not run,
  so a later push (after `;`) is checked both where it would run with and
  without it. `cd` in a pipeline, in the background or behind a wrapper such as
  `env`/`sudo` changes nothing;
- `env -C`/`--chdir` and `sudo -D`/`--chdir` wrappers, then each
  `git -C dir`/`-Cdir`. These and a `GIT_DIR=` prefix carry into `bash -c`,
  `eval` and `env -S` scripts. `env -S` splits its string into arguments (not
  shell syntax) and appends the remaining ones. `env -u GIT_DIR`/`--unset`/`-i`,
  `exec -c`, and `sudo` (unless `-E`/`--preserve-env`) or `doas`, drop the
  prefix. Wrapper options are read as the wrappers read them (clustered short
  options, unique long-option abbreviations); `pushd -n` and `popd -n` only edit
  the directory stack.

A push is checked in every directory it could act on, and denied if any of them
protects its destination. One with more possible directories than the guard
tracks is denied. Where the guard cannot name the directory, it admits the push
rather than deny an unrelated one.

*Best-effort limits (outside AC7/R10).*

- Directory or environment changes inside subshells, conditionals, loops,
  `case`, brace groups, functions or `eval`. Inside a `( … )` subshell the plain
  sequence rules above are applied until it ends; elsewhere the change is not
  followed, and afterwards a push that does not name an absolute directory or
  Git directory is admitted.
- Shell-variable state across commands (`export`/assignments/`unset` of
  `GIT_DIR`) is not followed. After a `GIT_DIR` assignment, a push without its
  own `--git-dir` or prefix is admitted.
- `env -S` escape sequences beyond quotes, `\_`, `\n` and `\t` are not
  interpreted.
- An option of `env`, `sudo`, `doas`, `exec`, `cd`, `pushd` or `popd` that the
  guard does not model (including `sudo -i`/`--login` and a `sudo` chroot)
  makes the directory and `GIT_DIR` unknown; the push is admitted unless it
  names an absolute directory or Git directory after it.
- `sudo`/`doas` environment policy beyond the defaults above is not modelled.
- A `cd` target or `GIT_DIR` value built from variables, `~`, `CDPATH`, `cd -`,
  a directory-stack entry or `popd` is not resolved (the directory becomes
  unknown).
- Scripts, aliases defined outside `gh`, shell functions, `source`d files,
  earlier tool calls, variables naming commands, request bodies from files and
  other clients are not seen.
- Commands assembled from substitutions (for example `$(echo gh) pr merge`) and
  scripts fed to a shell on standard input (`echo 'gh pr merge 1' | bash`) are not
  recognized.
- A missing, unreadable or malformed workspace configuration names no protected
  branch, so push denial is off there (merge denial still applies).

GitHub branch protection is the real enforcement. Merges go through `merge.prepare` and
`merge.execute`; a recognized merge is denied even when the milestone is eligible,
because the shell command is not bound to the prepared action.

**Recovery entry points.** Every denial and every `status` recovery action or
message names only entry points present in the current installation: the bundled
`resources/protocol/plugin-adapter.js` (`node <adapter> --request-file
<request.json>`, or `node <adapter> status --cwd <dir>`), and the `gatereeve` CLI
only when it is found on `PATH`. An adapter inside a packaged desktop archive is
not offered. `status` reports what it found in `entryPoints` and gives each
action an `entryPoint` (`cli`, `adapter` or `none`) and, for the adapter, a
`request` skeleton.

**SessionStart** is guidance in both native packages. It reports run state from
`status` rather than prescribing the full workflow: with no run, the built-in
defaults and the up-front "full or light?" question; for a run, its rigor,
autonomy, phase and blockers and a pointer to the light-run procedure
(`resources/commands/light-run.md`) or the full workflow; for a delegated run,
also the delegation scope and hand-back triggers. It repeats `status`
`workspace.message`: with no run, that `run.start` writes the workspace
configuration (or that an existing one names another feature); for a run without
one, that delivery needs `workspace.configure`. If status cannot be read it emits a
short safe message with the defaults, the question and the run-start
configuration rule.

Manifest and handler-subprocess tests verify deny responses and routing to the
protected action. Actual native-host plugin activation, matcher dispatch and
interception remain unverified; the coverage matrix labels this explicitly. Do not add
per-commit gates. Desktop observes current proof and
provides commands; refreshing it never launches evaluators.

Hosted merge checks watch required checks first. If GitHub CLI reports the exact
empty-required-checks or no-checks diagnostic, the protected action queries and
watches all reported checks instead. An exact no-checks response from this
unfiltered query permits proceeding without hosted CI; the integration receipt
records `hostedChecks` as `required`, `reported` or `none` ("no CI checks", never
passing CI). Only the protected merge supplies that observation. Failed checks and
operational errors still block. This observes the currently reported check set,
not future checks, and does not bypass GitHub branch protection. The fallback
retains final source/target, gate and authority revalidation and PR-state cleanup.

When review, spec or Judge execution omits consumed references, the core selects the latest
applicable Verification result; a current FAIL still blocks. Explicit references
remain available for deliberate evidence selection. The CLI `read` command inspects
advertised result/artifact identities, and `evaluate --configuration` accepts full
runner assumptions without hand-authoring a protocol envelope.

Implementation authority pins approved design/spec commitments. Plan and issue
breakdown edits remain ordinary work; each approval still retains the plan/issue
bytes that were presented. Reconciliation rechecks the current plan, issue and
tracker coverage at the feature level before acceptance.

Runner execution uses the resolved controlled environment described in
[Delivery execution contract](DELIVERY-EXECUTION.md). Only effective inputs affect
applicability; incidental agent variables do not. Source-only reviews do not inherit
runner assumptions. Completed checks establish coverage obligations. Replacement
coverage is qualified by the existing independent acceptance review, preserving
prior failures. A renamed or narrower check cannot hide uncovered behavior.

Relevant open findings are included automatically. `history` can add affected
closed findings and `claims` names asserted fixes and rebuttals; PASS requires supported
dispositions for open/claimed findings. The CLI accepts `--claims`,
`--message-id` and `--conversation-id` for these optional inputs.

#### Fix claims and sweep records

Each claim is `{findingId, claim, disposition, sweep?}` (at most 128). The
`disposition` is `fixed` (the implementer changed code to fix the finding) or
`disputed` (a rebuttal: not a defect, or intentionally unchanged). A `fixed`
claim must carry a sweep record and a `disputed` claim must not:

```json
{"findingId":"codex/R-1","claim":"Both readers now use parseRound.","disposition":"fixed",
 "sweep":{"class":"Round numbers parsed ad hoc","search":"rg -n 'round' src/","sites":[{"path":"app/src/a.js","line":12},{"path":"app/src/b.js","line":40}],
  "fix":"parseRound in app/src/round.js is the single source","test":"round.test.js covers every reader","dependents":"status and publish read rounds; both tests pass"}}
```

All six sweep fields are required: `class`, `search`, `fix`, `test` and
`dependents` are nonempty text of at most 4096 characters, and `sites` lists 1
to 256 `{path, line}` entries (path at most 1024 characters, line a positive
integer). One site with the search that proved it is valid. Unknown keys are
refused. `gate.execute` and `review.execute` refuse an invalid claim before any
reviewer starts, naming the field (for example `claims[0].sweep.search`), and
record nothing. GateReeve checks presence and shape only; reviewers verify truth.

A boundary review's packet carries `sweepRecords: {format: "sweep-record/1",
guide, records}` whenever records exist: the records of this execution's
retained `fixed` claims plus those in the inputs of earlier boundary reviews of
revisions in the same open review scope. Each record has `findingId`, `classId`
(from the claimed finding in retained history), `round` (the round that received
the claim; null outside the round policy) and the six sweep fields. Records with
equal content are carried once; a finding claimed fixed again in a later round
keeps both records. When the scope closes (integration, split or an amendment
reset), its records are no longer carried, including by a later scope of the
same name that reviews the same revision (its epoch differs). The guide tells reviewers to verify
each record, to report a missed site with the record's `classId`, and that such
a finding is a regression of the previous fix (see Round policy). GateReeve never
changes a reviewer's `blocking` flag; the regression status applies when the pair
is qualified.

Git symlinks are captured as target text and gitlinks as pinned-commit metadata;
neither is followed during capture or exposed as a live symlink. Recognized
lifecycle records must use regular non-executable files; executable, symlink or
Gitlink lifecycle records fail capture instead of leaking history or hiding code. Reviewers see
the entry kinds and must assess separately selected submodule contents or state
coverage limits. Canonical requirement/store symlinks remain rejected.

Resume of an unsupported active contract or damaged journal publishes an
immutable successor activation pointing to a fresh run, retaining the original
pointer and journal bytes. It grants no authority from unqualified historical
state. Packet inventory is regenerated whenever applicable results change.

Closed findings with changed or uncertain applicability are supplied automatically.
The evaluator identifies affected closures and provides their dispositions;
`historyAssessment.carryForwardReason` can justify carrying the remainder as a
batch, without enumerating unaffected IDs again. No relevance assertion from the
implementer substitutes for this independent assessment. Historical reports from
unselected repositories are rejected before export; expand the explicitly declared
scope when that prior proof is needed.

Reviewer verdicts separate substance from bookkeeping. GateReeve computes, from
the supplied history, the earlier findings that need a disposition and gives
them to each reviewer as `dispositionsRequired` (reason `open`, `claimed` or
`reconsider`). The structured-output schema is built per request: dispositions
and `historyAssessment.affected` enumerate the finding IDs that request
disclosed. In `historyAssessment.affected`, an ID disclosed anywhere in the
supplied history (including inside an earlier UNAVAILABLE result) that is not
required, and repeated IDs, are dropped and recorded under `normalized`. A
disposition for a disclosed ID that is not required is kept as given.

GateReeve corrects a verdict automatically only where the answer follows from
the verdict itself, and records each correction under `normalized` with its
`rule` (and `field`, `id`, `original` where they apply). On a new verdict:

| Rule | Correction |
| --- | --- |
| `prose-unwrapped` | The review-gate output was not JSON as a whole but held exactly one balanced JSON object, which is used. None or several stay malformed JSON. Recorded on every result of the execution. Planning reviews and analysis, which cannot record it, parse as before |
| `unknown-property` | A property the verdict schema does not define, at any level of a verdict or in the `{verdicts}` envelope, is removed before validation (`field` is its path) |
| `pass-with-blocking-finding` | A PASS reporting a blocking finding that is not low, or marking an earlier blocking finding `present`, is recorded as FAIL (`original.outcome` PASS) |
| `present-non-blocking` | On a PASS, a required (claimed) earlier finding that does not block (`blocking: false`, or low) carries `present` |
| `disposition-not-disclosed` | A consolidated-review disposition naming an ID disclosed nowhere (supplied history, claims or the verdict's own findings) is dropped |
| `claim-not-retained` | An implementer claim naming a finding no retained review reports is dropped before the reviewer starts, recorded on every result of the execution; the reviewer runs without it |
| `peer-not-assessed` | On a selection-tagged review PASS, an open or claimed earlier finding that the other provider of the selection raised (by its recorded `findingProvenance`) and that the verdict gives no disposition row is recorded with a GateReeve-authored `not-assessed` disposition. `not-assessed` is not in the reviewer schema and closes nothing: the finding stays open in every ledger and the member stays unreconciled for it until it is disposed |
| `low-never-blocks`, `low-only-fail`, `duplicate-disposition`, `duplicate-affected`, `affected-not-required`, `affected-not-disclosed` | As described below and above |

Anything that changes meaning goes back to the reviewer through the repair turn
with the exact field path, and is never guessed: a missing or invalid required
field (for example `review.findings[0].blocking is required`), a missing
supported disposition for an open or claimed finding on a PASS (except a
peer's finding with no row at all, recorded `not-assessed` above), an open finding
carried as `unaffected` (`dispositions[i]`), a PASS with a criterion that is not
PASS (`criteria[i]`), a duplicate disposition with a different status, and an
ID disclosed nowhere in an assessed `historyAssessment.affected` list. Every
UNAVAILABLE result the verdict contract rejected records a stable
`rejectionRule` (for example `schema-required`, `missing-disposition`,
`open-carried-unaffected`, `repair-substance`, `malformed-json`). The metrics
projection stores one `verdict-normalization` observation per rule per result
with its `count`, and one `verdict-rejection` observation per rejected result,
carrying only the rule and count.

Every finding carries `severity` (`high`, `medium` or `low`, defined by its
`failureScenario`), a `classId` and a one-line `classStatement`. Low findings
never block; a low finding marked blocking is recorded non-blocking under
`normalized`. A historical finding still present but now rated low takes the
`present-low` disposition, which no longer blocks. Findings retained from
earlier contracts read as `unrated` and block exactly as recorded. A FAIL with
no blocking finding other than low ones (non-blocking findings of any severity
may accompany them) is recorded as PASS (`normalized` rule `low-only-fail`)
only when every criterion, responsibility and coverage decision already passes,
coverage is complete, the mandate passes or is not assessed, and the verdict
then satisfies every PASS check. Otherwise the reviewer's FAIL stands and is
never rewritten over another failure; a FAIL left without a material finding
still needs reviewer clarification before adjudication. When paired
reviewers rate one class differently, the pair records the higher rating
(`severities` on the boundary review).

A reviewer contract error triggers exactly one automatic format-repair turn
with the same reviewer, for either provider, given the validation error. The
repair is judged by substance identity: outcome, mandate assessment, findings with
severity and evidence, criterion outcomes, coverage completeness and
limitations, coverage decisions, dispositions and responsibility outcomes. Text
that depends on a repaired field may change, and a field the original omitted
may be supplied, including a disposition for an ID the original omitted; a
stated disposition keeps its status. A repair may return FAIL where the
original said PASS only when the verdict itself shows the blocking finding: the
original reported it, or a disposition the repair supplied marks an earlier
blocking finding `present`. A repair that still fails or changes substance is
UNAVAILABLE.
**Self-validation (issue #142).** A reviewer can check its verdict against
this contract before it answers. For an adapter that declares the capability
(both local adapters do), GateReeve writes the check's context (gates,
candidate criteria and source paths, delta paths, history results, claims,
closures to reconsider, coverage claims, mandate, repair original, provider
and selection) to `validation/context.json` in the reviewer view before it is
sealed, sets `packet.selfValidation`, and gives the adapter the launch of a
stdio MCP server, `protocol/current/verdict-check-server.js`, with one tool,
`validate_verdict` (annotated read-only, idempotent, closed world). The tool
runs `checkReviewOutput`, the same function the execution records with
(`checkReviewVerdicts`), and reports per gate whether the verdict is valid,
the first contract error with its field path (the text a repair turn would
receive), the outcome GateReeve would record and the correction rules it
would record; an envelope error is reported once. It never changes the
verdict. The server is launched under Node's permission model
(`--permission`, read access only to the protocol resources and its context
file; no write, child-process, worker, addon or WASI permission), so a write
or spawn would be refused at runtime; it opens no network connection and
answers only on standard output. Under Electron's Node mode, which takes no
permission flags, the launch sets only `ELECTRON_RUN_AS_NODE` (the desktop
does not run reviews). The Claude Code adapter keeps `--restricted`,
`--strict-mcp-config` and `--tools Read,Glob,Grep`; its `--mcp-config` names
only this server, and `mcp__gatereeve__validate_verdict` joins the stage
agent's tools and `--allowedTools`. The Codex adapter keeps
`--sandbox read-only` and adds only `mcp_servers.gatereeve` (its command,
arguments and environment, which turns the server's metrics off). Receipts record
`isolation.selfValidation`. Other adapters run exactly as before, and the
recorded verdict is still checked and repaired as above.

Repair turns share the round's baseline and are not rounds. Every UNAVAILABLE
result carries one `unavailableReason`: `contract`, `malformed-json`,
`provider-error`, `timeout`, `missing-evidence` or `other`.

### Paired review outcomes

`review.execute` checks its preconditions once before the round starts. Without a
current passing verification of the candidate (none, or the latest current one is
FAIL or UNAVAILABLE) it refuses with error code `VERIFICATION_REQUIRED`, naming the
order `candidate.prepare` → `gate.execute ["verification"]` → `review.execute`.
The refusal appends no event, starts no reviewer and counts no round, so the same
`operationId` can be retried after verification. An individual
`gate.execute ["review"]` refuses the same way.

Each `BOUNDARY_REVIEWED` outcome row has one `status`, and every row that is not
`completed` carries a `reason`:

| Status | Meaning |
| --- | --- |
| `completed` | The reviewer returned a validated PASS or FAIL |
| `refused` | This execution launched no reviewer process: a precondition stopped it before the provider started (for example planning lint or adapter preparation before spawn), an earlier execution of the job is uncertain or already claimed, or a retained result for unchanged inputs was reused (`reused: true`, with its `results`) |
| `provider-failed` | The provider failed (`provider-error`, `timeout`, `other`), or the execution failed after the reviewer launched |
| `verdict-rejected` | The verdict failed the contract, JSON or schema (`contract`, `malformed-json`) |
| `could-not-assess` | The reviewer itself returned UNAVAILABLE (`missing-evidence`) |

Each row lists its `attempts` in order, one per execution: `kind`
(`initial`, `transient-retry` or `repair`), `status`, `results`, the
provider `tokens` and the execution's `durationMs`. An attempt that launched
nothing or reused a retained result has null usage and duration; unknown
usage is null, never zero. Each review execution receipt records its
`attempt`, and the metrics projection stores every review result's `attempt`,
`durationMs` and `tokens` on its result observation (not on its finding or
disposition rows), so repair turns and retries are attributed.

A row describes the reviewer across its attempts in the round (first attempt,
transient retry, repair turn): it is `refused` only when no attempt launched a
reviewer, and otherwise follows the latest attempt that did. The local adapters
report the reviewer process spawn, so a failure before spawn is a refusal; behind
an idle-inhibitor wrapper the reviewer reports its own start through a stderr
marker, confirmed by reviewer output or by an exit that is not an exec failure
(126 or 127), so neither the wrapper's spawn nor a failed exec is a launch. For another adapter,
invoking its stage is the launch. A round whose
outcomes are all `refused` is not counted. A provider-failure result records
`providerFailure: {category}`; a `transient-service-failure` is retried once
automatically under its own operation identity on the round baseline, and is not
a new round. Rejections name the offending field path or finding/claim ID.
Events recorded before these statuses keep their `completed`/`unavailable` values
and count exactly as before.

### Complete review packets

A full-rigor review packet carries the documents the pinned `spec.md`
incorporates by reference (issue #142). The global Definition of Done is
`protocol/DEFINITION-OF-DONE.md`, shipped with the protocol; a spec containing
the phrase "global Definition of Done" (any case or whitespace; the spec
template's sentence) incorporates it. Relative Markdown links in `spec.md`
to feature-home files the packet does not already carry are incorporated
too. Each document is captured into the execution input (`incorporated`, also
part of the reuse comparison) and written to `incorporated/gatereeve/` or
`incorporated/feature/<path>` in the reviewer view; `packet.incorporated`
lists them. A link that cannot be included (missing, outside the feature
home, a hidden or workflow-record path, not a regular file, over 256 KiB, or
past 16 documents) is a non-blocking note there. External links are never
fetched. Reviewers treat a missing document as a note, not by itself a reason
for UNAVAILABLE, and fail a selected criterion that cannot be judged without
it.

A rubric row whose criterion text starts with `After merge:` is checked only
after merge (release, deployment or live acceptance). `candidate.prepare`
refuses to select it, and a FEATURE candidate covers every row that is not so
marked. The packet lists such rows in `afterMergeCriteria`, and reviewers do
not score them or report them as limitations, findings or UNAVAILABLE.
Completion does not assess them; the planning parser is unchanged.

Missing historical evidence is recorded in `historyGaps` and shown in status and
desktop. It never qualifies proof. Fresh full evidence can replace its current
role without recreating lost bytes; available old finding facts are labeled as
context only, with lost provenance visible. A fresh execution records the gaps
it observed in its immutable input. Current qualified references still require
complete integrity. Provider failures expose structured causes and remedies,
not raw provider stdout/stderr.

## Source and retained-record classification

The canonical feature home and `docs/issues/<feature>/` reserve lifecycle Markdown,
journals, current retained objects and recognized report artifacts as record data.
Review/advisory/verification directories can retain narrative logs and captures; JSON
requires a recognized typed workflow envelope. This classification keeps history
out of base/head/target exports and permits untracked record continuation. It grants
no passage or evidence validity: current proof still needs validated retained references.
Arbitrary executable files, configuration and unknown/malformed JSON remain application
source, including beneath record-looking directories. Executable file modes and Git
symlinks are never silently classified as narrative evidence.

For a merge candidate, `base` preserves the original cumulative feature review range.
`target` separately pins the proposed integration/release tip (default: `base`). Its
retained bytes enter the review input, applicability identity and delta changed-path
coverage. A target change needs refreshed interaction proof. Merge preparation rejects
a live target different from this assessed pin; human authorization and execution bind
the exact current target commit as well as the reviewed source and method.

Combined decisions retain a pending instruction before validation/continuation work.
Pending records grant no requested action; status exposes them and an identical retry
reconciles one completed decision. Failed spec and reconciliation checks retain exact
inputs and diagnostics with FAIL or UNAVAILABLE without granting passage. Runner
applicability binds the effective controlled environment; execution receives that frozen environment. Private comparisons use a local HMAC key, and retained logs redact named inherited additions.

Provider structured-value digests use canonical JSON key order with array order preserved. Raw strings and bytes retain their exact-byte digest. Retained provider output therefore validates against the original receipt after storage round-trips; older digest contracts require fresh evaluation.

Current/8 stores activation, ordered events, jobs, decisions and structured
history in one authoritative `.gatereeve-current/workflow.sqlite.current-8` under
the canonical feature home. SQLite transactions replace mirrored file journals.
Each contract has its own database. Earlier databases (current/7:
`workflow.sqlite.current-7`; current/6: `workflow.sqlite`) are never written or migrated; a later contract opens them
read-only only to link their activation as provenance on explicit resumption. A
read-only open of a WAL-mode database may create ignored `-wal`/`-shm` sidecars.
Retained evidence artifacts stay files; the database records their references.
The SQLite file and WAL/SHM sidecars must remain untracked. Each issue/topic
branch/worktree owns its workflow database; replacement threads share that
workflow, while other workflows are isolated. Reporting uses a separate shared
user-local metrics database and cannot grant workflow authority.

A missing database grants no recovered approval. Explicitly start/resume a fresh
run with observed human approvals and surviving documents; no old event replay.
Old active runtime files remain untouched on upgrade and require explicit resume
into current/8. Unchanged planning can carry only through observed approvals.
No distributed sync, automatic authority reconstruction or general reset is added.
Use `database.inspect`, `database.history`, CLI `database`, and `workflow.observe`
(`workflow-note <file>`) for bounded inspection and agent memory. Observation
kinds: strategy, friction, escaped-defect, disposition, artifact; they grant no
passage. Findings and independent dispositions are also recorded automatically.

**Escaped defects.** Record a defect found after an earlier run or PR let it
through as an `escaped-defect` note in the run that fixes it. To link the fix to
its origin, give `fixId` (the fix PR or commit), `links` (origin references such
as `run:<runId>`, `candidate:<hash>` or `owner/repo#12`), `linkBasis` and the
observed human `authority`:

```json
{"kind":"escaped-defect","fixId":"owner/repo#31","reason":"Export returned 41","links":["owner/repo#12"],"linkBasis":"agent-proposed","authority":{"kind":"human-confirmed","instruction":"Yes, #12 introduced it.","context":"Agent proposed origin #12 from blame of the changed line"}}
```

- `human-stated`: the human named the origin ("this fixes a bug from #12");
  record it with that statement as authority.
- `agent-proposed`: you proposed candidate origins (for example by blaming the
  changed lines against recent runs). Ask the human; record only the origins they
  confirm, with the confirmation as authority. An unconfirmed proposal is refused
  and never stored; do not record it as a link.

A note without `links` needs neither. Origin links are reporting data only; the
authority text stays in the journal and is not projected into metrics.

Outcome publication first appends a durable journal marker, then the service
cache and terminal event. A late concurrent completion therefore invalidates a
milestone's checked journal revision even if the process stops between those
steps. Retry restores the original cache/results from the marker. A passing
assessment must have started after relevant negative evidence; finishing later
cannot substitute for having reviewed the finding. Fresh proof after unknown
work likewise means started afterward, and any later original outcome remains
visible and subject to normal reconciliation.

Evaluator qualification uses the explicit `high-capability-v1` profile. Actual
configured reasoning must meet at least `high`, and descriptor, request and
receipt must agree. Unknown effort/profile values fail closed. Qualification is
checked again when reusing retained evidence, including consumed and historical
support. Effort ordering is a protocol contract, not a claim about model-family
quality. Provider usage totals remain null for any metric missing a contribution;
known zero is retained as zero.

Configured repository paths must identify actual Git working-tree roots when
source or retained candidate proof is admitted. Subdirectories are rejected,
not silently widened; linked worktree roots remain valid. Full-tree capture
prevents review scope from omitting enclosing source.

Default reviewer context includes relevant criterion-only failures and required
coverage limits across review gates, selected per repository scope and criterion.
A new substantive cross-gate failure can invalidate older proof; a transport
failure alone cannot. Another gate's finding remains that gate's obligation.
Relevant history that spans unselected repositories requires a matching declared
scope before export. Matching unsupported activation copies, or either surviving
copy, remain opaque resume provenance; differing copies remain a conflict.

Root CHECKPOINT.md and the documented direct-child .checkpoints/CHECKPOINT-*.md
and .handoffs/HANDOFF-*.md session records (including case aliases) are excluded at every source endpoint.
Arbitrary files in those directories remain source; reserved nonregular or executable
entries reject. Retained candidates are rechecked against this isolation policy.
Prior reports with incompatible source become labeled context only, without exporting
that source or qualifying as delta/current proof. Fresh full review can replace their
current role; original bytes stay retained locally.

Unsupported activation records use their exact bytes as opaque provenance, including
root/successor records with different fields. Current runId and previous-reference
schema checks apply only to current-contract records. Conflicting mirrors still block;
explicit resume preserves historical bytes and grants no inherited approval.

## Workspace configuration

Delivery uses the workspace configuration (`.agentic-workflow.json`, see
WORKSPACE-CONTEXT.md); there is no configuration-free delivery path.

- **Written at run start.** In the Git fallback, `run.start` observes the GitHub
  remote and the repository's default branch (`gh api --method GET
  repos/{owner}/{repo}`, non-admin) and writes, atomically and never over an
  existing file, `{schemaVersion: 1, featureId: <current branch>, repositories:
  {repository: {path: ".", remote, integrationBranch: <default>, releaseBranch:
  <default>, keepPullRequestsClosed: false, featureBaseSha}}}`, then adds
  `/.agentic-workflow.json` to the repository's local `info/exclude`. The feature
  home does not move. `featureBaseSha` is the merge base of `HEAD` with
  `refs/remotes/<remote>/<default>`, else `refs/heads/<default>` (no fetch), so
  FEATURE scope works straight after `run.start`; when neither resolves it is
  omitted and `observed.featureBase` carries the reason. `STARTED.workspace`
  records `{status: "created", observed, configuration, file, exclude}` and
  retains the bytes. Integration equal to release means only per-PR human merges.
- **Not written** (no GitHub remote, an unobservable or unusable default branch,
  a run started on the default branch, or a delegated start): the run starts and
  `STARTED.workspace` records `{status: "unconfigured", reason}`.
- **Existing, same feature** (the current branch is the configured feature, one of
  its delivery branches `<featureId>-NN-<description>`, or its distinct integration
  branch): used unchanged, recorded as `{status: "configured", match}`.
- **Existing, different feature:** `run.start` fails before creating any feature
  home (`details.kind: workspace-feature-mismatch`). It continues only with the
  human's instruction: `workspace.confirmFeature` naming the configured feature
  (recorded as `match: human-confirmed`), or `workspace.replace` (a
  single-repository configuration at the repository root is replaced by a minimal
  one for the current branch, recorded as `{status: "replaced", previous,
  authority}` with the previous bytes retained). A replacement whose target feature
  already has a run is refused before writing.
- **Fresh resumption:** `run.resume-current` with nothing retained to resume in
  the resolved feature home starts a fresh run and follows all of the above
  (recorded with `operation: run.resume-current`). Resuming a current run or a
  retained activation is unchanged: no check, no write, and `workspace` is refused.
- **Existing run without configuration:** `workspace.configure` applies the same
  rules and records `WORKSPACE_CONFIGURED`. `merge.prepare` without branch
  configuration fails naming it through an available entry point.

A configuration written for a request that then fails without recording it is
removed again. `status` reports `workspace: {mode, configPath, configured,
recorded, message}` (and, for a configured workspace, whether the current branch
belongs to it) and offers a `configure-workspace` action for an unconfigured run.

## Delivery targets and release merges

Each repository configures an `integrationBranch` and a `releaseBranch` (default:
the integration branch). When they differ, scope is bound to target at
`merge.prepare`, and again wherever an authorization binds the prepared action:

- a `SLICE` candidate's PR runs from a slice branch into the integration branch;
- only the `FEATURE` candidate's PR whose head is the integration branch itself and
  whose base is the release branch may target the release branch (the final PR);
- every other pairing is rejected, naming the allowed pairing.

When the branches are the same, every PR targets the release branch and no
standing or delegated merge authority exists for that repository.

**Release merges, any rigor.** A merge into the release branch needs a human
`authorize-merge` from a per-PR instruction ("merge #N"), bound through the
prepared action to that PR's number, head, base and method. With it, the agent
runs `merge.execute`, which keeps every protected-merge safeguard. Light runs use
the same path. No standing grant authorizes a release merge.

**Review summary on the PR.** In both rigors, before the PR is presented for human
review or merge authorization, run `review.publish`. It renders the latest
qualifying `review` result (PASS or FAIL) for the current candidate and writes it
between `<!-- gatereeve:review-summary:start -->` and
`<!-- gatereeve:review-summary:end -->` in the PR description, replacing an
earlier section and keeping all other text. The section names the outcome,
reviewed head, candidate, result identity, evaluator and basis (rubric or brief),
then the summary, criteria, dimensions and findings. For an accepted candidate,
the operation also retains the exact-head HTML explainer and any advisory mutation
report. Human `authorize-merge`, standing merge application and `merge.execute`
require the retained handoff and the current hosted summary. A closed same-repository
PR can still display the old head. When its pushed branch matches the prepared
head, the retained local handoff supports authorization. After reopening inside
the authorized merge window, `merge.execute` verifies the host's exact head and
base, publishes the summary and checks it again before attempting the merge.

**External blockers.** When GitHub refuses an authorized merge because of a hosting
rule (for example a required approving review the author cannot give, or a base
branch policy) and the PR is observed still open at the authorized head, the
protected merge reports an external blocker. The result fails with error code
`EXTERNAL_BLOCKER` and details `{kind: "external-blocker", blocker:
"required-review"|"branch-policy", gateFailure: false, ...}`; the run records a
`MERGE_BLOCKED` event shown as `status.externalBlocker` (history in
`externalBlockers`) and a snapshot blocker; `delivery.resume` returns status
`external-blocker` with next action `human`. Gate proof, acceptance and
authorization are unchanged. An open PR stays open and ready (draft status is
never restored); closed delivery closes the PR again. After the
rule is satisfied on the host, run `merge.execute` again; a new candidate or
integration clears the current blocker. Any other merge error keeps its original
failure.

## Scoped standing authorization

An explicit human instruction may authorize unattended acceptance alone, or
acceptance plus merging the feature's slice PRs into a distinct integration
branch. “Work overnight” alone
does not imply merge or deployment permission. Record the actual instruction
once with `human.decide`, kind `authorize-standing`, subject the current
commitment hash, and an explicit `scope` such as:

```json
{
  "actions": ["accept", "authorize-merge"],
  "candidateScopes": ["SLICE"],
  "repositories": [{
    "alias": "product", "headPrefix": "tb-example-feature", "baseBranch": "tb-example-feature",
    "methods": ["merge"]
  }],
  "expiresAt": null
}
```

For acceptance only, use `actions: ["accept"]` and omit `methods`. Prefixes match
the exact branch or hyphen-delimited subsequent delivery branches. Each target
must already be configured as the integration branch: a grant naming the release
branch is rejected, and with integration equal to release no grant exists. Grants
recorded before this rule are retained and reported in status with
`namesReleaseBranch: true` and an inactive reason; they authorize neither
acceptance nor merge. `expiresAt` is a UTC timestamp or explicit `null`
meaning this feature run, not indefinite authority across runs. The core binds
current implementation approval, approved requirements and repository
configuration/remote identities. Scope is never inferred from an agent's label.
Resolved requests retain their original discovery location and repository selection.
Before passage, the core resolves them again and rejects changed configuration,
including a removed, malformed or newly nearer workspace file. Harmless JSON
formatting, repository map ordering and external task labels do not invalidate
authority. A running operation never silently switches to the new workspace.

Once all required gates have current PASS evidence, use `authorization.apply`
with `{ "grant": "sha256:<recorded grant event hash>" }`. For a permitted merge,
include `action` from `merge.prepare`. Application records exact candidate
acceptance and, if requested, exact PR/head/target/method authorization with the
original grant reference. It performs no merge. Then use `merge.execute`; its
existing live source/target, hosted checks, direction and integration safeguards
remain mandatory. This supports intermediate slice PRs into the integration
branch; the final PR into the release branch always needs a per-PR human
`authorize-merge`.
Completion still requires whole-feature evidence, actual integration, required
finalization/release observations and retention. Deployment/publishing permission
is separate and cannot be added to this grant's supported actions.

No standing application can substitute a waiver for a required PASS. Explicit
human candidate exceptions remain separate. Revoke with `human.decide`, kind
`revoke-standing`, subject the grant event hash and the actual instruction.
Expiry, revocation, changed approval/requirements, repository/remote drift and
out-of-scope delivery block further use, including already prepared merges.
Pause blocks use; continuing preserves only still-valid authority. Repeat the
same operation ID and input after interruption; the journal retains the original
application. Status exposes grants, scope and inactive reasons. Open PRs
are the default (a draft or ready for review; draft status is no precondition);
`keepPullRequestsClosed: true` is a per-repository opt-in.

A default-open merge marks a draft PR ready, because GitHub cannot merge a
draft. If the merge then aborts, the PR stays open and ready; draft status is
never restored, and a later authorized retry accepts the ready PR. Host-discovered Git is honored by grant and
protected action reads. Acceptance scope includes the assessed target branch;
verified integration on that same branch preserves prior acceptance for completion.


## Dual boundary review and autonomous authority (current/8)

In either rigor, acceptance requires both selected provider perspectives. Each
independently assesses code, requirements, evidence, scope and findings against
the same pinned source and applicable Verification. Light uses the brief; full
uses selected approved criteria for a slice and every criterion for a feature.
Initial assessments run concurrently in isolated read-only views without the
peer's initial output. An interrupted round can recover its delayed peer against
the frozen baseline without rerunning the completed peer. A completed round with
an unavailable peer needs a new blind round to establish independence. Retain
both results, including failed/unavailable ones.

At the first boundary, the agent discovers available native providers/models and
reasoning options and records its decision with `review.select`. Prefer capable
standard/daily-driver models at high effort, honor explicit developer model
instructions and label inferred model classes as agent judgment. Version names
are data, not built-in defaults. Set ordered preferences under the workflow
repository alias in `.agentic-workflow.json`, for example:

```json
{
  "reviewerPreferences": {
    "codex": [{ "model": "gpt-6.2-sol", "reasoningEffort": "high" }],
    "claude-code": [{ "model": "claude-opus-5-5", "reasoningEffort": "high" }]
  },
  "mutationAdvisory": { "packages": ["packages/domain"], "timeoutMs": 900000 }
}
```

Discover the configured candidates and submit the first eligible observed choice
for each provider. If the list is empty or exhausted, choose an eligible model
from the same provider using current discovery and record the rationale. A
contract-invalid or malformed verdict triggers at most one repair turn per
reviewer per round, for either provider, using the same model and effort; a
transient provider failure gets one automatic retry first (see Paired review
outcomes). Reuse the pair within the run; replace it only
for availability changes or developer direction, identifying the previous
selection and reason. Autonomous mode may choose an available comparably capable
replacement; changing user-pinned choices in other modes needs developer
direction. A missing second provider remains a blocker. Discovery does not prove
successful native execution. The main thread and planning-review model policy
are unchanged.

`review.execute` coordinates native assessments and `boundaryReviews` qualifies
the latest applicable result independently for each selected perspective. A
coordinated initial round must establish independence for the selection before
individual assessments can qualify as follow-ups. Until then, withhold earlier
reports from this selection and same-source reports from the selected models,
including unmarked serial seed reviews. Explicit peer history, peer-finding
claims and delta priors cannot bypass the initial isolation. Withheld material
findings remain obligations: after the blind initial pass they require actual
follow-up reconciliation, rather than disappearing from a clean report. Unknown
finding IDs cannot acquire a closure without being disclosed to the reviewer.
`REVIEW_ROUND_STARTED` retains
the pre-round state; replay uses that history baseline while reconnecting to
current job records, so an interrupted initial peer cannot inherit the first
answer or relaunch a completed assessment. The packet retains the initial
receipts and baseline as well as the current perspectives. An
individual `gate.execute` remains useful for a targeted perspective, but cannot
stand in for the pair. Per-provider delta priors must retain their own provider
perspective. Findings receive provider-specific identities and original-ID
provenance. Rebuttals are claims until evaluated or legitimately adjudicated.
Supervised/delegated modes require material clearance from both reviewers; on
persistent dispute, record the evidence/reason and return control to the human
(`run.set-dial autonomy supervised`, actor agent, under delegation). Rounds
follow the round policy above, with its round 6 hand-back. Do not endlessly retry
unchanged disputed claims.

`mandated` (formerly `autonomous`) is a third explicit per-run choice, independent of rigor. Defaults
remain full/supervised. Grant it only from an observed human instruction bound to
the named run and recorded `mandate: {goal, constraints}`. At run start the mandate
belongs to the autonomy choice; in `run.set-dial` it is a top-level input. The
original human goal and explicit constraints are retained in the grant event,
separate from mutable planning files. Release protection is required as for
delegation. Only the human grants or replaces this authority.

A planning reviewer in autonomous mode receives the fixed mandate and granting
instruction and must return `mandateAssessment: {outcome, evidence}`. Overall PASS
requires explicit mandate compliance. An `autonomous-evaluator` planning decision
cites the current grant in `delegation` and qualifying review event in
`evaluation`. It covers approve-design, authorize-implementation and in-mandate
amendments (with previousSubject and optional authorize-implementation action).
Amendments retain old/new commitments and refresh affected evidence instead of
causing routine human handback. Changing the mandate requires the human. A light
tripwire raises rigor and refreshes full planning within the retained mandate.

Autonomous boundary reviewers likewise assess mandate compliance. The agent may
record candidate/pair-bound adjudication for every remaining material finding,
including an evidence-backed rebuttal or accepted residual risk. Record reviewer
positions, rationale, retained evidence, remaining risk and a diminishing-returns
stopping reason when used. Unanimous approval is not required; both complete
assessments are. Original FAIL/UNAVAILABLE never becomes reviewer PASS.

Every responsibility and selected criterion must reach a complete PASS or FAIL
conclusion before adjudication; UNAVAILABLE conclusions remain incomplete even
inside an overall FAIL. Open historical findings need explicit reconciliation,
and delta coverage must include changed paths and interactions.
Open findings on requirements and planning documents persist across later
negative reports just as repository findings do. If original output is lost,
surviving findings may enter fresh review as historical context with retained
repository, criterion, source and reviewer scope. This context is ordered at its
original journal position and never substitutes for missing execution proof.
Fresh review must independently reconcile it; qualification does not require a
nonexistent context input or reconstruct the missing output.
Missing or invalid assessments, uncovered required scope, missing verification,
rejected coverage replacements, evidence-integrity failure and unknown mandate
compliance are not adjudicable. A completed negative scope/mandate opinion may
receive an explicit `mandateRebuttal` addressing the retained goal and every
constraint with evidence. A claimed mandate violation must be rebutted as
unsupported, never accepted as a known violation. Failed mandatory checks still
block acceptance. A stop reason alone never grants passage. Candidate, pair,
selection, grant or mandate changes invalidate affected adjudication.

Protected SLICE delivery into a distinct integration branch may apply autonomous
authority when mandatory proof and any eligible adjudication qualify and the
current summary is published. Final release-branch merge always needs the
per-PR human instruction; deployment remains separately authorized. The
unattended endpoint is a ready final PR, not fabricated post-merge completion.
External blockers may prevent completion; exhaust authorized alternatives and
report them truthfully rather than bypassing protections or changing the goal.

Current/8 uses its own database. Current/7 records remain unchanged and supply
activation provenance on explicit resumption, never an invented second review or
a new autonomous grant. CLI, desktop and published summaries retain both models,
receipts, original verdicts and any separately recorded accepted risk.


An autonomous planning authority may include `judgment` when settling a completed
negative independent planning assessment: `reason`, `mandateRebuttal` (goalEvidence
and every fixed constraint by index/evidence), complete material-finding
`dispositions`, retained `evidence` references and optional `stopReason`. The
original assessment must be complete (PASS or FAIL, never UNAVAILABLE). Its
original FAIL stays FAIL in evaluation and publication; the authority basis is
`autonomous-judgment`, not a manufactured planning PASS. Unsupported mandate
claims require explicit counterevidence and unsupported dispositions, rather than
acceptance of a known violation. Binary specification validation and all other
mandatory factual obligations still apply. Delegated mode still requires the
independent planning PASS; it cannot use autonomous judgment.

Existing explicitly scoped human gate-exception authority remains separate from
unattended adjudication. Human exceptions retain original UNAVAILABLE/FAIL and
never claim two reviews occurred. A finding-specific exception cannot silently
cover a missing peer. Autonomous judgment itself cannot waive mandatory facts.

## Goal autonomy (current/8)

`goal` is the fourth autonomy value. It carries exactly the autonomous
authority of `mandated`: the same human grant (observed instruction, named
`runId`, fixed `mandate: {goal, constraints}`, observed release protection),
`autonomous-evaluator` planning decisions, adjudication, in-mandate amendments
without hand-back, SLICE integration delivery and tripwire escalation. Checks
that admit delegated or autonomous authority still admit `delegated`. On top of
that authority, `goal` adds attendance rules for a human who is not watching.

- **Status.** `status.goal` reports:
  - `condition`: the text handed to the harness-native goal and the Stop hook;
  - `terminal`: `ready-pr`, `parked` or `null`;
  - `reason`;
  - `decisions`: the agent decision entries.

  `parked` takes precedence over `ready-pr`. `ready-pr` requires both of the
  following:
  - the acceptance milestone qualifies for the current FEATURE candidate;
  - `review.publish` recorded the current summary on an open, unmerged PR
    whose head is the candidate head (`GOAL_READY`), draft or ready for
    review.
- **No-ask.** The PreToolUse hook denies the harness question tools
  (`AskUserQuestion`, `request_user_input`) in a goal run without an active
  park. The agent answers the question itself and records an
  `Answered by: agent` entry with the options considered and its
  reversibility: in `interview.md` during planning, and in `scratchpad.md`
  afterwards. The guard fails open when the state is unreadable.
- **One decision record.** Every interview and decision entry carries
  **Answered by:** `human | agent`.
  - Agent entries from `interview.md`, `scratchpad.md` and `decisions.md` go to
    the planning-review and boundary-review inputs (`agentDecisions`), each
    with a rule to assess them against the mandate.
  - `review.publish` lists them under "Decisions made for you".
  - In a goal run `interview.md` is pinned at the latest `approve-design` or
    amendment. A differing record blocks the implementation and acceptance
    milestones until an amendment pins it. A goal grant never re-pins.
  - A returning human confirms an agent entry (its provenance becomes
    `human`) or overrides it with a superseding human entry.
- **Persistence.** Where the harness offers a native goal, arm it with
  `goal.condition` (Claude Code `set_goal`, Codex `create_goal`). Both
  platforms also register a Stop hook. It blocks the turn from ending while
  `goal.terminal` is `null`, and admits the stop after 3 consecutive blocks with
  no new protocol event (the stall valve). It fails open.
- **Park.** At a real blocker the agent advances as far as it can and keeps an
  open PR (draft or ready for review) whose description lists every blocker. It then records
  `goal.park`, pauses the native goal, and asks through the harness question
  tool. A human `run.continue` clears the park, and the run stays `goal`.
  Leaving goal autonomy also clears it.
- **Testing permission.** A goal grant covers the test methods needed to prove
  the change, even where project files say to ask first. Each method used is
  listed in the PR description. Production, data deletion and harness or
  system approval prompts are excluded.
- **Endpoint.** Success is a ready, unmerged final PR. The release merge still
  needs the per-PR human instruction, and deployment remains separately
  authorized.

Grant a goal run with the `goal` skill. For a new run, it creates a fresh
topic branch, starts the run and raises it. For an existing run, including
after a human-led interview, it only raises: no branch, no rigor change, and
it continues from the current phase.
