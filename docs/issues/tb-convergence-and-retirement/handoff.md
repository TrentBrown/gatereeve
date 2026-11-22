# Handoff - tb-convergence-and-retirement

**Written:** 2026-11-22, by the Claude Code session that ran the design
interview on the Mac host (`~/Code/tb/gatereeve`).
**Read with:** `interview.md` (decisions D1–D19, with the evidence base) and
`design.md` (the synthesized design, **not yet approved**).

## Where the run stands

- **Repository:** `~/Code/tb/gatereeve` on the Mac. Branch
  `tb-convergence-and-retirement`, created from `origin/main` at `400e4a2`
  (rc.31).
  - No commits yet, and nothing has been pushed.
  - These three documents are untracked.
- **GateReeve run** `tb-convergence-and-retirement`: contract
  `gatereeve/current/8`, full rigor, supervised. The phase is **DESIGNING**.
  - `run.start` succeeded, with operationId
    `tb-convergence-and-retirement-start-1`.
  - The implementer recorded is the Mac session
    `7d929912-405c-4d42-8186-0f4acc1b5df9`. A new host or session will need
    `run.resume-current`, or a fresh `run.start` there.
- **The workflow database** is in the untracked
  `docs/issues/tb-convergence-and-retirement/.gatereeve-current/` on the Mac.
  It does not travel with these documents. On a different machine you'll
  probably start a fresh run and point it at these documents.
- **Local `.agentic-workflow.json`** (untracked and locally excluded), edited
  after `run.start` per D19:
  ```json
  {"schemaVersion":1,"featureId":"tb-convergence-and-retirement",
   "repositories":{"repository":{"path":".","remote":"origin",
     "integrationBranch":"tb-convergence-and-retirement","releaseBranch":"main",
     "keepPullRequestsClosed":false,
     "featureBaseSha":"400e4a29e0e19afd1f1d0b53709d4a6d74d03127"}}}
  ```
  The run's recorded `workspace` still shows the original integration =
  `main`. It may need `workspace.configure`, or a fresh start, to pick this
  up.
- **Plugin used:** `agentic-development-workflow` 0.1.0-rc.31
  (`~/.claude/plugins/cache/quality-code/agentic-development-workflow/0.1.0-rc.31/`).
  The adapter is `resources/protocol/plugin-adapter.js`.

## Next steps

1. Get the human's explicit approval of `design.md`. Two points were flagged
   for the human:
   - D7: round 6 hands back even in autonomous mode. This is an agent
     assumption.
   - D17: a swept worktree's review history is gone for good.
2. Record `human.decide` `approve-design` against the design hash, quoting
   the human's actual words.
3. Spec, validate, plan, issues, implementation authority, then the slices.
   - Slice 1 (`-01-review-convergence`): convergence policy and metrics.
   - Slice 2 (`-02-worktree-sweep`): the sweep command.
   - A final PR to `main` (per-PR `authorize-merge`).
   - The rc.32 release is a separate step afterwards.

## Code pointers found during the interview

Paths are in the source repo unless noted. The installed copies under the
plugin cache mirror `plugin-src/shared/resources/`.

- **Reviewer verdict schema and instructions:**
  `plugin-src/shared/resources/protocol/current/execution.js`.
  - Schema at about line 28 (`verdicts[]`, with
    `required: gate, outcome, summary, coverage, findings, dispositions, criteria, historyAssessment`).
  - Reviewer instructions at about line 110 ("do not stop at the first
    defect…").
  - `validateFormatRepair` at about line 66 already exists and preserves
    outcome, findings, evidence and mandate. Nothing triggers it
    automatically (D13).
  - A contract error becomes UNAVAILABLE at about line 727
    (`invalidVerdictContract`, `unvalidatedVerdict`).
  - Disposition rules at about lines 337–383, including "Missing supported
    disposition for <id>", which is the source of the peer-disposition
    rejections.
- **Planning review:**
  `plugin-src/shared/resources/protocol/current/delegation.js`.
  - Output schema at about line 107: `outcome`, `summary`, `findings`,
    `mandateAssessment`, with `additionalProperties:false`.
  - Its required-keys check is at line 159.
- **Schema error text** ("… is not allowed"): `protocol/current/json-schema.js`,
  about line 90.
- **"No fixed ratios or round cap":** `plugin-src/shared/resources/PROTOCOL.md`,
  about line 273. Completion obligations are at about line 257. D7 replaces
  this rule.
- **Existing cleanup command:** `cli/src/commands/cleanup.js` and
  `cli/src/storage.js`. These handle scratch, installers and metrics, never
  worktrees. The sweep (D18) is a new `gatereeve worktree sweep`.
- **Metrics:** `plugin-src/shared/resources/performance/` (`service.js`,
  `report.js`, `mcp.js`), `cli/src/performance.js` and
  `cli/src/commands/metrics.js`. The store is
  `~/.local/share/gatereeve/performance/metrics.sqlite`, capped at 100 MiB.
  - Its tables include `reporting_observations`, `reporting_workflows` and
    `records`.
  - Test pollution came from `gatereeve-current-surface-*` temp workspaces in
    the test suite.
  - Every adapter call currently prints "GateReeve metrics: capture
    incomplete; underlying work continues." on the Mac.
- **Goal mode:** it does not exist yet. The only match is unrelated wording
  in `cli/test/current-light.test.js:202`.

## Evidence detail not fully in interview.md

- **Analysis method.** The analysis was done on copies of the store, because
  the live database is in WAL use and `sqlite3` refused to open it in place.
  `metrics capture` against a copy failed with "Conflicting values for the
  same observation time" (D3).
- **Real data:** 17 workflows and 2,375 observations.
- **Review and verification job time by outcome:**

  | Job | Outcome | Time |
  |---|---|---|
  | Review | FAIL | 317 min |
  | Verification | PASS | 261 min |
  | Review | PASS | 60 min |
  | Verification | FAIL | 54 min |
  | Review | UNAVAILABLE | 53 min |
- **Finding-level sources:** the `objects/` review results in the
  `.gatereeve-current/` databases of fleet unified-host-access, fleet
  codex-sandbox and gatereeve-reviewer-bubblewrap, all under `~/Code/tb/` on
  the Mac.
  - Each finding has these fields: `id`, `classId`, `criterion`, `path`,
    `blocking`, `severity` (always absent) and `evidence`.
  - Receipts carry the evaluator provider and model, and tokens.
- **Paired reviewers seen:** Codex `gpt-6.2-sol` and Claude `sonnet`.
  - Claude's contract failures included
    `review.mandateAssessment is not allowed` (placed inside the per-gate
    verdict), missing dispositions for the peer's findings, malformed JSON
    and provider failures.
  - The human expects a switch to Opus 5.5 to help, and wants the GateReeve
    side hardened anyway.
- **Lost history.** The idle-shutdown and dashboard runs' `.gatereeve-current`
  databases were deleted during manual worktree cleanup (an agent mistake).
  Their committed docs remain in `~/Code/tb/fleet/docs/issues/`.

## Disk cleanup already done (context for slice 2)

- The Mac started at 96% used, with 39.1 GiB free.
- Removing 116 finished worktrees (`.worktrees` plus 86 "Tier 1" elsewhere)
  freed about 31 GiB and about 2.65M inodes. The disk ended at 93% used,
  70.2 GiB free and 14.02M inodes.
- Not removed, and waiting for the human's review:
  - 37 merged worktrees with leftover untracked files (about 897k files);
  - 6 detached worktrees with changes;
  - 33 with no PR. These include development branches with unpushed
    commits: `webservices-development-lambda-query` (8) and
    `admin-development-case-staff` (13). `careNav-help` is on `development`.
  - 5 with open PRs.

  These are exactly the cases the sweep's list and skip rules (D17, D18) are
  designed for.
- **Clone sharing.** On APFS, worktree `node_modules` share blocks through
  clones but not inodes: `du` overstated the freed space at 18.3 GiB against
  7.3 GiB actually freed. Inodes are the binding constraint.
- **pnpm.** pnpm's global virtual store was surveyed and rejected as too
  experimental. The human prefers aggressive worktree cleanup.

## Standing human rules that affect this work

- **Development branches** (`development`, `development-*`) are one-way
  integration sinks:
  - never merge or rebase them into another branch;
  - cherry-picks are fine;
  - before any merge or rebase, state the source and target, and stop to ask
    if the direction is ambiguous.
- **Confirm before** hard-to-reverse or outward-facing actions.
- **Remote web previews** go through Tailscale Serve, never public Funnel
  unless asked.
- **Pre-existing untracked folders** in the gatereeve repo (`docs/handoffs/`,
  `docs/issues/tb-release-rc30/`, `docs/proposals/`) belong to the human.
  Leave them alone.
