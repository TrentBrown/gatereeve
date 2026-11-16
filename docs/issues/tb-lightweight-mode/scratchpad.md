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
