# GateReeve current protocol

`resources/protocol/plugin-adapter.js` is the authoritative native adapter.
The optional `gatereeve` CLI and desktop read the same current contract,
`gatereeve/current/7`. Send one JSON request on stdin or via `--request-file`:

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
| `run.start` | `implementers`: actual implementing context IDs; optional `runId`, `optionalGates: ["whiteboard"]`, `rigor`/`autonomy` choices `{value, authority?, reason?}` (defaults `full`/`supervised`; every explicit choice needs `authority` or `reason`, and a non-default value needs an observed human `authority`) |
| `run.set-dial` | `dial: rigor|autonomy`, `value`, `actor: human|agent`, `reason`, `authority` (required for `human`, forbidden for `agent`). Raising rigor or returning to supervised is open to either actor. Rigor never falls within a run: to work light, start a new light run on a new topic branch; this run and its evidence stay retained |
| `run.resume-current` | Same run identity; optional `planning.design` and `planning.implementation` observed human decisions. Establishes current authority without interpreting old journals |
| `human.decide` | See decisions below |
| `spec.validate` | Run trusted spec lint after the model's semantic review of AC, rubric and boundary feasibility |
| `candidate.prepare` | `repositories: [{alias,base,head,target?}]` full commit IDs, `scope: SLICE|FEATURE`, `criteria: ["R1", ...]`; FEATURE requires every rubric row. A light run has no rubric: `criteria` is exactly `["brief"]` for either scope |
| `candidate.ready` | Declare the pinned candidate ready; launches nothing |
| `gate.execute` | `gates: [id]` or `["code","spec"]`, explicit `configuration`, typed `consumed`, bounded `history`, labeled `claims`, optional `prior` for a delta |
| `milestone.check` | `name: implementation|acceptance|merge|completion`; reports missing proof/authority without writing |
| `milestone.pass` | Record an allowed milestone; merge must use its protected action |
| `merge.prepare` | `repository`, PR `number`, `method`; derive the exact source/target action, including `deliveryTarget: integration|release`, to present for authorization. Rejects a PR whose candidate scope does not match its target (see Delivery targets) |
| `review.publish` | `repository`, PR `number`; write the current independent `review` summary for the candidate head into a delimited section of the PR description. Idempotent; refuses without a current qualifying review result or when the PR head differs from the candidate head |
| `merge.execute` | Same action selector; requires current proof, human acceptance, authorization bound to the prepared action and the current review summary on the PR. A hosting-rule refusal fails with `EXTERNAL_BLOCKER`, not a gate failure |
| `integration.observe` | `repository`, optional configured `branch`; fetch and verify actual reviewed-content integration, independent of acceptance |
| `run.pause`, `run.continue` | Actual `authority` instruction; continuation never follows merely from elapsed time |

Unsupported old operations are rejected. Start a current run; do not replay,
convert, overwrite or delete old locks/journals. A resume with missing approvals
reports those obligations. Supply observed prior instructions for unchanged
commitments; ask only for genuinely missing decisions. Do not restart an
unchanged interview or invent provenance.

## Run dials

Every run carries `rigor` (`full | light`) and `autonomy` (`supervised | delegated`),
recorded in `STARTED` and in each `DIAL_SET` event with value, source
(`explicit | built-in`), actor, instruction or reason, and time. Defaults are
`full` and `supervised`. No global, repository or workspace configuration changes
them. `status` reports current values in `dials` and the defaults in
`dialDefaults`. Delegated autonomy is rejected until release-branch protection
checks are available. A run from an earlier contract is retained unchanged and
reported as needing `run.resume-current`; the resumed run starts at the defaults
unless a choice is supplied.

### Light rigor

A light run's sole planning commitment is `brief.md` in the feature home, with
goal, scope and findings-log sections. Interview, design, spec, plan, issues and
spec validation are not required. The commitment subject is derived from the
brief (contract, feature, `rigor: light`, brief hash) and appears in `status`
`commitments`. Under supervision, a human `authorize-implementation` naming that
subject is the implementation authority; no `approve-design` or `spec.validate`
precedes it. It is accepted in any phase before integration. A changed brief no
longer matches the authorized subject, so implementation, candidates and gates
stop until the changed brief is authorized again; that decision supersedes earlier
authority, acceptance and exceptions. `amend` is refused while light.

Raising rigor to full voids the brief-bound authority: the subject becomes the
full design/spec subject and the phase returns to `DESIGNING`. Backfill interview,
design, spec, plan and issues, then record `approve-design`, `spec.validate` and a
new `authorize-implementation` and prepare a rubric candidate before acceptance.
Light candidates and their evidence do not qualify for the full candidate.

Light acceptance requires the same gates as full (context, review, verification
and packet; retention and the other completion obligations at completion).

## Decisions

A decision includes `kind`, exact `subject` hash from current status or the
captured design, `reason`, `consequences` and:

```json
{"authority":{"kind":"human-confirmed","instruction":"Actual user quote","context":"Concrete proposal and conversation context"}}
```

Available message/conversation IDs are optional. This is a cooperative record,
not authentication. Kinds: `approve-design`, `authorize-implementation`, `accept`,
`waive`, `amend`, `policy-amend`, `authorize-merge`.

`authorize-merge` (alone or as an `accept`/`waive` continuation) is refused
unless the PR description already carries the current review summary from
`review.publish` for the prepared head (see Delivery targets).

Waivers name `gates` and preserve FAIL/UNAVAILABLE. They default to this candidate.
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

## Execution and evidence

Required acceptance obligations: context, verification, review and packet, in
both rigors. One
fresh independent `review` covers code defects/interactions, every approved
criterion, validation sufficiency, scope/decision reconciliation, project rules,
findings/fixes and a useful human explanation. Its five explicit responsibility
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
review count, batching, scope and model diversity; no fixed ratios or round cap.
Strongly consider independent models for consequential persistence/authority
changes, uncertain findings, repeated misses or divergent conclusions. Record a
short strategy/reason through `workflow.observe`, preferably at an existing work
boundary. Ordinary implementer self-review is not another mandatory gate.

Runner configuration is `checks: [{repository,command,args,purpose,timeoutMs?}]`.
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
`model`, optionally `reasoningEffort`. The consolidated review uses a fresh context independent of implementation and
consumes applicable Verification. Supplemental assessments are optional. Prior reports are context, not
instructions; claimed dispositions are labeled. Reviewers must find new
supported defects, verify affected fixes and cover interactions. Missing or
contradictory output is UNAVAILABLE, never PASS.

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
observation cannot be attributed to a replacement candidate. SessionStart is guidance in both native packages. Arbitrary shell writes
and GitHub actions outside these adapters are not claimed to be intercepted.
Both packages configure PreToolUse for recognized direct `gh pr merge` commands.
Manifest and handler-subprocess tests verify a deny response and routing to the
protected action. Actual native-host plugin activation, matcher dispatch and
interception remain unverified; the coverage matrix labels this explicitly.
Indirect scripts and alternate external clients are outside this handler coverage. Do not add
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
closed findings and `claims` names asserted fixes; PASS requires supported
dispositions for open/claimed findings. The CLI accepts `--claims`,
`--message-id` and `--conversation-id` for these optional inputs.

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

Current/7 stores activation, ordered events, jobs, decisions and structured
history in one authoritative `.gatereeve-current/workflow.sqlite.current-7` under
the canonical feature home. SQLite transactions replace mirrored file journals.
Each contract has its own database. An earlier contract's database (current/6:
`workflow.sqlite`) is never written or migrated; a later contract opens it
read-only only to link its activation as provenance on explicit resumption. A
read-only open of a WAL-mode database may create ignored `-wal`/`-shm` sidecars.
Retained evidence artifacts stay files; the database records their references.
The SQLite file and WAL/SHM sidecars must remain untracked. Each issue/topic
branch/worktree owns its workflow database; replacement threads share that
workflow, while other workflows are isolated. Reporting uses a separate shared
user-local metrics database and cannot grant workflow authority.

A missing database grants no recovered approval. Explicitly start/resume a fresh
run with observed human approvals and surviving documents; no old event replay.
Old active runtime files remain untouched on upgrade and require explicit resume
into current/7. Unchanged planning can carry only through observed approvals.
No distributed sync, automatic authority reconstruction or general reset is added.
Use `database.inspect`, `database.history`, CLI `database`, and `workflow.observe`
(`workflow-note <file>`) for bounded inspection and agent memory. Observation
kinds: strategy, friction, escaped-defect, disposition, artifact; they grant no
passage. Findings and independent dispositions are also recorded automatically.

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

## Delivery targets and release merges

Each repository configures an `integrationBranch` and a `releaseBranch` (default:
the integration branch). When they differ, scope is bound to target at
`merge.prepare`, and again wherever an authorization binds the prepared action:

- a `SLICE` candidate's PR runs from a slice branch into the integration branch;
- only the `FEATURE` candidate's PR whose head is the integration branch itself and
  whose base is the release branch may target the release branch (the final PR);
- every other pairing is rejected, naming the allowed pairing.

When the branches are the same, every PR targets the release branch and no
standing (or delegated) merge authority exists for that repository.

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
then the summary, criteria, dimensions and findings. Human `authorize-merge`,
standing merge application and `merge.execute` each re-read the PR description
and require the section to equal a fresh rendering for the prepared head; a newer
review result, a new candidate or an edited section requires publishing again.
Authorization is the enforcement point because that is when someone relies on the
presentation; `merge.execute` repeats the check before any external write.

**External blockers.** When GitHub refuses an authorized merge because of a hosting
rule (for example a required approving review the author cannot give, or a base
branch policy) and the PR is observed still open at the authorized head, the
protected merge reports an external blocker. The result fails with error code
`EXTERNAL_BLOCKER` and details `{kind: "external-blocker", blocker:
"required-review"|"branch-policy", gateFailure: false, ...}`; the run records a
`MERGE_BLOCKED` event shown as `status.externalBlocker` (history in
`externalBlockers`) and a snapshot blocker; `delivery.resume` returns status
`external-blocker` with next action `human`. Gate proof, acceptance and
authorization are unchanged and the PR's prior presentation is restored. After the
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
application. Status exposes grants, scope and inactive reasons. Open drafts
remain the default; `keepPullRequestsClosed: true` is a per-repository opt-in.

If a default-open merge aborts after this invocation made its draft ready, the
adapter restores draft status for the unchanged, unmerged PR and verifies it,
allowing a later authorized retry. Host-discovered Git is honored by grant and
protected action reads. Acceptance scope includes the assessed target branch;
verified integration on that same branch preserves prior acceptance for completion.
