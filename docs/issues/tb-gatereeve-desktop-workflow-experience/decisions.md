# Decisions - tb-gatereeve-desktop-workflow-experience

**Feature start:** 2026-08-29

Permanent record of decisions promoted from `scratchpad.md`.

---

## Use a fixture-first local Desktop iteration loop

**Confidence:** HIGH

**Blast Radius:** Desktop development workflow, visual fixture, focused tests,
and local Electron runtime checks

Keep the existing renderer-only visual fixture running locally as the primary
edit-render-inspect loop because it imports the production HTML, CSS, and
renderer modules in an ordinary browser and uses a deterministic preload mock;
it does not launch Electron. Use `linkedom` renderer tests as the still-faster
logic layer, and source-launched Electron only at integration checkpoints for
main-process, IPC, preferences, watcher, native-menu, and focus behavior. Stage
the protocol only when protocol sources change, prefer focused tests during
edits, and run the complete Desktop suite at coherent checkpoints. Do not run
packaging, DMG creation, release preparation, deployment, or publication during
implementation iteration.

**Triggered by:** The user authorized the plan on the condition that GateReeve
remain quick to bring up, modify, and render locally without a deployment cycle.

**Alternatives considered:**

- Package or install the application after each meaningful change - rejected
  because it adds release work to an ordinary source iteration loop.
- Relaunch the Electron main process for every renderer-only edit - rejected
  because the production-module visual fixture provides faster equivalent UI
  feedback.
- Add a new hot-reload dependency before beginning feature work - deferred
  because the existing fixture plus focused source launches provide the needed
  feedback without expanding dependencies.

**Promoted:** 2026-08-29. PR: https://github.com/TrentBrown/gatereeve/pull/27.

---

## Return settled coordinator state after refresh cleanup

**Confidence:** HIGH

**Blast Radius:** Desktop project add, activate, refresh, removal, and their IPC
results

Make `open`, `refresh`, and `activate` return state only after their `finally`
blocks have cleared `refreshing` and published the settled result. JavaScript
evaluates a return expression before executing `finally`, so returning from
inside `try` produced a stale direct result even though subscribers received a
subsequent correct publication. Keep generation-mismatch early returns because
those calls no longer own the current refresh flag.

**Triggered by:** Pinned PR #27 review found that successful and rejected
project operations could resolve to `refreshing: true` while the coordinator's
current state was already false.

**Alternatives considered:**

- Rely only on the follow-up state-change publication - rejected because IPC
  callers are entitled to a self-consistent direct result.
- Mutate a previously returned state object in `finally` - rejected because
  Desktop state is validated as an immutable snapshot boundary.

**Promoted:** 2026-08-29. PR: https://github.com/TrentBrown/gatereeve/pull/27.
