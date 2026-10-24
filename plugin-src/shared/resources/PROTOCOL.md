# GateReeve current protocol

`resources/protocol/plugin-adapter.js` is the authoritative native adapter.
The optional `gatereeve` CLI and desktop read the same current contract,
`gatereeve/current/3`. Send one JSON request on stdin or via `--request-file`:

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
| `run.start` | `implementers`: actual implementing context IDs; optional `runId`, `optionalGates: ["whiteboard"]` |
| `run.resume-current` | Same run identity; optional `planning.design` and `planning.implementation` observed human decisions. Establishes current authority without interpreting old journals |
| `human.decide` | See decisions below |
| `spec.validate` | Run trusted spec lint after the model's semantic review of AC, rubric and boundary feasibility |
| `candidate.prepare` | `repositories: [{alias,base,head,target?}]` full commit IDs, `scope: SLICE|FEATURE`, `criteria: ["R1", ...]`; FEATURE requires every rubric row |
| `candidate.ready` | Declare the pinned candidate ready; launches nothing |
| `gate.execute` | `gates: [id]` or `["code","spec"]`, explicit `configuration`, typed `consumed`, bounded `history`, labeled `claims`, optional `prior` for a delta |
| `milestone.check` | `name: implementation|acceptance|merge|completion`; reports missing proof/authority without writing |
| `milestone.pass` | Record an allowed milestone; merge must use its protected action |
| `merge.prepare` | `repository`, PR `number`, `method`; derive exact source/target action to present for authorization |
| `merge.execute` | Same action selector; requires current proof, human acceptance and authorization bound to prepared action |
| `integration.observe` | `repository`, optional configured `branch`; fetch and verify actual reviewed-content integration, independent of acceptance |
| `run.pause`, `run.continue` | Actual `authority` instruction; continuation never follows merely from elapsed time |

Unsupported old operations are rejected. Start a current run; do not replay,
convert, overwrite or delete old locks/journals. A resume with missing approvals
reports those obligations. Supply observed prior instructions for unchanged
commitments; ask only for genuinely missing decisions. Do not restart an
unchanged interview or invent provenance.

## Decisions

A decision includes `kind`, exact `subject` hash from current status or the
captured design, `reason`, `consequences` and:

```json
{"authority":{"kind":"human-confirmed","instruction":"Actual user quote","context":"Concrete proposal and conversation context"}}
```

Available message/conversation IDs are optional. This is a cooperative record,
not authentication. Kinds: `approve-design`, `authorize-implementation`, `accept`,
`waive`, `amend`, `policy-amend`, `authorize-merge`.

Waivers name `gates` and preserve FAIL/UNAVAILABLE. They default to this candidate.
Optional `findings` narrows an exception to named current blocking findings; it
cannot satisfy another finding. The core binds command/configuration, evaluator
rules, blocking findings and live runtime assumptions, including consumed proof
transitively, external expiry, current pattern policy, support documents and integration state. Changed risk needs a new scoped decision. An interrupted decision
retains its original risk scope; repeating it never expands that authority.
Unknown decision fields are rejected rather than silently ignored.
An amendment names `previousSubject`; old/new documents remain retained. If the
same instruction expressly authorizes implementation, use
`actions: ["authorize-implementation"]`; the core revalidates the amended spec.
A waiver can include `actions: ["accept","authorize-merge"]` only when the quote
expressly includes those actions and `action` is the exact prepared merge object.
No action is inferred from a risk acceptance. Explicit policy amendments can
change reconciliation/triage exception policy for this candidate; integrity,
factual truth and actual authority cannot be waived.

Trusted spec, issue and tracker validation binds the shipped helper files, the
isolated Python interpreter and loaded standard-library source/cache bytes,
bootstrap and an explicit minimal execution environment shared by all consumers.
Interpreter selection still resolves the caller-selected executable and binds its
bytes; incidental observer variables never enter the isolated validator process.
Changed or missing effective inputs invalidate proof.
`spec.validate` can refresh unchanged authorized commitments during delivery,
without changing the phase or asking for a new implementation approval. Failed
refreshes retain diagnostics and remain blocking. Python runs without user-site
or environment-injected imports; a new helper import must be included in the
bound runtime closure before it can qualify. Desktop stages every canonical
non-test helper byte, forwards discovered Python and Git to current observation,
and executes packaged helpers from `app.asar.unpacked`. Observation stays read-only;
missing interpreters or helpers keep dependent evidence unavailable.

## Execution and evidence

Required acceptance obligations: context, reconcile, verification, spec,
pattern, judge, code, triage, explanation, packet. Completion also requires
finalization, release observation, retention, whole-feature coverage and actual integration for every
participating repository. Whiteboard remains optional policy.

Runner configuration is `checks: [{repository,command,args,purpose}]`. Request
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
`model`, optionally `reasoningEffort`. Code/spec may share one fresh execution
but return distinct verdicts. Judge remains separately required. Spec/Judge
consume an applicable Verification result. Prior reports are context, not
instructions; claimed dispositions are labeled. Reviewers must find new
supported defects, verify affected fixes and cover interactions. Missing or
contradictory output is UNAVAILABLE, never PASS.

Frozen requirements, source, inputs, results and receipts live beneath canonical
`docs/issues/<featureId>/.gatereeve-current/`. Git is optional for these records.
Exact source remains independently pinned and clean. Retain all referenced bytes,
including failed specification-validation documents and diagnostics. Lost failed-validation proof stays visible after later success and blocks retention until restored. Retention binds that validation inventory and its referenced bytes: loss or corruption invalidates an earlier PASS, and a later failed validation requires a fresh deterministic retention check even after the approved specification is restored. Missing/corrupt references block proof. Do not prune or claim
backup. Deleting the workspace requires a scoped retain/archive/discard decision;
claim archival only after verifying a copy outside the deletion scope.

Equivalent qualifying input content permits reuse; bookkeeping and identical-tree
SHAs alone do not require reruns. Changed requirements, configuration, dependency
content, environment assumptions or consumed proof require refresh. Unknown
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

When spec or Judge execution omits consumed references, the core selects the latest
applicable Verification result; a current FAIL still blocks. Explicit references
remain available for deliberate evidence selection. The CLI `read` command inspects
advertised result/artifact identities, and `evaluate --configuration` accepts full
runner assumptions without hand-authoring a protocol envelope.

Implementation authority pins approved design/spec commitments. Plan and issue
breakdown edits remain ordinary work; each approval still retains the plan/issue
bytes that were presented. Reconciliation rechecks the current plan, issue and
tracker mappings before acceptance.

Runner assumptions hash the entire inherited environment and may declare repository-relative
`runtimeInputs`. Changes to any inherited CLI/Desktop environment variable
conservatively invalidate runner proof; executable and installed dependency bytes
remain bound. Isolated source-only reviews do not inherit those runner assumptions. Completed
verification receipts establish required check coverage for the authorized scope;
unexecuted malformed declarations retain diagnostics without creating check obligations; a
narrower check cannot hide an unresolved failure. Use a scoped exception when
needed. Starting an interrupted diagnostic job does not revoke existing proof.

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
applicability hashes the entire inherited environment; execution receives that frozen
environment. Values are never stored in clear text in the environment fingerprint.

Provider structured-value digests use canonical JSON key order with array order preserved. Raw strings and bytes retain their exact-byte digest. Retained provider output therefore validates against the original receipt after storage round-trips; older digest contracts require fresh evaluation.

Current journals and activation references retain two exact local copies. Missing
one copy blocks read-only admission; the next mutating request validates the full
retained chain and restores the missing bytes before evaluating eligibility.
Conflicting copies are never overwritten or chosen automatically. Completed jobs
saved before their terminal event are reconciled with their original inputs and
outcomes before current-input preflight. Unknown interrupted jobs block older
proof until a fresh complete assessment recovers. This is local redundancy, not
backup: loss of both copies of a terminal suffix cannot be detected from the
remaining prefix alone. Prior unmirrored contracts require explicit current-run
resume and fresh proof; surviving old prefixes are not upgraded into authority.

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
