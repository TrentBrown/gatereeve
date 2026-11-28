# Spec - tb-code-health-step

**Feature:** `tb-code-health-step`
**Created:** 2026-11-27

## Summary

When this branch is complete, GateReeve requires a deterministic code-health check at every PR-boundary review round. It's on by default and only a human can opt a run out. The check is computed by a GateReeve-owned wrapper over Habit Hooks:

- It fails only when the branch adds enforced smells relative to the merge base.
- Inline suppressions have no effect.
- It's UNAVAILABLE while governed config changed without human approval, and when the tooling is missing.
- It gives agent-directed coaching.

A one-time `init` writes moderate-threshold config, including a vendored GateReeve plugin that enforces floating-Promise and swallowed-exception rules. Doctor reports readiness. GateReeve itself is set up and passes its own check.

Controlling inputs: `design.md` (approved, with `## Changes` C1) and `interview.md` (D1–D17).

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1. Regression verdict.** Run on a repository with Habit Hooks configured, `gatereeve code-health --base <ref>` (and the plugin-local `node <plugin-root>/resources/code-health/cli.js --base <ref>`) does the following:
  - Scope: it resolves the merge base, takes the changed non-test files that match the configured globs, and maps renamed files to their base paths.
  - Base run: it runs `habit-sensors` on that set at the merge base, using the head's governed files.
  - Head run: it runs the same set at the head.
  - Both runs happen in temporary worktrees, with every ESLint and Ruff inline suppression directive in the scoped files neutralized, so suppressions affect neither side. The user's checkout is never modified.
  - It reports **PASS** when no enforced `(file, smell, source rule)` group has more issues at the head than at the base.
  - It reports **FAIL** otherwise. A FAIL lists each new finding with its Habit Hooks coaching, then lists pre-existing enforced findings and suggested findings as advisory.
  - Exit status: 0 for PASS, 1 for FAIL, 2 for UNAVAILABLE.
  - With `--json`, it writes a result record with these fields:
    - the verdict;
    - the base ref and merge-base commit;
    - the head commit and tree;
    - the governed-path hashes;
    - the governed-change subject, and the approval subject that matched it (or `null` when nothing governed changed);
    - counts per smell (new, pre-existing, advisory);
    - the effective thresholds;
    - the tool versions.
- **AC2. UNAVAILABLE conditions.** The wrapper reports **UNAVAILABLE** with a message naming the cause and the way forward when any of these holds:
  - **Not set up:** there's no `.habit-hooks/config.toml`. The message names `gatereeve code-health init --preset moderate` and the human opt-out.
  - **Missing tooling:** `habit-sensors` is missing, or a configured plugin or an enabled sensor's tool is missing.
  - **GateReeve plugin not configured:** `.habit-hooks/config.toml` doesn't enable the `gatereeve` plugin, the vendored `.habit-hooks/gatereeve/` plugin is absent, or the config doesn't declare the GateReeve smells (`@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises`, `swallowed-exception`) as `enforced`.
  - **Every setup or tooling message** (not set up, missing tooling, GateReeve plugin not configured) names both `init` and the human opt-out as ways forward.
  - **Incomplete run:** either run reports an `incomplete-run` or `parse-error` smell, or `habit-sensors` crashes, times out, exits with a status other than 0, or emits output that isn't the expected JSON array.
  - **Unapproved change:** a governed path differs between the merge base and the head, and none of the supplied `--approved` subjects equals the current governed-change subject. Stale approvals for earlier changes are ignored, not treated as errors. The message lists the changed paths, the approval subject hash and the approval command.
- **AC3. Core enforcement.** In a run started under this version, a PR-boundary review round doesn't qualify unless its consumed Verification contains a PASS `code-health` receipt for the candidate tree.
  - **The core builds the command.** When a Verification check declares `purpose: "code-health"`, the core runs the wrapper itself, passing the candidate's integration target as the base, and ignores agent-supplied arguments.
  - **FAIL or UNAVAILABLE** leaves the round non-qualifying, with a reason naming `code-health`.
  - **Waiver:** a scoped human `waive` of the `code-health` requirement lets the round qualify, and the original outcome is kept.
  - **Earlier runs:** runs started before this version, with no code-health policy marker recorded at `run.start`, aren't subject to the requirement.
  - **Opted-out runs** aren't subject to it either (AC4).
- **AC4. Human decisions.**
  - **Config approval:** `human.decide` kind `approve-code-health-config` is accepted only with `human-confirmed` authority. Its subject is the governed-change subject the wrapper reports. Once recorded, the next wrapper run on the same change counts it, and any later change to a governed path invalidates it.
  - **Opt-out:** `human.decide` kind `opt-out-code-health` (or a `codeHealth: {optOut: true}` choice with human `authority` at `run.start`) removes the AC3 requirement for that run. It's accepted only with `human-confirmed` authority; an agent or `autonomous-evaluator` authority is refused.
  - **Workspace flag:** an opt-out flag in `.agentic-workflow.json` alone has no effect.
  - **No workspace settings:** the workspace config carries no code-health settings. Scope comes from `.habit-hooks/config.toml` `files`, and extra governed paths from `.habit-hooks/gatereeve.json`. Both are governed paths, so narrowing either is UNAVAILABLE until approved (AC2).
  - **Visibility:** an opted-out run shows the opt-out in `status` and in the published PR review summary.
- **AC5. CI coverage.** The acceptance milestone treats a converged review's consumed `code-health` receipt as covered by a passing `code-health` receipt on the identical tree in the final Verification. A repository needs no CI job for it, and an uncovered `code-health` receipt fails CI qualification by name. A round whose `code-health` requirement was waived (AC3) has its code-health coverage excused by that same waiver, through the existing waived-coverage path.
- **AC6. Init.** `gatereeve code-health init --preset moderate` writes the starting config without overwriting existing files:
  - `.habit-hooks/config.toml`: JS/TS/Python globs, test-code exclusions (`**/test/**`, `**/*.test.*`), the `typescript`, `python`, `generic` and `gatereeve` plugins, and the GateReeve smell severities and guides;
  - the vendored GateReeve plugin under `.habit-hooks/gatereeve/`, with guides and the Ruff `S110` sensor;
  - an ESLint flat config with moderate limits (40-line functions, 5 parameters, complexity 15, depth 4, 500-line files) and typescript-eslint `no-floating-promises`/`no-misused-promises`, allowing `node:test` calls;
  - the matching Ruff limits;
  - a `tsconfig.json` with `allowJs`, `checkJs` and `noEmit`, so type-aware rules have a TypeScript program, written only when no `tsconfig.json` exists. Its `include` covers every extension the scan globs cover (`.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`). The three `.cjs` parse failures in the spike were "not found by the project service" because the spike tsconfig omitted `.cjs`. With `.cjs` included they parse cleanly (verified 2026-11-27 on `apps/desktop/preload/index.cjs` and both `apps/desktop/scripts/*-smoke.cjs`).

  It prints the files written, the devDependencies still to install, and the governed-change approval the change needs. A file that already exists is reported and left untouched.
- **AC7. Doctor.** For a repository not opted out, `workflow-doctor --repository <path>` checks:
  - `habit-sensors`;
  - every plugin configured in `.habit-hooks/config.toml`;
  - the GateReeve plugin;
  - every enabled sensor tool, resolved from the project's `.venv/bin` and `node_modules/.bin`, then `PATH`.

  It reports `fail` naming the missing piece and its install command, reports the effective thresholds as `info`, and installs nothing. A repository without `.habit-hooks/config.toml` gets a `fail` naming `init` or opt-out.
- **AC8. GateReeve dogfood.** The GateReeve repository contains the AC6 config, adapted to its layout (JS globs over `cli/`, `plugin-src/`, `apps/desktop/` and `ci/`; tests excluded). It also has a root `tsconfig.json` and devDependencies for the tools. The wrapper run on this feature's integration diff against `main` reports **PASS**, and that PASS receipt is part of the final acceptance Verification.

- **AC9. Rollout guidance.** `USER-GUIDE.md` has a code-health section that covers:
  - that the check is on by default for runs started after the upgrade;
  - the setup path: `init`, the devDependencies, the tools, and the approval for the new config;
  - the human opt-out and how to record it;
  - the rollout measure Trent uses to judge "see how it goes". It's defined as three counts from existing records: per-run `opt-out-code-health` decisions, `approve-code-health-config` decisions, and `code-health` Verification receipt outcomes and durations in run journals. The section shows how to read each with existing commands.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Regression compare (AC1) | Automated tests with a fake `habit-sensors` show: PASS when counts are equal or lower; FAIL when one `(file, smell, rule)` group increases; pre-existing and suggested findings advisory; line and message changes ignored | Any case gives the wrong verdict or the wrong advisory split | `node --test` output for the code-health suite |
| R2 | Scope, renames, base overlay, suppressions and cache (AC1) | Tests show: the merge-base diff scope excludes test globs; a renamed file is compared against its base path; the base run sees the head's governed files; both runs get the same scoped file set as explicit lists (head paths at the head, rename-mapped base paths at the base); added, moved or deleted suppression directives (including a removed `eslint-enable`) don't hide a new finding; the checkout is untouched; a cached baseline is reused only for an identical scoped file set | Any file is mis-scoped, a rename is counted as all-new, the base run uses the base's config, a suppression hides a finding, the checkout changes, or a baseline is reused across different scopes | `node --test` output |
| R3 | Output and exit contract (AC1) | Tests show exit codes 0/1/2, a `--json` record with every listed field (including the matched approval subject), and coaching text for new findings before the advisory list | Any field is missing, an exit code is wrong, or the ordering is wrong | `node --test` output |
| R4 | UNAVAILABLE causes (AC2) | Tests cover each cause (no config; missing sensors, plugin or tool; `incomplete-run`; `parse-error`; a sensor crash, non-zero exit or invalid JSON; GateReeve plugin missing or its smells not enforced; governed path changed with no matching approval), each giving UNAVAILABLE with the specified message content. A further test shows a stale approval alongside the current one doesn't block | Any cause passes or fails instead of being UNAVAILABLE, omits its way forward, or a stale approval blocks a current one | `node --test` output |
| R5 | Core requirement and core-built command (AC3) | Core tests show: a round without a PASS `code-health` receipt is non-qualifying under a policy-marked run; a FAIL or UNAVAILABLE receipt is non-qualifying with a reason naming `code-health`; the core builds the wrapper argv with the integration target and ignores agent args; a waiver qualifies while keeping the outcome; an unmarked (earlier) run is unaffected | Any case behaves otherwise | `node --test` output (`cli/test`) |
| R6 | Config approval decision (AC4) | Tests show `approve-code-health-config` is accepted with human-confirmed authority for the reported subject, makes the wrapper PASS the governed-change check, is invalidated by a later governed edit, and is refused for agent or autonomous authority | Any case behaves otherwise | `node --test` output |
| R7 | Opt-out and settings location (AC4) | Tests show a human-confirmed opt-out removes the requirement and appears in `status` and in the published summary; an agent or autonomous opt-out is refused; a workspace flag alone has no effect; narrowing `files` globs or `.habit-hooks/gatereeve.json` makes the wrapper UNAVAILABLE until approved | Any case behaves otherwise | `node --test` output |
| R8 | CI coverage (AC5) | A CI-qualification test shows a consumed `code-health` receipt covered by a final same-tree receipt, and an uncovered one named in the failure | Coverage fails or is silently skipped | `node --test` output |
| R9 | Init (AC6) | Tests show the files written on an empty repository (including `tsconfig.json`), nothing overwritten on a re-run, the moderate limits present, and the follow-up message. A real tool run (Habit Hooks 1.5.0, ESLint with typescript-eslint, Ruff) over a fixture initialized by `init` (including a `.cjs` file that parses without a `parse-error` smell) reports each of a floating Promise, a misused Promise, a `BLE001` blind except and an `S110` try/except/pass as an **enforced** finding, and doesn't report a `node:test` `test()` call | Any file is missing or overwritten, a limit is wrong, the follow-up message is missing, `habit-sensors` rejects the vendored plugin, or any of the four fixture cases is missed, isn't enforced, or the `node:test` call is reported | `node --test` output, plus one real `habit-sensors` run against the init output |
| R10 | Doctor (AC7) | Python tests with injected lookups show pass/fail/info per piece, missing config giving `fail`, an opted-out repository skipped, and no install performed | Any case behaves otherwise | `python3 -m unittest` output |
| R11 | Dogfood (AC8) | The real wrapper on GateReeve (Habit Hooks 1.5.0 installed locally) reports PASS, and that PASS receipt is in the acceptance Verification | Any verdict other than PASS, or no receipt in the acceptance Verification | Verification receipt and wrapper `--json` record |
| R12 | Docs, rollout notes and mirrors (AC9 and technical requirement) | `PROTOCOL.md`, the pr-boundary command, the workflow-doctor skill, CLI help, `CLI_FORMS`/metrics operation lists and parity tests are updated for the new check and decision kinds; the `USER-GUIDE.md` code-health section meets AC9; existing suites pass | Any mirror is stale, the AC9 section is missing or omits any listed item, or an existing suite fails | Diff review, plus `npm test --prefix cli` and Python suite output |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
