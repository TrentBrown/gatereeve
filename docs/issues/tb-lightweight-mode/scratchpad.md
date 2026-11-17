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

## S8 — workspace configuration (tb-lightweight-mode-08-workspace-config)

- **Module.** New `protocol/current/workspace.js` (`prepareWorkspace`,
  `observeDelivery`, `branchFeatureMatch`, `excludeConfiguration`,
  `workspaceStatus`). `context.js` gains `reresolveWorkflowContext` (re-resolve a
  discovered context with its retained options after GateReeve writes the file).
- **Where enforced.** The adapter prepares the workspace for `run.start` and
  `workspace.configure` before it creates the feature home or checks for an active
  run, so a configuration naming another feature stops before anything is created
  in that feature's home, and a written or replaced configuration decides which
  home is used. The core receives the preparation through a module symbol
  (`WORKSPACE_PREPARED`), not through JSON input. An embedder calling the core with
  a resolved context gets the same rules from `core.start`; there a replacement that
  would move the feature home is refused before writing. Explicit in-memory
  contexts (no `mode`) are untouched and refuse workspace instructions.
- **Feature identity of the started run.** The current branch of the selected
  repository, as in the Git fallback. An existing configuration "names the feature
  being started" when the branch is its `featureId`, one of its sequential delivery
  branches (`<featureId>-NN-<description>`, ordinal >= 1, the
  `validate_delivery_branch` rule in `workflow_context.py`), or its distinct
  integration branch. Anything else, including a detached HEAD, is a mismatch.
  This applies to every configuration, hand-written or GateReeve-written
  (conservative): a stale hand-written file is as dangerous as a generated one.
- **Mismatch.** `run.start` fails (`details.kind: workspace-feature-mismatch`)
  naming both features and both instructions. Continuing needs the observed human
  instruction (`authority`, human-confirmed) in `workspace`:
  `{confirmFeature: <configured featureId>, authority}` (the run belongs to the
  configured feature after all; recorded as `match: human-confirmed`) or
  `{replace: true, authority}`. Chosen conservative: confirming also needs the
  human, so the agent cannot get past the refusal by restating the configured
  feature. Any instruction is refused when the configuration already matches, and
  when there is no configuration.
- **Replacement limits.** Only a single-repository configuration at the selected
  repository's root is replaced (a multi-repository workspace file is edited by
  hand). The default branch must be observed, and the target feature home must not
  already hold a run, before anything is written; then the file must still hold the
  judged bytes and is replaced by rename. The record keeps the previous feature and
  retains the previous bytes in the run's store.
- **Creation.** Git fallback only. GitHub remote: `origin` when it is a GitHub URL
  (the `remoteName` forms merge preparation accepts), else the only GitHub remote;
  several non-origin GitHub remotes or none means nothing is written. Default branch:
  `gh api --method GET repos/{owner}/{repo}` `default_branch` (non-admin), validated
  as a branch name. No `git symbolic-ref refs/remotes/<remote>/HEAD` fallback: no
  other code observes branches that way, and a stale local remote HEAD could name
  the wrong branch. Any failure starts the run without writing and records
  `{status: unconfigured, reason}`. Also not written (choices): a run started on the
  default branch itself (featureId would equal integration/release), and a run
  started with `autonomy: delegated` (S5: the Git fallback cannot delegate; the
  protection check runs against the pre-write context, so delegation at start still
  needs an existing configuration). `featureBaseSha` is not written: the single-PR
  shape delivers `SLICE` PRs into the default branch; a `FEATURE` review needs a
  person to add it (as for any configuration).
- **Writing.** Local exclude first (`<git-common-dir>/info/exclude`, entry
  `/.agentic-workflow.json`, added only when neither that nor the bare name is
  present), then an exclusive atomic write (temporary file, `link`, never over an
  existing file; an appearing file aborts the operation). The context is then
  re-resolved and must name the same feature and home. The record stores the
  observation (remote name and owner/repo, never the URL, which could carry
  credentials), the configuration, the file hash (bytes retained in the store) and
  the exclude change.
- **Rollback.** A configuration written for a request that then fails without any
  event recording it is removed (or the previous bytes restored after a
  replacement), in the adapter and in `core.start`/`configureWorkspace`. The
  exclude entry stays (harmless, idempotent).
- **Recording.** `STARTED.workspace` for run start (`created`, `replaced`,
  `configured` with `match`, or `unconfigured` with `reason`); new event
  `WORKSPACE_CONFIGURED` for `workspace.configure` (projected to `state.workspace`).
  Contract stays `gatereeve/current/7`, as S3/S5 did for new events. An S1–S7 build
  reading a journal with `WORKSPACE_CONFIGURED` would throw "Unsupported current
  event"; nothing has been released between slices.
- **workspace.configure.** Input `{}` or the same instruction shape. Needs an
  active run in the target feature home ("run.start writes it" otherwise). Already
  configured for the feature: `{written: false, workspace: {status: configured}}`,
  no event. Fallback without a GitHub remote or observable default branch: fails
  with the reason (nothing to record). CLI `gatereeve workspace configure`
  (`--replace-workspace` / `--confirm-feature` with `--instruction` and
  `--instruction-context`); `run start` takes the same options. Added to
  `CLI_FORMS`, the metrics `OPERATIONS` allowlist and the status actions (a
  `configure-workspace` action only for an unconfigured run).
- **merge.prepare.** Before the candidate and PR checks, a selected repository without an
  integration branch fails with `details: {kind: workspace-unconfigured, operation:
  workspace.configure}` and a message naming `workspace.configure` through S4's
  `recoveryText` (adapter request and/or CLI form, or the unavailable text).
  `merge.execute` uses `prepareMerge`, so it reports the same.
- **Status.** Snapshot `workspace: {mode, configPath, configured, recorded,
  branch?, matchesBranch?, message}`. With no run, the message says `run.start`
  writes the configuration (fallback) or that an existing one names another feature
  (configured, branch mismatch). For a run without configuration it names
  `workspace.configure`. CLI status prints the recorded write and the message;
  SessionStart repeats the message, and states the run-start rule itself when status
  carries no workspace information. A resumed run (`run.resume-current`) writes
  nothing automatically: it is an existing run; `workspace.configure` covers it.
  (Superseded for fresh resumption by review round 1, NEW4, below.)
- **Guard consequence.** Once written, the configuration protects the default
  branch from direct pushes (S4 rule), which it did not in the fallback.
- **NEW1.** `decide` computes `briefScopeChanged` for any light
  `authorize-implementation` while delegated. The delegated-evaluator path is
  unchanged (hands back, refuses). A human-confirmed one is recorded and hands back:
  `DIAL_SET` autonomy supervised, trigger `amend`, appended before the `DECIDED`
  (as an `amend` under delegation does). Findings-only edits do not hand back.
- **NEW3.** `pushDestinations` treats the matching refspec (`:` after stripping
  `+`) as `*`, so it is denied whenever any integration or release branch is
  configured. `:main` deletion handling is unchanged.
- **F13.** `dialChange`: rigor `light` on a light run reports "Run rigor is already
  light" before other field checks; full → light is still `LOWERING_REFUSED`.
- **Existing tests changed by intended behavior:**
  - `helpers/current-fixture.js`: the fixture repository's branch is `feature`
    (was `topic`) so it names the configured feature `feature`; with `topic`,
    run start is now refused as another feature's configuration.
  - `current-cli.test.js` standing test: the grant's `headPrefix` is `feature`
    (was `topic`) to match that branch, since standing validity checks the
    checked-out branch.

### S8 review round 1 (FAIL on 6f823b1) — fixes

- **NEW4 (blocking, R8): fresh resumption bypassed the different-feature check.**
  `run.resume-current` with nothing to resume started a run through `core.start`
  without workspace preparation, after the adapter had already created the resolved
  (possibly stale) feature home. Now:
  - "Fresh" means the resolved feature home has no current run and no retained
    activation (`store.activationHead()` is empty; a missing home counts as fresh).
    `workspace.startsFreshRun` checks this without creating anything.
  - The adapter prepares the workspace for a fresh resume exactly as for
    `run.start` (input validated first, then the mismatch refusal or human
    `confirmFeature`/`replace`, or the write when unconfigured), before
    `ensureHome`. `core.resume` calls `start` with workspace preparation when there
    is neither an active run nor a replacement activation; records carry
    `operation: run.resume-current`.
  - **Chosen rule for an unconfigured fresh resume:** it is a run start (spec AC6
    "when a run starts"), so it observes the default branch and writes the minimal
    configuration like `run.start`. Genuine resumption (a current run, a corrupt
    current run recovered from its activation, or an earlier-contract activation)
    is unchanged: no check, no write; a `workspace` instruction there is refused
    rather than silently dropped.
  - Residual (unchanged from before S8): genuinely resuming an existing run from a
    branch that does not belong to its configured feature still resumes it; no new
    feature home or run is created.
  - CLI `run resume-current` takes the same workspace options as `run start`.

### Review machinery fixes, approved by Trent 2026-11-17

These fix GateReeve's existing review machinery; they are not new feature scope.
They came from the S8 re-review: three Codex attempts returned PASS (NEW4 and
F1/NEW1–NEW3 resolved), yet each was recorded UNAVAILABLE ("Reconsider affected
closed findings and justify any carried closures"), and the Claude evaluator
failed with `spawn E2BIG`.

- **History-assessment validation** (`execution.js` `validateVerdict`). A PASS
  with `reconsiderClosures` required every `historyAssessment.affected` ID to be a
  reconsidered closure, but evaluators also list open prior findings and claimed
  fixes, which are already required. `affected` may now draw from reconsidered
  closures ∪ open prior findings and claimed fixes of that gate ∪ claim finding IDs.
  Unknown and duplicate IDs are still rejected. A `carryForwardReason` is still
  needed when any reconsidered closure is not affected. Every required ID still needs
  a supported disposition, and an open finding still cannot be carried as unaffected.
  - The evaluator prompt was left byte-identical. Its text ("independently identify
    affected IDs in historyAssessment.affected ...") does not restrict the list to
    reconsidered IDs, so it already matches the relaxed rule. Editing it would change
    the review-contract identity and make every retained review result inapplicable
    for in-flight runs.
  - `validateVerdict` is exported for the new unit tests
    (`current-history-assessment.test.js`).
- **Claude Code evaluator prompt on stdin** (`local-agent-adapters.js`). The prompt
  was the last argv element, which exceeded Linux's per-argument limit
  (MAX_ARG_STRLEN, 128 KiB) for large packets while the prompt bound is 512 KiB.
  It now goes on standard input (`input: promptFor(request)`, as the Codex
  adapter does) with `--input-format text` stated explicitly.
  - The CLI help documents `--input-format text` as the `--print` default, and
    `--print` without a prompt argument reads the prompt from stdin, which is the
    standard piped usage. I did not run a live model call to confirm it.
  - New `assertArgumentSizes` refuses any argv element of 128 KiB or more with a
    clear error before spawning. This could only happen through `--agents`, which
    carries the stage instructions.
  - No other adapter or helper passes large text in argv: Codex already used stdin.

### S8 review round 2 (FAIL on 1400155) — fixes

- **NEW5 (blocking): unhandled stdin EPIPE in `runAgentProcess`.** With the Claude
  prompt now on stdin (as Codex already was), a provider that exits before reading
  a large prompt made the pending write emit `error` on `child.stdin`. Nothing
  handled it, so it terminated the evaluator host before the failure could be
  retained as UNAVAILABLE.
  - `child.stdin` errors are now recorded and decided at `close`. A nonzero exit or
    signal keeps the existing classified provider failure.
  - A zero exit with a stdin error (the provider never received the complete
    prompt) is rejected as `AGENT_PROVIDER_CONFIGURATION` /
    `configuration-or-execution` with `providerFailure.stdin`. This is stricter
    than ignoring it (fail closed): such a run cannot be trusted to have assessed
    the prompt the receipt digests.
  - The other stdin writers already handle this: `git-source.js` listens for stdin
    errors (EPIPE after an early Git exit). The scratch and performance runners do
    not pipe stdin.
- **N5 (advisory):** CLI `workspaceInput` passed only `replace` when both
  `--replace-workspace` and `--confirm-feature` were given. It now passes both, so
  `workspaceInstruction` rejects the contradiction for `run start`,
  `run resume-current` and `workspace configure`.

## S10 — guard: Git spellings that name another repository (tb-lightweight-mode-10-guard-attached-directory)

- **NEW6 (blocking, FEATURE review round 2).** `classifyGit` recorded a directory
  only for the separated `-C dir`. Git also accepts `-Cdir`; the guard skipped it as
  an unknown flag, so `pre-tool-use` looked up protected branches in the hook's
  working directory. From an unconfigured directory, `git -C/repo push origin main`
  was admitted.
  - Attached `-Cdir` is now a directory step, in order with separated `-C`.
  - The same gap existed for `--git-dir` and `--work-tree` (separated and `=`),
    which also choose the repository Git pushes from. `--work-tree` is resolved
    after the `-C` steps; otherwise `--git-dir`, and when it names a `.git`
    directory, its parent. A bare Git directory is looked up as given (no
    workspace configuration there, so nothing is protected; best-effort, as the
    guard documents).
  - Same class, also fixed: `GIT_DIR`/`GIT_WORK_TREE` assignments (an option
    overrides them, as in Git), wrapper directory changes (`env -C`/`--chdir`,
    `sudo -D`/`--chdir`; `sudo -C` closes descriptors), and a literal `cd`/`pushd`
    earlier in the command. The classifier does not model control flow or
    subshells, so a push after a `cd` is checked in both the hook's directory and
    the `cd` target and denied if either protects the destination (fails closed).
    The `cd` chain and wrapper directories carry into `bash -c`, `eval` and
    `env -S` scripts. `cd -`, `cd ~…` and a bare `cd` name no literal target.
  - PROTOCOL.md's merge-guard section names these spellings.
- **Tests:** hook denials from an unconfigured directory outside the workspace for
  every spelling, topic pushes still allowed, and classifier directory lists. The
  attached `-C` case fails on the previous guard.

### S10 review round 1 (FAIL on 79a0c0e) — fixes

The widened directory tracking introduced three blocking gaps, all R10:

- **NEW7: `--work-tree` replaced the repository.** A work tree changes only the
  checkout. From a protected repository, `git --work-tree=/outside push origin
  main` looked up only `/outside`, a regression from the base.
- **NEW8: one `cd` sequence assumed.** Substitutions were classified before the
  `cd` that precedes them; `false && cd /outside` and subshell `cd`s collapsed the
  lookup onto the last target.
- **NEW9: Git environment lost in recursion.** `GIT_DIR=/p/.git sh -c 'git push
  origin main'` checked the hook's directory.

Fix: the classifier now returns `locations`, every place a push could act on,
and the hook denies if any protects the destination (fail closed).

- A context is directory steps plus inherited `GIT_DIR`/`GIT_WORK_TREE`.
- Within a script, literal `cd`/`pushd` (also behind `builtin`/`command` or
  reserved words) and `GIT_DIR`/`GIT_WORK_TREE` assignments or
  `export`/`declare`/`typeset`/`local`/`readonly` add contexts and never remove
  them. Every command and substitution in the script is classified against the
  final set, which covers loops, conditionals and subshells.
- Wrapper directories and Git environment carry into `bash -c`, `eval` and
  `env -S`.
- For a push in a context, the locations are: the directory Git runs in (after
  `-C`); the Git directory (option over environment; a `.git` directory stands
  for its parent); and the work tree. The work tree is an addition, never a
  replacement.
- Cost: possible over-denial. A push is denied when a protected branch of the
  same name exists in any location the command could reach, for example
  `git --git-dir=/other/.git push origin main` run inside a protected
  repository. That only affects pushes to a protected branch name.
- Limit: at most 64 contexts per script.

### S10 review round 2 (FAIL on ed0fdbb) — narrowed scope

Round 2 found NEW10 (the 64-context cap failed open), NEW8 again (`eval "cd …"`
and `eval "export GIT_DIR=…"` changes not propagated), NEW11 (collecting every
`cd` in the script made a later `cd` deny an earlier unrelated push, contrary to
R10's "leaves unrelated commands alone") and NEW12 (`env -S` dropped the
arguments after the split string; present before S10).

Tracking state that earlier commands change (`cd`, `export`) cannot be both
complete and free of false denials without modelling the shell. It had also
made those forms "listed" under R10. S10 therefore narrows to forms that are
exact for a single command, and lists earlier-command changes as a known limit
in PROTOCOL.md, next to variables and scripts:

- A push's repository is the directory Git runs in (wrapper `env -C`/`--chdir`,
  `sudo -D`/`--chdir`, then each `-C`/`-Cdir`) or, when set, the Git directory
  (`--git-dir` over a `GIT_DIR=` prefix; `.git` stands for its parent). A work
  tree selects only the checkout and is ignored (NEW7, without over-denial).
- Wrapper directories and `GIT_DIR` carry into `bash -c`, `eval` and `env -S`
  scripts, and inner assignments override them (NEW9).
- `env -S`/`--split-string` (also attached `-S…`) classifies the split string
  plus the remaining arguments, and is recognized only among `env`'s own options
  (NEW12).
- No context set, so NEW10 and NEW11 no longer arise. `cd`/`pushd`/`export`
  (NEW8) are the disclosed limit.

### S10 review round 3 (FAIL on 7cf6496) — execution-order tracking

Round 3 rejected the narrowed scope: AC7 lists chained commands and the spec
forbids weakening criteria, so `cd /protected; git push origin main` must be
denied (NEW8). It also found NEW13 (`env -S` was classified as shell syntax:
`env -S '-C /p gh pr merge 12'` was missed and `env -S 'echo ok; gh pr merge
12'` denied) and NEW14 (`env -u GIT_DIR`, `--unset=GIT_DIR`, `-i` and `sudo` left
a stale `GIT_DIR` choosing the repository).

Design now, without an amendment:

- `parseShell` records each command's separators (before/after) and enclosing
  subshell path, and the command each substitution belongs to.
- `analyze` walks commands in order with the set of contexts (directory steps,
  `GIT_DIR`) the current shell may be in. A change that certainly runs (start,
  after `;`/newline, outside `if`/`case`/loops/brace groups) replaces the set,
  so straightforward sequences are exact and a later `cd` never affects an
  earlier push (NEW11). A change that may not run (after `&&`/`||`, inside a
  compound command) adds to it. A command after `||` or inside a compound
  command sees every context seen so far. Pipeline and background commands
  change nothing; a subshell's changes are restored at its end; a substitution
  uses its command's contexts; `eval` changes propagate (NEW8).
- A script with a loop gets a second pass where every command sees every context
  of the first pass.
- An absolute step replaces earlier steps, so absolute `cd`s do not multiply.
  Past 64 contexts the push is marked `overflow` and the hook denies it (NEW10).
- `env -S` splits its string with env's quoting rules into arguments that env
  processes as its own options, repeatedly (NEW13). `env -u`/`--unset`/`-i` and
  `sudo` without `-E`/`--preserve-env` clear `GIT_DIR`; `doas` too (NEW14).
- Remaining disclosed limits: variables, `~`, `CDPATH`, `cd -`, functions,
  sourced files, earlier tool calls.
