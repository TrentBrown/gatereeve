# Decision Scratchpad - tb-code-health-step

**Feature start:** 2026-11-27

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1 — Integration branch

- **Answered by:** agent (mandated autonomy, 2026-11-27)
- **Decision:** `integrationBranch: tb-code-health-step`, `releaseBranch: main`, `featureBaseSha: a9ce8b78…`. Slice PRs come from `tb-code-health-step-NN-<desc>` branches into `tb-code-health-step`. The final PR runs `tb-code-health-step` → `main` and needs Trent's per-PR merge instruction.
- **Alternatives:** integration equal to release (`main`), which would make every slice PR wait for a per-PR human merge.
- **Reversibility:** high; local workspace config only, set before the first slice.
- **Why:** this matches earlier features (`tb-convergence-and-retirement`, `tb-lightweight-mode`).

## S2 — Design refinements C1.1–C1.5

- **Answered by:** agent (mandated autonomy)
- **Decision:** see `design.md` `## Changes` C1. Covers the core-built command, neutralized suppressions (revised after planning review F1), a scope-keyed base cache (F2), rule-ID smell names with a vendored plugin, the base overlay with an explicit file list, and per-run opt-out.
- **Alternatives:** per item, in `design.md`.
- **Reversibility:** medium; these are mechanism choices and the intent is unchanged.

## S3 — `.cjs` parse failures resolved

- **Answered by:** agent (mandated autonomy)
- **Decision:** the spike's three `.cjs` parse errors came from the spike tsconfig not including `.cjs` ("not found by the project service"). Including `**/*.cjs` fixes them (re-run verified). The init tsconfig template covers `.js`, `.mjs`, `.cjs`, `.ts` and `.tsx`; recorded in spec AC6 and R9.
- **Alternatives:** excluding `.cjs` from the scan (loses coverage); `allowDefaultProject` globs (slower, and capped by typescript-eslint).
- **Reversibility:** high.
