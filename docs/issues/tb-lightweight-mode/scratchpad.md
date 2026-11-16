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
