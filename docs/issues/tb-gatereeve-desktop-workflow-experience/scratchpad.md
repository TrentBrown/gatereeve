# Decision Scratchpad - tb-gatereeve-desktop-workflow-experience

**Feature start:** 2026-08-29

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Approved product and architecture decisions remain in `design.md`, with
supporting detail in `interview.md`.

## [1] Use a fixture-first local Desktop iteration loop

[ ] **Promote**

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
