# Interview - tb-code-health-step

**Feature start:** 2026-11-27
**Status:** concluded (2026-11-27)

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

Each entry: **Question** / **Answer** / **Answered by:** `human | agent` /
**Decision**. An `agent` entry (goal autonomy: the agent answered itself) also
records **Options:** and **Reversibility:**.

## Inputs

- Research handoff: `handoff.md` (this folder; uncommitted until Trent says so).
- Run: `tb-code-health-step-run-start-2`, rigor `full` (human-confirmed), autonomy `supervised`.

## Context: where today's quality gates sit (plugin rc.33)

- **While implementing:** the agent picks its own checks (test pyramid heuristic). Nothing is mandatory and nothing deterministic runs before review.
- **PR boundary, required obligations:** `context`, `verification` (runner receipts for focused tests of changed areas and affected suites, on local commits), `review` (two fresh cross-provider assessments each round; rounds 1–3 block non-low findings, 4–5 block only high findings and medium regressions, round 6 hands back), `packet`. After convergence: push once, then a `ci` Verification for the exact head.
- **Supplemental, on request (`gate.execute`):** `code`, `spec`, `judge`, `pattern`, `reconcile`, `triage`, `explanation`. Pattern review is optional; it evaluates `.pattern-review` rules with an LLM evaluator over deterministic triggers.
- **At acceptance handoff:** the HTML explainer, plus the opt-in **Mutineer advisory** (`repository.mutationAdvisory` in the workspace config). It runs only after acceptance evidence qualifies, is advisory, and is linked into the packet (`resources/protocol/current/final-handoff.js`). This is the closest precedent for an external-tool integration, but it runs too late for the agent to act on the findings.
- **Waivers:** a waiver needs a scoped human instruction and keeps the original FAIL/UNAVAILABLE outcome. A standing grant never waives a gate.

## Sandbox findings: Habit Hooks 1.5.0 (pip, Python 3.14, 2026-11-27)

- **Plugins are separate packages:** `habit-hooks-python`, `-typescript` and `-generic` (all 1.5.0). The core alone runs nothing, and `init` reports the missing plugins and tools. Doctor checks need to cover the plugins and their tools, not just `habit-hooks`.
- **Two-stage CLI:** `habit-sensors` emits JSON. It exited 0 even when it had findings. `habit-hooks` renders the coaching markdown and exits 1 on an enforced smell. Neither has a `--format` flag.
- **Finding shape:** `[{smell, language, issues:[{key, details:{file, line, column, message, source}}]}]`. Example: `oversized-function`, `ruff:PLR0915`, "Too many statements (74 > 50)". The key is the file path, so there is **no symbol identity**. Magnitude appears only in the message text.
- **Snooze identity is file-level:** keys come from `issue.key`, and `snooze-until-changed` lapses when the anchor file changes.
- **A missing tool doesn't crash the run:** it surfaces as an `incomplete-run` smell ("sensor 'deptry' needs the 'deptry' command…") unless that sensor is disabled in config. A parse error surfaces as a `parse-error` smell and hides other findings in that file.
- **Threshold mismatch:** the `oversized-function` guide says "over 12 lines", but the ruff rule that fired is PLR0915 at 50 statements. Coaching text and the actual thresholds can disagree.

## Spike: Habit Hooks and type-aware ESLint on a GateReeve clone (2026-11-27)

Run against a scratch clone of `origin/main` at a9ce8b78, with ESLint 10.16, TypeScript 6.0.3 and typescript-eslint, using a root `tsconfig` (`allowJs`, `checkJs`, `nodenext`) over `cli/`, `plugin-src/`, `apps/desktop/` and `ci/`. Nothing was installed in the real repo.

- **The typescript plugin skips `.js` by default.** It scans `**/*.ts` and `**/*.tsx` only, but its shipped ESLint config covers `.js`/`.mjs`/`.cjs`. Setting the project's `files` globs enables JS. A project ESLint config, if present, replaces the shipped one.
- **The shipped config isn't type-aware** (no `parserOptions.project`), and its thresholds are strict: `max-lines-per-function` 12, `max-params` 3, `complexity` 10, `max-depth` 4, `max-lines` 200.
- **Stock run over 406 files: 7.6 s.** Existing enforced findings:
  - source: oversized-function 1068, high-complexity 562, too-many-parameters 193, oversized-file 172, loose-equality 117, deep-nesting 93, unused-variable 45;
  - tests: oversized-function 808, oversized-file 110.
  - Suggested (advisory) non-essential-comment fired about 4000 times.
- **Type-aware `no-floating-promises` + `no-misused-promises`: 16.5 s, about 1.8 GB RSS.**
  - The 1069 initial hits were essentially all `node:test`'s `test()`, which returns a Promise. That's a false positive. `allowForKnownSafeCalls` cleared some of them, but about 210 `test(` calls still fired. The cause is unresolved, and no real floating Promise was seen in test code.
  - Source: **0 floating Promises** in `cli/` and `plugin-src/`, and 9 `no-misused-promises` hits in `apps/desktop` (async event handlers).
  - Three `.cjs` files failed to parse under the program (`apps/desktop/preload/index.cjs` and two scripts).
- **Inference coverage** over 131 non-test source files: 14,572 calls.
  - Of the 1,151 calls to directly resolvable `async` declarations, 1,150 are typed `Promise`. The miss was a recursive function whose type collapses to `any`.
  - 28% of all calls (4,020) are typed `any`, mostly through untyped injected objects like `core.store.*` and `core.runtime.*`. Those calls are invisible to the rule; 379 of them sit in statement position.
- **Cost per wrapper run:** base plus head is roughly 2 × (7.6 s + 16.5 s) ≈ 50 s uncached. Caching the base result by merge-base commit plus config hash would roughly halve that.

## Decisions

### D1 — Placement

**Question:** Where in the loop does the code-health step run: a Verification check, a supplemental gate like `pattern`, a handoff advisory like Mutineer, or a new required obligation?
**Answer:** Verification check.
**Answered by:** human
**Decision:** Habit Hooks, scoped to the integration-base merge-base diff, runs as a runner-receipt check inside each PR-boundary round's local Verification. Agents may also run it freely during slices. Reviewers consume the receipt like any other Verification evidence. Rejected: a supplemental gate (skippable, Böckeler's failure mode), a handoff advisory (too late to act on), and a new required obligation (changes the core contract).
**Follow-on:** Local Verification checks are agent-selected today; reviewers only flag missing receipts as evidence findings. D2 settles how this check becomes deterministic rather than prose-dependent.

### D2 — Enforcement

**Question:** When a repository opts in, how is the check enforced: the core requires a receipt, the core runs Habit Hooks itself (Mutineer-style), or reviewers enforce it?
**Answer:** Core requires receipt.
**Answered by:** human
**Decision:** Opt-in comes from workspace configuration (working name `repository.codeHealth`). When opted in, the core refuses a qualifying review round unless the round's consumed Verification carries a code-health receipt on the candidate tree. The agent still runs the check through the normal runner path; the core checks that the receipt exists. Rejected: core-invoked execution (larger build) and reviewer-only enforcement (depends on a model noticing).
**Open:** How the core recognizes a code-health receipt (a dedicated `purpose`/kind vs. command matching), and whether it validates the scope flag (`--branch <integration base>`) so the agent can't narrow the run. Under the existing CI-coverage rule, the receipt must also be covered by a CI required check or re-run in the final Verification (ties to the CI-backstop question).

### D3 — Block vs. advise

**Question:** What does Habit Hooks exit 1 (an enforced smell) do to the required receipt, given that `--branch` without a baseline also reports pre-existing smells in touched legacy files?
**Answer:** Pull regression in.
**Answered by:** human
**Decision:** The check fails only on enforced smells that are **new relative to the merge base**: run at base and at head, then compare. Pre-existing enforced smells and all suggested smells are retained as advisory output for the agent and reviewers. Exit 2 (tool failure) makes the receipt UNAVAILABLE. A FAIL blocks the round. A scoped human waiver can accept it, and the waiver keeps the original FAIL.
**Scope change:** This **un-defers handoff decision 3a (regression gating)** into the initial scope. Hotspot weighting (3b) stays deferred.
**Open:** What identifies a finding across base and head (smell + file + symbol? line numbers drift), and what counts as "worse" when an existing smell's magnitude grows (e.g. a function goes from 60 to 90 lines). This needs Habit Hooks' actual output format; verify in a sandbox before deciding.

### D4 — Regression identity

**Question:** Habit Hooks issues carry only the file, line, rule and message, with no symbol. What counts as "worse than the merge base"?
**Answer:** Count per file+rule.
**Answered by:** human
**Decision:** For each enforced `(file, smell, source rule)`, FAIL when the head's issue count exceeds the base's. Line numbers and message text are ignored. Rejected: magnitude parsing (brittle across tools and versions), symbol anchoring (needs a per-language resolver), and changed-hunk only (blames legacy smells).
**Accepted blind spots:** an existing smell that grows (74 → 120 statements) passes; a smell moved within a file can hide a new one; a renamed file counts as all-new unless rename detection maps it to its base path. Hotspot or magnitude work could address these later.

### D5 — Config tampering and snoozes

**Question:** Which config do the base and head runs use, and how do we stop an agent from loosening thresholds, disabling sensors or snoozing to pass? (The first proposal pinned `.habit-hooks/` to the merge base. Trent asked why, since it's inconvenient.)
**Answer:** Go with branch config plus human approval.
**Answered by:** human
**Decision:** Both the base and head runs use the **head's** config, which keeps D4's comparison fair. The check finds any change since the merge base to the governed paths: `.habit-hooks/**`, which includes `snooze.json`, plus the configured linter config paths. If any changed, the result is **UNAVAILABLE ("config changed")** until a scoped human approval is recorded for that exact change; it then applies in the same round. A snooze is a config change, so **a snooze needs human approval**. That settles the handoff's snooze-as-waiver question.
**Why not base pinning:** every legitimate change would land one PR late, the adoption PR would have no base config, and the real thresholds live in mixed-purpose files (`pyproject.toml`, ESLint config) that can't be cleanly pinned.
**Why not trusting reviewers:** that's exactly the loosening failure Böckeler observed.
**Accepted gap:** a config change made through a file outside the governed list goes undetected, so the list must be configurable per repository.
**Open:** whether the approval is bound to the config-file hashes, so a later edit voids it, and which `human.decide` kind records it.

### D6 — Where the verdict is computed

**Question:** Where does the base/head comparison, governed-config detection and verdict logic live: a GateReeve-owned wrapper, an upstream Habit Hooks feature, or inside the core?
**Answer:** GateReeve wrapper.
**Answered by:** human
**Decision:** A GateReeve-owned wrapper (working name `gatereeve code-health`, with a plugin-local adapter equivalent) does the following:
- runs `habit-sensors` at the merge base (in a temporary worktree) and at the head, both with the head's config;
- applies the D4 count comparison and the D5 governed-path detection;
- renders Habit Hooks coaching for new findings, with pre-existing ones listed as advisory;
- emits a Verification receipt with purpose `code-health`.

The agent runs it like any other check, during slices and in each round. The core accepts only a receipt from this wrapper whose recorded base equals the candidate's integration base and whose tree equals the candidate tree.
**Rejected:** upstreaming to Habit Hooks, which would tie our schedule to an outside maintainer (it could still be contributed later), and running it inside the core, where the agent would get coaching only at the round.

### D7 — CI backstop

**Question:** The CI-coverage rule requires every consumed local receipt to be covered before acceptance. Should the `code-health` receipt be covered by a local re-run in the final Verification, by a required CI job, or by either?
**Answer:** Local re-run.
**Answered by:** human
**Decision:** The final Verification re-runs the wrapper on the exact candidate head, which covers the receipt under the existing rule. Opted-in repositories add nothing to CI. Habit Hooks, its plugins and their tools need to be installed only where the agent runs.
**Consequence:** humans pushing outside GateReeve get no backstop. A repository can still add its own CI job; mapping that job through `ciCheck` is a possible follow-on, not initial scope.

### D8 — Opt-in and installation

**Question:** In an opted-in repository, what happens when Habit Hooks, a plugin or a sensor tool is missing, and what does `workflow-doctor` check?
**Answer:** UNAVAILABLE + doctor.
**Answered by:** human
**Decision:** The receipt is **UNAVAILABLE**, and the round blocks until the problem is fixed or a scoped human waiver is recorded, when:
- `habit-sensors`, an enabled plugin or an enabled sensor's tool is missing;
- either run (base or head) reports an `incomplete-run` or `parse-error` smell.

Disabling a sensor is a governed config change under D5. For opted-in repositories only, `workflow-doctor` checks the core, each enabled plugin and each enabled sensor's tool, resolving them the way Habit Hooks does (project `.venv/bin` and `node_modules/.bin`, then `PATH`). It works whichever install route was used. Nothing is auto-installed.
**Rejected:** degrading to advisory (a broken install would silently turn the gate off) and auto-install (it would change the environment without asking and widen the supply-chain surface).

### D9 — Relationship to pattern-review and pattern-learn

**Question:** Should the code-health check integrate with pattern-review or pattern-learn, and should retiring pattern-review be folded into this feature?
**Answer:** "I want to retire the pattern review feature at some point. Currently, it's disabled, I believe, but we might fold in its removal in this future work." After a follow-up: Separate feature.
**Answered by:** human
**Decision:** Code-health is **independent of pattern-review**: no integration and no shared code. Nothing in this design may depend on pattern-review continuing to exist. **Retiring pattern-review is a separate later feature with its own run.** It is recorded as intent, not scope.
**Correction recorded:** pattern-review isn't turned off today. It's an optional supplemental gate that runs only on request. It still ships about 10 skills and commands, `pattern_tool.py`, the core gate and this repo's `.pattern-review/`, referenced from about 70 files, and removing it is breaking for users with rules.
**Follow-on (unscheduled):** learning custom Habit Hooks smells and guides from repeated findings, which would replace pattern-learn's role.

### D10 — Which smells the first version checks

**Question:** Ship stock Habit Hooks plugins only, or also a GateReeve-maintained plugin for dropped errors and floating Promises?
**Answer:** Add dropped-error plugin.
**Answered by:** human
**Decision:** This feature includes a GateReeve-maintained Habit Hooks plugin that maps type-aware rules to new **enforced** smells, each with an agent-directed coaching guide:
- `floating-promise`, from typescript-eslint `no-floating-promises` and `no-misused-promises`;
- `dropped-error`, from Ruff `BLE001`/`S110`, or swallowed-exception promoted to enforced.

The plugin follows Habit Hooks' authoring spec (`docs/authoring-plugins.spec.md`, still to be read).
**Repo fact:** GateReeve is almost all plain JavaScript (375 `.js`, 31 `.mjs`, 14 `.ts`, 67 `.py`), with no root `tsconfig.json` and no ESLint config. Type-aware typescript-eslint rules need a TypeScript program, which for plain JS means a `tsconfig` with `allowJs`/`checkJs`. See D11.

### D11 — Dogfooding on GateReeve

**Question:** Should GateReeve itself adopt the check in this feature, in a separate run, or only after a spike?
**Answer:** Adopt in this feature.
**Answered by:** human
**Decision:** This feature opts GateReeve in as the proving ground. It adds:
- a minimal root `tsconfig.json` (`allowJs`, `checkJs`, `noEmit`);
- an ESLint flat config with typescript-eslint `projectService`;
- `.habit-hooks/` config;
- the workspace opt-in.

The D4 regression compare keeps existing findings advisory, so adoption doesn't require cleaning up legacy code.
**Risks to verify before or during the design (still unverified):**
- whether Habit Hooks' typescript plugin scans `.js`/`.mjs`;
- how many Promises `checkJs` actually types (untyped JS infers `any`, which isn't flagged);
- how long a type-aware run takes over about 420 JS files, twice per wrapper run (base and head).

### D12 — Rigor coverage

**Question:** Does the opted-in receipt requirement apply to light runs too?
**Answer:** Both rigors.
**Answered by:** human
**Decision:** Opt-in is per repository, not per rigor. An opted-in repository requires the `code-health` receipt in full and light runs alike.

### D13 — Per-edit PostToolUse hook

**Question:** Is a per-edit PostToolUse hook in the initial scope?
**Answer:** Out of scope.
**Answered by:** human
**Decision:** Not in the initial scope. Agents can already run the wrapper during slices (D6). It's recorded as a follow-on, to be revisited with the runtimes measured under D11.

### D14 — Test code

**Question:** (Raised by Trent during the spike.) The test code produces many failures, so should it be excluded?
**Answer:** "If you're finding a lot of failures across our test code, maybe we should simply exclude the test code."
**Answered by:** human
**Decision:** The initial scope excludes test code from the scan: the `files` globs exclude `**/test/**` and `**/*.test.*`. The spike backs this up. The test hits were almost all `node:test` false positives. Under D4, every new test callback over 12 lines would count as a new oversized-function and fail. Test code is also judged by the reviewers and by Mutineer.
**Consequence:** dropped errors and unused variables in tests go unchecked. The exclusion globs are governed config (D5), so widening them later needs Trent's approval.

### D15 — Starting thresholds

**Question:** Start with Habit Hooks' shipped limits (12 lines, 3 params, complexity 10, 200-line files), moderate limits, or lenient limits?
**Answer:** "Let's start with a moderate, as you recommend." Trent also asked whether GateReeve's own configuration or command-line options can set them (see D16).
**Answered by:** human
**Decision:** GateReeve starts with **moderate** limits:
- 40 lines per function;
- 5 parameters;
- complexity 15;
- 500-line files;
- nesting depth 4, unchanged.

Ruff's Python equivalents are set to match. Tightening happens later through approved config changes (D5). The coaching guides still describe Habit Hooks' stricter ideal (the "over 12 lines" text), so the coaching and the gate disagree. Whether to override the guide text is a design item.

### D16 — Where thresholds are configured

**Question:** Should GateReeve have its own threshold settings (workspace config and/or CLI flags), or do the tools own them?
**Answer:** Tools own it, GR shows it.
**Answered by:** human
**Decision:** Thresholds live only in the tools' own config: the project ESLint config, Ruff settings and `.habit-hooks/` overrides. That config is the single source of truth, and it's governed under D5.
- The wrapper reports the effective thresholds in its output and in the receipt, and doctor reports them too.
- A one-time `gatereeve code-health init --preset moderate` writes the starting tool config. The write is a governed change, so it needs Trent's approval.
- There are no GateReeve threshold settings and no per-run threshold flags.

**Rejected:** generating tool config from workspace config (it has to be mapped per tool and drifts from hand-written config), and per-run flags (an ungoverned way to loosen the gate).

### D17 — Opt-out instead of opt-in

**Question:** (Trent's change at the design gate) "I like the design, but let's make it opt-out instead of opt-in and see how that goes." Two follow-ups: (a) what does a repository that isn't set up get, and (b) who can opt out?
**Answer:** (a) Block, guide to init. (b) Human decision.
**Answered by:** human
**Decision:** This supersedes D2's opt-in trigger. The code-health receipt is **required by default** in every repository GateReeve runs in, in both rigors.
- **Not set up:** a repository with no Habit Hooks, no plugins or no `.habit-hooks/config.toml` gets **UNAVAILABLE**. The message names the two ways forward: `gatereeve code-health init --preset moderate`, or a human opt-out.
- **Rollout:** the requirement applies only to runs started after the upgrade, so runs already in progress aren't stopped mid-boundary.
- **Opt-out:** recorded only through a human-confirmed decision, either `human.decide` or `run.start`/`workspace.configure` with human `authority`. It's scoped to the repository and shown in `status` and in the PR's published review summary. A `codeHealth: false` flag alone in the local, git-excluded workspace config has no effect.
**Rationale:** an agent can edit the workspace config, so a plain flag would reopen the loosening hole that D5 closes.
**Open:** whether an opt-out persists across runs (a standing per-repository opt-out) or must be recorded per run. Run-scoped decisions don't carry between features today.

## Closing summary (2026-11-27)

**Solid:**
- Placement in the round's Verification (D1).
- A core-required receipt, on by default with a human-authorized opt-out (D2, superseded in part by D17).
- Fail only on enforced smells that are new relative to the merge base (D3), counted per file, smell and rule (D4).
- Head config, with any change to governed config needing human approval, snoozes included (D5).
- A GateReeve-owned wrapper computes the verdict (D6), with a local re-run as the CI coverage (D7).
- Missing pieces make the result UNAVAILABLE, plus doctor checks (D8).
- Independent of pattern-review (D9).
- A dropped-error/floating-promise plugin (D10); GateReeve dogfoods it (D11).
- Both rigors (D12); no per-edit hook (D13); tests excluded (D14); moderate limits (D15) owned by the tools' own config (D16).

**Shaky:**
- `floating-promise` value on GateReeve itself. Source showed 0 hits, 28% of calls are typed `any`, and the main risk (injected `core.*` objects) is invisible to the rule. The plugin may add more for typed repos than for GateReeve.
- Wrapper cost, about 50 s uncached per run, and the type-aware ESLint memory use (about 1.8 GB).
- Coaching text written for Habit Hooks' 12-line ideal while the gate enforces 40.

**Unresolved (design or spec level):**
- The approval kind and its binding to config hashes.
- The default governed paths.
- The receipt fields and how the core validates them.
- Mapping renamed files to their base paths.
- Base-result caching.
- The three `.cjs` parse failures.
- The `.habit-hooks/` override path for the ESLint config.
- The ~210 `test()` hits left after `allowForKnownSafeCalls` (moot under D14).

**Recorded follow-ons:**
- hotspot weighting;
- a per-edit hook;
- a CI-job `ciCheck` mapping;
- learning custom smells (pattern-learn successor);
- retiring pattern-review (a separate feature);
- upstreaming the base/head compare to Habit Hooks.

