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

---

## Keep workspace state renderer-owned and layout IPC push-only

**Confidence:** HIGH

**Blast Radius:** Desktop renderer workspace store, preload bridge, application menu, and layout tests

Keep selected main view, hierarchy selections, open tabs, active tab, panel visibility, and panel width in a serializable in-memory renderer store keyed by canonical project path. The main process sends only allow-listed toggle-sidebar or toggle-inspector commands through a one-way layoutCommand channel; it does not read, persist, or mutate workspace detail. This keeps application-menu accelerators native while preserving the renderer as the owner of observational UI state and leaves later persistence possible without changing tab identity.

**Triggered by:** P4 requires independent per-project session state plus native application-menu shortcuts without expanding Desktop workflow authority.

**Alternatives considered:**
Persist workspace state in preferences now - rejected because relaunch restoration is explicitly deferred. Handle shortcuts only in renderer key events - rejected because the approved design also requires native application-menu commands. Add request-response IPC for layout state - rejected because the main process does not need that state or authority.

**Promoted:** 2026-08-29. PR: https://github.com/TrentBrown/gatereeve/pull/28.

---

## Invalidate artifact reads when hierarchy selection changes

**Confidence:** HIGH

**Blast Radius:** Desktop inspector artifact selection and rapid hierarchy navigation

Treat every artifact-opening hierarchy selection as a new inspector read generation:
invalidate the prior request sequence and clear its in-flight fingerprint before
rendering the newly active tab. Artifact fingerprints describe file freshness,
not selection identity; two fixture or canonical artifacts may legitimately have
the same or unavailable metadata. A prior read must therefore never suppress the
newly selected artifact solely because their fingerprints match.

**Triggered by:** The progressive-hierarchy renderer test selected an
artifactless virtual gate and then an HTML-backed gate while an earlier artifact
read was unresolved. The new tab opened, but the stale in-flight fingerprint
prevented its content from loading.

**Alternatives considered:**

- Include the artifact ID in the freshness fingerprint - rejected because the
  fingerprint is also used to decide whether the same selected artifact changed.
- Serialize all inspector selections behind the prior read - rejected because
  hierarchy navigation should remain immediate and stale reads are already
  generation-guarded.

**Promoted:** 2026-08-29. PR: https://github.com/TrentBrown/gatereeve/pull/29.

---

## Preserve inspector tab state while presenting one active artifact

**Confidence:** HIGH

**Blast Radius:** Desktop renderer workspace state, inspector presentation, and
artifact interaction tests

Keep the existing serializable, per-project tab collection and canonical tab
identity internally, but suppress the visible tab strip and present only the
active, most recently selected artifact. This implements the approved simpler
experience without discarding deduplication, close/reconciliation behavior, or
the state shape intended for later relaunch persistence. The interface-polish
work remains a sixth slice of the existing Desktop workflow-experience feature
because it refines the same hierarchy and inspector rather than introducing a
separate product capability.

**Triggered by:** The user approved the live interface-polish fixture after the
feature-final PR and explicitly asked to move all of those changes into the
underlying Electron code before release.

**Alternatives considered:**

- Delete the tab collection and replace it with one artifact field - rejected
  because it creates needless migration work when tabs are exposed again.
- Leave the tab strip visible but compress it - rejected because the approved
  simplification explicitly suppresses tabs for now.
- Start a separate feature - rejected because the changes revise the same
  approved hierarchy, shell, and inspector immediately before release.

**Promoted:** 2026-08-30. PR: 36.
