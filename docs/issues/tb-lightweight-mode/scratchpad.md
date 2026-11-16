# Decision Scratchpad - tb-lightweight-mode

**Feature start:** 2026-11-15

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## S1 — run dials (tb-lightweight-mode-01-run-dials)

- **Delegation is rejected in S1.**
  - `autonomy: delegated` is rejected both at `run.start` and via `run.set-dial`
    ("requires release-branch protection checks that are not yet available").
  - S5 adds the protection precondition and enables it.
  - Rationale: no intermediate integration-branch state may allow delegation
    without its safety precondition.
- **A built-in dial has `actor: null`** (`source: built-in`). The spec's "who set it"
  applies to explicit choices (`human` | `agent`).
- **Choosing the default value is allowed without a human instruction.** An explicit
  choice of the default (e.g. `rigor: {value: 'full'}`) is recorded as
  `source: explicit, actor: agent`. Non-default values require an observed human
  `authority`.
- **Dial event time** comes from the event's `recordedAt`, not a caller field.
- **Unresolved required FAIL** means: the latest result for each required non-core
  acceptance gate bound to the current candidate is FAIL, and no current waiver names
  that gate for that candidate. With no candidate, nothing blocks lowering.
- **Desktop dependencies.** `npm ci` in `apps/desktop` was needed (esbuild missing);
  npm withheld package install scripts (esbuild, node-pty) pending
  `npm approve-scripts`.
- **Test environment.** A stale `/tmp/gatereeve/.maintenance-lock` (dead owner PID
  3655274, left by an interrupted local test run) blocks the default scratch root.
  Per STORAGE.md it was not removed. Suites run with a private registered
  `GATEREEVE_SCRATCH_ROOT`.
- **Superseded 2026-11-16: "unresolved required FAIL".** The bullet above defining
  it no longer applies. Four S1 review rounds found successive gaps in judging FAIL
  resolution: waiver scope, non-live candidates, indecisive results, and
  non-qualifying later passes. Trent prohibited lowering rigor within a run (D16;
  design Changes 2026-11-16). `run.set-dial` now always rejects full → light, and
  the detection code was removed.
- **Earlier-contract database handling.** The current-6 `workflow.sqlite` is read
  read-only, solely for activation provenance, and its `-wal`/`-shm` sidecars get the
  same file-safety checks (review F10). It takes precedence over older `active.json`
  chains (F8).

## S2 — light rigor (tb-lightweight-mode-02-light-rigor)

- **Light phase flow.**
  - A light run starts in DESIGNING. A human `authorize-implementation` bound to the
    brief subject moves it straight to IMPLEMENTING.
  - That decision is accepted in any phase before INTEGRATED, so a changed brief is
    re-authorized the same way, superseding earlier authority and the old candidate.
  - `amend` is refused while light.
- **Light commitments.** `brief.md` is the only document. The subject is
  `identity({contract, featureId, rigor: 'light', brief})`, and spec validation is
  neither required nor checked while light.
- **Brief structure.** A light `authorize-implementation` requires Goal, Scope and
  Findings headings in `brief.md`. Content is not judged (spec AC3: goal, scope,
  findings log).
- **Raising light → full.**
  - The phase returns to DESIGNING if past PLANNING, and readiness is cleared.
  - The full sequence is then required: approve-design, spec.validate, a new
    authorize-implementation, and a rubric candidate.
  - Because `approve-design` captures `interview.md`, a raised run must also
    backfill an interview record. This goes slightly beyond AC2's list and is
    accepted as a consequence of the existing design gate.
- **Light candidate criterion.** `criteria` is exactly `["brief"]` for SLICE and
  FEATURE; rubric IDs are rejected. Requirements contain only `brief.md`.
- **Light review basis.**
  - Reviewer requirements are only `requirements/brief.md`; the packet carries
    `planning.basis: 'brief'`.
  - Finding criteria are `brief` or `gate:<gate>`.
  - Evaluator independence is unchanged, and full-rigor review text is
    byte-identical to before.
- **Refused in light:** the supplemental `spec`, `judge`, `reconcile` and `triage`
  gates, which need a rubric. `code`, `pattern`, `explanation` and Whiteboard still
  work.
- **Verification provenance, both rigors.**
  - Shape: `provenance: {policy, agentRun[], hostedCi[], none, summary}` on the
    verification result and runner record, shown in milestone outcomes and as a CLI
    status line.
  - A CI run reporting zero jobs fails explicitly ("reported no CI checks") and
    stays UNAVAILABLE.
  - At merge, the integration receipt records the hosted-check observation
    (`required | reported | none`). This touches `actions.js`, which S3 also changes.
- **commitments() with no run** falls back to full, the default rigor (needed by
  resume before a run exists).

## S3 — delivery targets (tb-lightweight-mode-03-delivery-targets)

- **Scope bound to target** lives in `authorization.js` `deliveryTarget()`.
  - It is used by `prepareMerge`, so every path that binds a prepared action
    applies it: human `authorize-merge`, `authorization.apply`, `merge.execute`
    and `delivery.resume`.
  - With distinct branches: `SLICE` must target integration (and its head cannot
    be the release branch). `FEATURE` must be head = integration and
    base = release. Any other pairing is rejected and the message names the
    allowed pairing.
  - With one branch (integration == release), any scope may target it.
  - The prepared action now carries `deliveryTarget: integration | release`, so
    a human authorization visibly names a release merge.
  - The candidate does not record branch names, so the binding is checked at
    merge preparation (spec: "rejected at merge preparation"), not at
    `candidate.prepare`.
- **Standing grants and the release branch.**
  - A grant whose `baseBranch` is the release branch is rejected at capture.
    With integration == release, every grant is rejected, including
    acceptance-only ones: the only target is the release branch.
  - Grants recorded before the rule are retained. `standingValidity` refuses them
    first, with a specific reason, and status adds `namesReleaseBranch: true`.
    The existing CLI and desktop grant lines already print the inactive reason.
  - Such grants authorize neither acceptance nor merge. Spec AC6 says "no longer
    authorizing merges"; refusing the whole grant matches design §5 ("validation
    rejects baseBranch = releaseBranch").
  - Belt-and-braces: `standingValidity(action)` and `merge()` also refuse
    `deliveryTarget: release` under a standing grant.
  - Seam for S5: `deliveryBranches()`/`standingTargetRefusal()` are the place for
    the delegated equivalent.
- **Review summary publication (R9).**
  - New operation `review.publish {repository, number}` (CLI
    `publish-review`), implemented in the new module
    `protocol/current/publication.js`.
  - It renders the latest qualifying `review` result (PASS or FAIL; UNAVAILABLE
    is skipped) deterministically. The section covers outcome, reviewed head,
    candidate hash, scope, rigor basis, result hash, evaluator, summary,
    criteria, dimensions and findings.
  - The section is written between HTML-comment markers in the PR description
    (preferred over a pinned comment). An existing section is replaced in place
    and other text is kept. If nothing changes, no write happens.
  - Damaged markers are refused. Model-authored text has `<!--`/`-->` escaped, so
    it cannot close or forge the section. CRLF bodies are tolerated.
  - Publication refuses when the PR head differs from the candidate head.
  - Nothing is recorded in the journal: the PR body is the record, and
    verification re-renders the section.
- **Where the summary is enforced:** at merge authorization, in human
  `human.decide` with `authorize-merge` (any kind) and in standing
  `authorization.apply` with an action.
  - That is when someone relies on the presentation, and it is the
    authority-granting event.
  - `merge.execute` repeats the check before its first external write.
  - Not at `merge.prepare`, which is a read-only derivation that agents call
    repeatedly, including to obtain the action to publish against.
  - A plain `accept` binds no PR, so presenting the summary for human review
    before acceptance is a guidance obligation (PR-boundary, WORKFLOW).
  - The protected-merge and standing tests in `current-core.test.js` and the
    CLI test now publish before authorizing.
- **External blockers.**
  - A failed `gh pr merge` is reclassified only when a re-read shows the PR
    still OPEN at the authorized head, and the host reports either
    `reviewDecision` REVIEW_REQUIRED/CHANGES_REQUESTED, `mergeStateStatus`
    BLOCKED, or a policy/review diagnostic.
  - Everything else keeps its original error. In particular, a lost response
    after an actual merge (state MERGED) keeps recovery semantics.
  - Merge conflicts ("not mergeable" without policy wording) are not
    classified.
  - Shape: `ExternalBlockerError`, code `EXTERNAL_BLOCKER`, details
    `{kind: 'external-blocker', blocker: 'required-review' | 'branch-policy',
    gateFailure: false, recorded, ...action identity}`.
  - It is recorded as a `MERGE_BLOCKED` event projected to
    `state.externalBlocker` and `externalBlockers`. `CANDIDATE` and
    `INTEGRATED` clear the current blocker.
  - The snapshot shows an `external-blocker` blocker, and `delivery.resume`
    returns status `external-blocker` with next action `human`. This is the
    hand-back seam for S5.
  - The existing finally-block cleanup restores draft or closed presentation.
  - Contract stays `current/7`. Runs without the new event project unchanged.
- **Not done: Git fallback merges.** Design §5 says the Git fallback (no
  configuration) should support per-PR human merges. The legacy context still
  configures no branches, so `merge.prepare` still requires a workspace
  configuration, as before. This is unchanged, documented in
  WORKSPACE-CONTEXT.md and left for a later slice.
- **Existing tests changed by intended behavior:**
  - `current-core.test.js`:
    - `standingRepository` now configures `releaseBranch: production`, so
      grants naming `main` stay valid as integration grants.
    - Standing merge modes use SLICE candidates. Mode `final` now asserts that
      a FEATURE PR from a slice branch is rejected at `merge.prepare`.
    - Protected-merge and standing stubs serve and edit the PR body, and the
      tests publish before authorizing.
  - `current-cli.test.js` standing test: uses a fixture with
    `releaseBranch: production` (new `currentFixture` option).

## S4 — guard and session (tb-lightweight-mode-04-guard-and-session)

- **Guard structure.** The classifier is a new pure module,
  `protocol/current/command-guard.js`: a small shell tokenizer (quotes, `$'...'`,
  separators, subshells, `$(...)`, backticks, process substitution, redirects,
  heredocs) plus unwrapping of assignments, reserved words and wrappers (`sudo`,
  `doas`, `env` incl. `-S`, `command`, `exec`, `nohup`, `nice`, `timeout`,
  `xargs`, ...). Shell scripts given with `-c`, as a heredoc or here-string to a
  shell, and `eval` arguments are classified recursively (depth 6).
  `pre-tool-use.js` keeps the hook I/O and the milestone reason.
- **Quoted text and heredoc bodies are not commands.** A commit message or
  `cat <<EOF` body mentioning `gh pr merge` is allowed; a heredoc or here-string
  fed to a shell is classified. Without this, ordinary commit messages in this
  very feature would be denied.
- **`gh api` merge endpoint:** denied for any method except an explicit
  `GET`/`HEAD` (an omitted method is treated as a write, because `-f` fields make
  gh POST). GraphQL `mergePullRequest`, `enablePullRequestAutoMerge` and
  `enqueuePullRequest` are denied only when the query is inline; `--input`
  files and `-F query=@file` are not read. `gh alias set` defining a merge is
  denied too.
- **`git push` protection** uses the integration and release branches of every
  configured repository (union), whatever the remote. Destinations come from
  refspecs (`+`, `src:dst`, `:dst`, `refs/heads/`, `--delete`), `--all`/
  `--mirror`/`--branches`, and globs; an implicit destination or `HEAD`/`@`
  resolves to the current branch (`git branch --show-current`, honouring `-C`),
  i.e. push.default `simple`/`current`. Tags and other `refs/` are ignored. An
  unconfigured (Git fallback) workspace or an unresolvable context protects no
  branch, so pushes there are allowed (merges are still denied, fail-closed).
- **Consequence for this feature's own process:** once installed, the guard
  denies direct pushes to `tb-lightweight-mode` (the configured integration
  branch) as well as `main`. Record-keeping commits on the integration branch
  then go through a PR, or are pushed by the human.
- **Entry-point resolution** (`protocol/current/entry-point.js`), one helper for
  the hook and `status`: the bundled `plugin-adapter.js` next to the module copy
  that is running (plugin, CLI resources or desktop resources), offered only if
  it exists and is not inside an `.asar` archive; and `gatereeve` only when an
  executable file of that name is on `PATH` (PATHEXT on Windows). If neither
  exists the message says so instead of naming a command. No wrapper script was
  added: the adapter's `--request-file` and `status --cwd` forms are sufficient.
- **Denials name both** available entry points (adapter request skeletons for
  `merge.prepare` then `merge.execute`, filled with the configured alias and the
  PR number/method parsed from the command when present; CLI forms only when on
  PATH). The invalid-hook-input denial also names the status entry point.
- **Status recovery.** `status` adds `entryPoints {adapter, cli}` and
  `branches [{alias, integrationBranch, releaseBranch}]`. Each action gets
  `operation` and `entryPoint` (`cli` | `adapter` | `none`); copyable `command`
  is the CLI form when on PATH (unchanged text), otherwise the adapter command
  with a `request` skeleton. The resume and external-blocker messages name the
  entry points. Callers may pass `runtime.environment`/`runtime.entryPoints`
  (tests, desktop).
- **SessionStart.** `session_start.py` now renders state from adapter `status`:
  no run (defaults, "full or light?", pointer to both procedures, resume hint
  only when feature documents exist), light (light procedure only; never the
  full workflow), full (skill + WORKFLOW.md), delegated (scope naming the
  configured integration/release branches, hand-back triggers). Unknown dial
  values render as the defaults, never light/delegated. Any adapter or
  interpretation failure gives a short safe message with the defaults and the
  question. Timeout raised from 3 s to 5 s.
- **Visibility.** CLI status prints `Rigor:`/`Autonomy:` lines ("(default for a
  new run)" with no run). The desktop overview heading has a `#workflow-dials`
  group with two badges; defaults are marked "(default)", light and delegated
  use a highlighted style. `ENFORCEMENT` text in `contracts.js` now describes the
  wider guard and run-state SessionStart (contract stays `current/7`).
- **Light procedure and routing.** New `resources/commands/light-run.md`
  (start, brief skeleton, brief-bound authority, raising rigor, acceptance with
  the same gates, publication and merge). The `software-development-workflow`
  skill routes by rigor; `workflow-design`, `workflow-spec-draft`,
  `workflow-spec-validate` and `workflow-branch-bootstrap` redirect light runs.
  No `templates/brief.md` was added; the skeleton is in the procedure.
- **Existing tests changed by intended behavior:** `test_session_start.py` was
  rewritten (the old assertions required "load the software-development-workflow
  skill" for every session and the "current run needed" wording). The
  `platform-contracts.json` `sessionStartOutput` description and INSTALL.md were
  updated to the state-reporting behavior.

## S5 — tripwires and delegation (tb-lightweight-mode-05-tripwires-and-delegation)

- **Tripwire module.** New pure-ish module `protocol/current/tripwires.js`
  (`evaluateTripwires(context, candidateValue)`). Path rules match every changed
  path between the candidate's pinned base and head (added, modified, deleted);
  content rules match lines of the head that do not occur anywhere in the base
  (a multiset-free "added line" approximation that is deterministic and cheap).
  Binary blobs and blobs over 1 MiB are classified by path only and listed as
  `skipped`. Hits record `{category, rule, source, kind, repository, path, line?}`
  and never the matched text (a secret must not be copied into the journal).
- **Categories and patterns.** `migrations-schema`, `auth-security`, `secrets`,
  `public-api`, `data-deletion` (`TRIPWIRE_CATEGORIES` in `contracts.js`). SQL
  content rules are upper-case only so prose ("delete from the list") does not
  trigger; `*.sql`, `migrations/` and similar path rules catch lower-case SQL.
  Over-triggering (for example `session` path segments) is accepted per design
  open risks; repositories narrow it with configuration.
- **Repository configuration location.** `.gatereeve/tripwires.json` committed at
  each repository root (`{schemaVersion: 1, categories: {<category>: {paths,
  content, excludePaths, builtIn}}}`), modeled on pattern-review triggers (globs
  plus regexes). Chosen over `.agentic-workflow.json` because the spec says
  "repository-configurable" and the workspace file is local and untracked. It is
  read from the candidate's pinned **base** commit, so a change cannot weaken its
  own tripwires, and any change to the file is itself an `auth-security` hit
  (`tripwire-configuration`, which `builtIn: false` cannot disable). Invalid
  configuration fails the light `candidate.prepare` and makes acceptance blocked
  ("tripwire evaluation unavailable"), never empty.
- **Where evaluated.** Light runs only (spec AC4: "a light run's candidate diff").
  At `candidate.prepare` before the candidate is published (recorded as
  `TRIPWIRES_EVALUATED`, projected to `state.tripwires`/`tripwireHistory`; a new
  `CANDIDATE` clears the current one), and again live inside every non-
  implementation `milestone.check` from the pinned source. Full-rigor runs are not
  classified. The check result carries `tripwires`; status/snapshot carry
  `tripwires` and a `tripwire` blocker.
- **Supervised disposition.** New decision kind `stay-light` (human-confirmed
  only), `subject` = `tripwireSubject(hits)` = identity of the sorted hit keys
  `category|rule|repository|path` (line numbers excluded so a fix iteration with
  the same hits does not need a new decision). It covers the current hits when
  every current key is in the decision; a new hit needs a new decision. It lives
  in `currentAuthorityDecisions`, so a brief re-authorization voids it.
  Escalation is the existing `run.set-dial rigor full`.
- **Delegated disposition.** A hit raises rigor to full automatically: a
  `DIAL_SET` with `source: automatic`, `actor: gatereeve`, `trigger: tripwire`
  and the hit-set identity, appended after `TRIPWIRES_EVALUATED` at
  `candidate.prepare`, or before the acceptance check in `milestone.pass
  acceptance` and in `delegation.apply` (covers delegation granted after a
  supervised hit). `stay-light` is rejected under delegation for any authority,
  and once full it is rejected as "already full rigor". The spec's AC5 hand-back
  list does not include tripwires, so autonomy stays delegated after the
  escalation; delegated full planning then needs design and spec review PASSes.
- **`automaticDial` provenance.** Protocol-recorded dial changes use
  `source: automatic`, `actor: gatereeve` and a `trigger`. They can only raise
  rigor or return autonomy to supervised. S6 should project `trigger`.
- **Delegation decision.** `run.set-dial` autonomy delegated requires
  `actor: human`, the observed instruction and a new `runId` field equal to the
  active run ("naming the run"); `runId` is refused on every other change. At
  `run.start` the run is named by its own `runId`. The core then observes every
  configured repository's release branch through `gh api --method GET
  repos/{owner}/{repo}/branches/{release}` (`protected` flag) and records the
  observations on the dial as `protection`. A 404 is observed absence of
  protection; any other failure is "could not be observed" and also rejects. The
  Git fallback (no release branch) cannot delegate.
- **integration == release.** Delegation is allowed (AC5's only precondition is
  protection, and delegated planning is still useful) but grants no delegated
  merge: `delegation.apply` refuses any `deliveryTarget: release`, and status
  `delegation.scope` says "none".
- **Delegated authority kind.** `delegated-evaluator`, accepted by `decision()`
  only for `approve-design` and `authorize-implementation` without continuations,
  input `{kind, delegation: <delegation event>, evaluation: <PLANNING_REVIEWED
  event>}`. The core requires the run to be delegated under that exact event, the
  cited review to be a PASS of the matching artifact (design for approve-design;
  spec for full authorize-implementation, in addition to `spec.validate`; brief
  for light) for exactly the decision's subject, no later review of that subject,
  a non-implementer reviewer, retained bytes, and re-observed protection. The
  recorded authority replaces the input with a citation
  `{kind, basis: planning-review, delegation: {event, at, authority}, evaluation:
  {event, artifact, outcome, result, evaluator}}`.
- **Planning review path (new).** Nothing existing produced an independent PASS
  on a planning artifact (`spec.validate` is a deterministic linter), so S5 adds
  operation `planning.review {artifact: design|spec|brief, configuration}` in new
  module `protocol/current/delegation.js`. It writes the bound documents into a
  sealed read-only view, runs the same agent adapter as gates (high-capability
  profile, fresh context, read-only, no network), verifies the receipt like
  `gate.execute`, and records `PLANNING_REVIEWED {artifact, subject, documents,
  outcome, result, evaluator}`. It may run in any planning phase and either
  autonomy; only delegated decisions consume it. For full rigor the spec review is
  required in addition to the deterministic `spec.validate` (conservative).
- **Delegated slice delivery.** New operation `delegation.apply {action}` (like
  `authorization.apply` for standing grants). It requires delegation, a `SLICE`
  candidate, an exact prepared action with `deliveryTarget: integration`, every
  required gate PASS (no exceptions), the published review summary, and
  re-observed protection. It records `accept` + `authorize-merge` with the
  delegated-evaluator authority (`basis: required-gates`) and a `delegation`
  marker. Delegated acceptance always binds a merge action (conservative: AC5
  ties delegated acceptance to a PR targeting the integration branch).
  `qualifyingDecisions` honors it only while the same delegation is current
  (`delegationValidity`), so any hand-back voids it. `merge()` re-observes
  protection before reopening/readying the PR and again right before the merge
  write. `delivery.resume` uses `delegation.apply` for a SLICE PR into
  integration.
- **Hand-back triggers.** All recorded as `DIAL_SET` autonomy → supervised:
  - `amend`: any amendment recorded while delegated (all amendments change the
    approved commitments) — appended just before the `DECIDED amend`; and a
    delegated light re-authorization whose brief Goal or Scope section text
    changed (findings-log-only changes are allowed with a new brief review).
    Without the second rule light + delegated would have no scope-change trigger
    at all, since `amend` is refused while light.
  - `agent`: `run.set-dial` autonomy supervised by the agent (recorded with
    `trigger: agent`; a human return records `trigger: human`).
  - `external-blocker`: after `MERGE_BLOCKED` in `recordExternalBlocker`; the
    error details carry `handedBack: true`.
  - `protection-lost`: `guardDelegatedAction` before delegated decisions,
    `delegation.apply` and delegated merges. An unobservable protection state
    refuses the action without handing back (a transient API error should not end
    delegation).
- **Hand-back visibility.** Projection keeps `state.handBack` from a non-human
  hand-back until the next human-confirmed `DECIDED`; the snapshot shows a
  `hand-back` blocker for it (SessionStart already renders blockers). Status
  `delegation` reports active, event, instruction, protection, scope per
  repository, triggers, hand-backs and delegated decisions; CLI status prints a
  delegation line, delegated decisions and tripwire hits.
- **Contract.** Stays `gatereeve/current/7` (as S3 did for `MERGE_BLOCKED`): new
  events `TRIPWIRES_EVALUATED` and `PLANNING_REVIEWED`, new `DIAL_SET` fields.
  An S1–S4 build reading a contract-7 journal with these events would throw
  "Unsupported current event"; nothing has been released between slices.
- **CLI.** New commands `review-planning`, `decide-delegated`,
  `apply-delegation`; `decide` lists `stay-light`. `run.set-dial` stays
  adapter-only, as before.
- **Existing tests changed by intended behavior:** `current-dials.test.js` — the
  start-choice case `autonomy: delegated` now fails with "Delegation needs a
  configured release branch" (the fixture is the Git fallback) instead of "protection
  checks", and the S1 test "delegation is human-only and unavailable before
  protection checks" became "delegation is human-only, names the run, and needs a
  configured protected release branch" (agent refused, unnamed or misnamed run
  refused, Git fallback refused, `runId` refused on other changes).
  `current-guard.test.js` — the governed snapshot's action list now also names
  `planning.review` and `delegation.apply` (new status actions).
- **Desktop history label.** The event history labelled any event carrying an
  `authority` as "Human decision"; it now does so only for `human-confirmed` and
  labels `delegated-evaluator` events "Delegated decision (evaluator PASS)".
- **Test environment.** Running the Python suites from the source tree leaves
  `__pycache__` under `plugin-src`, which the plugin source lint (and every
  release/marketplace test that composes sources) rejects. Run them with
  `PYTHONDONTWRITEBYTECODE=1` or delete the caches before `npm test`.

### S5 review round 1 (FAIL on 7fa0563) — fixes

- **F1 brief scope.** `briefScope` compared only text directly under Goal/Scope
  headings, so edits under Scope sub-headings, other sections or the preamble
  escaped the scope-change hand-back. It now hashes the whole brief except the
  Findings section (that heading and nested sub-headings up to the next heading
  of the same or higher level), whitespace-normalized. Findings-only edits,
  including nested headings, still re-authorize with a new brief review.
- **N2 failed hand-back.** A `MERGE_BLOCKED` recorded while delegated now sets
  `state.delegationBlocked` to the delegation event (cleared by any autonomy
  `DIAL_SET`). `delegationValidity` refuses delegated acceptance/merge under it,
  `guardDelegatedAction` refuses every delegated action, a delegated
  `authorize-implementation` stops counting, and the snapshot shows a
  `hand-back` blocker. `recordExternalBlocker` reports `handBackFailed: true` and
  says so in the message. Residual: if both the `MERGE_BLOCKED` append and the
  hand-back fail, nothing durable records the blocker; the error says so.
- **N3 raised runs.** When rigor was raised from light, design and spec
  `planning.review` packets add `requirements/brief.md` (the brief from the last
  brief-bound authorization, else the current file) and an extra rule: going
  beyond its goal or scope is blocking. The review contract identity includes the
  variant, and a delegated decision in a raised run must cite a review that
  carried that brief. The brief is checked as retained bytes, not live bytes.
- **N4 voided delegated implementation.** `findDecision` ignores a
  delegated-evaluator `authorize-implementation` unless its delegation is the
  current one (and not blocked). After any hand-back, implementation checks,
  `candidate.prepare`, `candidate.ready` and `gate.execute` refuse until a human
  `authorize-implementation`. A full run may record that in IMPLEMENTING/ACCEPTING
  for its unchanged validated commitments (previously only PLANNING), otherwise
  a hand-back would deadlock it. A delegated `approve-design` stays valid; the
  human authorization is the stop. The hand-back blocker text names this.
- **Known limitation (N1, kept).** A `stay-light` decision binds hit keys
  `category|rule|repository|path` without content or line, so further risky
  content added to an already-hit path under the same rule is covered by the
  existing decision. Accepted so fix iterations on the same hits don't re-ask.

## S6 — measurement and rollout (tb-lightweight-mode-06-measurement)

- **Observation fields.** `fleet.js` `observation()` allows `rigor`, `autonomy`
  (validated against the dial values), `authorityKind`, `authorityBasis`, `dial`,
  `dialValue`, `dialPrevious`, `dialSource`, `actor`, `trigger`, `blocker`,
  `linkBasis`, `stage`, `count` (non-negative integer) and the label lists
  `categories` and `actions`. The dial source is `dialSource` because `source`
  is already the reporting source identity.
- **Dials on every projected observation.** `projectWorkflow` replays dial values
  from the whole journal (the projection is incremental) and stamps each row
  with the rigor and autonomy in force when its event was recorded (a
  `DIAL_SET` row carries its new value). A STARTED without dials reads
  `full`/`supervised`, matching `project()`. Rows projected before S6 are not
  rewritten; reports group them, and execution timings (not run events), as
  "Not recorded", never as full/supervised (conservative).
- **Event mapping.** `STARTED` adds one `DIAL_INITIAL` row per recorded start
  dial (value, source, actor, authority kind); `DIAL_SET` carries dial, previous,
  value, source, actor, trigger and authority kind (settings, delegation,
  escalation and hand-back); `DECIDED` carries authority kind, delegated basis,
  continuation `actions` and, for `stay-light`, the hit `count`;
  `TRIPWIRES_EVALUATED` carries stage, `HIT`/`CLEAR`, hit count and categories;
  `PLANNING_REVIEWED` becomes an `artifact` row `planning-review:<artifact>` with
  outcome and evaluator; `MERGE_BLOCKED` carries the blocker kind. No reasons,
  instructions, conversation context, paths or messages are projected.
- **Review publication** records no run event (S3: the PR body is the record),
  so it is measured as the `review.publish` operation timing rather than adding
  a journal event. `stay-light`, `run.set-dial`, `review.publish`,
  `planning.review` and `delegation.apply` were added to the metrics operation
  labels (older collectors read new labels leniently).
- **Escaped defects** use the existing `workflow.observe` (CLI `workflow-note`).
  A note whose `links` link a fix to an origin needs `fixId`, `linkBasis`
  (`human-stated` or `agent-proposed`) and a `human-confirmed` authority; an
  agent proposal without the human's confirmation is refused, so it is never
  stored. `linkBasis`/`authority` are refused on any other note. Both bases
  require the observed human instruction (conservative: a human-stated link is
  the human's statement). The projection emits links only with that basis;
  links on escaped-defect notes recorded by earlier builds are dropped from
  reporting (not counted as confirmed). Imported snapshots are not rejected for
  lacking a basis; reports count confirmed origins by `linkBasis` only.
- **Wording.** `metrics reevaluate` adds Rigor/Autonomy/Decision authority
  groups and a `measurement` summary. With no records the report says "No
  escaped defects recorded" plus that absence is not evidence of safety;
  otherwise "N escaped defects recorded, M with a human-stated or
  human-confirmed origin link ... neither a defect rate nor evidence of safety".
  A dial-comparison caveat (observational, not randomized, incomplete defect
  capture) is part of the summary and HTML. The optional analysis instructions
  forbid treating absent defect records as safety.
- **No run, nothing to project.** `projectWorkflow` returns without marking
  capture incomplete when there is no current run (for example a contract-6 run
  awaiting resumption). Previously any operation without a current run marked
  the store incomplete.
- **Advisory fixes.**
  - S5 N5: `briefScope` excludes only the first `findings...` heading at the
    level of the Goal/Scope headings (with its sub-headings). Headings inside
    fenced code are ignored, there and in `assertBrief`. A findings heading at
    another level is not the log, so edits to it hand back (fail closed).
  - S3 N1: publication renders the latest qualifying review result whatever its
    outcome, as the acceptance inventory selects it; an UNAVAILABLE result is
    shown as "UNAVAILABLE (... not a PASS, and no earlier result is shown in its
    place)". Authorization uses the same selection.
  - S3 N2: `required-review` needs the refusal to name a review rule, or the
    host to report `mergeStateStatus` BLOCKED with a pending review decision.
    The existing unit case "CHANGES_REQUESTED on a CLEAN PR with an empty
    message → required-review" now expects no classification (intended).
  - S4 N4: `git push [remote] --tags` with no other refspec pushes only tags and
    is allowed; `--tags` with a protected refspec is still denied.
    `--follow-tags` still pushes the current branch and is denied on it.
  - S4 N2: `$(...)` matching skips heredoc bodies (delimiter forms `<<EOF`,
    `<<-EOF`, quoted), except in `$((...))` arithmetic, and skips `#` comments
    at a word start so a `<<` in a comment cannot open a heredoc that would
    swallow later commands.
  - S4 N1/N3 and S5 N1 remain documented limitations in PROTOCOL.md.
- **Contract** stays `gatereeve/current/7`; no new event type was added in S6.
- **Inventory.** `workflow-inventory.json` already lists every file S1–S5 added
  (`light-run.md`, `command-guard.js`, `delegation.js`, `entry-point.js`,
  `publication.js`, `tripwires.js`); S6 adds no resource file, operation or
  hook. (`release/package.json` is absent from the inventory, as before this
  feature.)
- **Test environment.** Tests that run real operations project into the default
  metrics store (`~/.local/share/gatereeve/performance` unless
  `GATEREEVE_METRICS_DIR` is set). On this machine it is at its 100 MiB cap, so
  those projections fail and print "capture incomplete" (authority unaffected).
  The new measurement test isolates its default store.

### S6 review round 1 (PASS with advisories, fixed before the FEATURE PR)

- **N1 (guard regression).** S6's comment and heredoc skipping in `matching()`
  also ran for `${...}` and `$((...))`, so a merge command after `${X:- #}` was
  admitted. Both rules now apply only inside a command substitution `$(...)`;
  three such forms are in the MERGES corpus.
- **N2 (measurement).** Decisions applied under a standing grant keep the grant's
  `human-confirmed` authority kind, so they were counted as human touches. They
  now project `authorityBasis: standing-grant`, are excluded from `humanTouches`,
  and are reported as `standingApplications`.
- **Known, out of scope:** a top-level `(( x <<EOF ))` arithmetic expression is
  parsed as a heredoc and can hide the following lines from the guard
  (pre-existing S4 parsing; best-effort).
- **Dogfooding note.** The installed rc.26 regex guard denied a shell command
  whose heredoc text merely mentioned the merge command; S4's parser fixes this
  class once installed.
