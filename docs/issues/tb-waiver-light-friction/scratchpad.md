# Decision Scratchpad - tb-waiver-light-friction

**Feature start:** 2026-11-25

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

Each entry records **Answered by:** `human | agent`. Agent entries also record
their alternatives and **Reversibility:**; goal runs publish them on the PR.

## S1 - "standard" rigor maps to full

The coordinator relayed "standard rigor" for #145. GateReeve rigor is
`full | light`; standard is the non-light choice, so the run started at full
(the default) under supervision.
**Answered by:** agent
**Options:** light (contradicts "standard"); full.
**Reversibility:** rigor can only rise within a run.

## S2 - Round 1 review fixes

Round 1 (codex gpt-6-sol, claude-code claude-opus-5-5) found: the findings-log
carry-forward reused the whitespace-normalizing `briefScope`, so re-indenting a
scope list kept authority (high); a PASS with `waivedCoverage` still counted as
an all-PASS gate for delegated/standing authority (medium); the PR explainer did
not show waived residuals (low). Fixed: carry-forward compares the brief outside
the findings log exactly (`briefScope(..., { exact: true })`; the delegated
hand-back comparison is unchanged); `allowedRunOutcome` rejects a PASS with
`waivedCoverage`; the explainer lists the waived residuals.
**Answered by:** agent
**Options:** normalize less (still lossy) vs exact bytes (conservative).
**Reversibility:** high.
