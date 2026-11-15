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
