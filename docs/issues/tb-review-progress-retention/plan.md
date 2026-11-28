# Plan - tb-review-progress-retention

**Feature:** `tb-review-progress-retention`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-11-27

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

One slice, one PR that closes #147. Change the capture point first (process
runner and adapters), then retention in the execution layer and planning
reviews, then the readers (reconstruction, `read activity`, `review.progress`,
CLI). Each step has its own focused tests. Run the focused suites locally;
hosted Plugin CI is the broad check (see the local test quirks: the global git
hook, the idle-inhibitor and metrics-repair hangs on macOS). The desktop
projection is regenerated at the end.

## Steps

- **P1.** `runAgentProcess`: an `onOutput` hook for each stdout chunk; the
  limit becomes 64 MiB; an error after launch carries the captured stdout.
  **Advances:** R2, R7.
- **P2.** Adapters: Claude uses `stream-json --verbose`, and the envelope comes
  from the last `result` event. Both adapters report the exact stdin prompt
  through `onPrompt` and pass `onOutput` through. **Advances:** R1, R3.
- **P3.** `review-activity.js`: the progress writer (header, chunks, trailer,
  pruning), the `review-activity/1` builder that retains five objects, and
  `reconstructReview`. **Advances:** R2, R3, R4.
- **P4.** Execution layer (`independent`, result records) and planning
  reviews (`delegation.js`): write progress, retain activity on success and
  on every failure after launch, and add the `activity` field (never to
  `artifacts`). **Advances:** R3, R5, R8.
- **P5.** Readers: `read` kind `activity`; the `review.progress` operation
  (event summarizers for Claude and Codex); `gatereeve read activity` and
  `gatereeve review watch [--job] [--follow] [--json]`. **Advances:** R4, R6.
- **P6.** Independence tests: a later round's view, evidence index and packet
  contain no progress or activity bytes. **Advances:** R5.
- **P8.** Amendment A1: the per-run `.gitignore` writer (`/*`, `!/.gitignore`,
  upgrade on start or resume), the root `.gitignore`, and removal of the
  committed run-folder files on the base. **Advances:** R9.
- **P7.** Docs (`PROTOCOL.md`, user guide/CLI help), the desktop projection,
  and the plugin build and lint. **Advances:** R8.

## Verification

- Focused suites: `local-agent-adapters`, new `review-activity` tests,
  `current-boundary-review`, `plugin-adapter`, `review-packet`,
  `self-validation`, and the CLI command tests.
- Hosted Plugin CI on the exact head is the final Verification.
- **Final step:** Run full rubric evaluation and produce the completion report.
