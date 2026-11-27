# Decisions - tb-review-self-validation

Permanent decision records promoted from `scratchpad.md` and `interview.md` at
PR boundaries. Goal autonomy: every agent entry below was decided on the
human's behalf and is listed on the PR for Trent to check, in the PR
description's "Decisions made for you" section (and in the published review
summary).

## DEC-1. Full rigor, goal autonomy

- **Answered by:** human
- **Decision:** Full rigor with goal autonomy (relayed from the coordinating
  thread). Planning decisions are `autonomous-evaluator` decisions citing
  independent planning reviews: design (Codex, round 2 PASS) and spec
  (Claude, round 2 PASS).
- **Source:** scratchpad S1.

## DEC-2. Self-validation is one read-only MCP tool

- **Answered by:** agent
- **Decision:** `validate_verdict`, served over stdio by GateReeve's own
  server process that the provider CLI starts. Claude gets it through
  `--strict-mcp-config --mcp-config` and one allowed tool name; Codex through
  `mcp_servers.gatereeve`. No built-in tool, shell, network or write access is
  added.
- **Alternatives:** a shell command (Codex only; would widen Claude's
  sandbox); a rules file (cannot execute the checks); GateReeve-only checks
  after the answer (already the repair turn).
- **Reversibility:** reversible; adapters without the capability are
  unchanged.
- **Source:** interview D1.

## DEC-3. One contract function for the tool and the execution

- **Answered by:** agent
- **Decision:** `checkReviewVerdicts` (and `checkReviewOutput` for the tool's
  report) is the single verdict contract; the execution records exactly what
  it returns. The tool reports the first error per gate, the recorded outcome
  and the correction rules.
- **Reversibility:** refactor only.
- **Source:** interview D2, D3.

## DEC-4. `not-assessed` only for a peer's finding with no row

- **Answered by:** agent
- **Decision:** On a PASS, a required (open or claimed) finding raised by the
  other provider of the selection, with no disposition row, gets a
  GateReeve-authored `not-assessed` disposition (`peer-not-assessed`). It
  closes nothing; the member stays unreconciled for it. Own findings, stated
  rows and unaffected-open findings keep the repair turn.
- **Alternatives:** count the raising peer's same-round resolution as
  reconciliation for this member (saves one re-review; left for a later
  change because it decides for the reviewer that the peer's assessment
  stands).
- **Reversibility:** one rule.
- **Source:** interview D4.

## DEC-5. Attempt records

- **Answered by:** agent
- **Decision:** Execution receipts record `attempt`; each paired outcome row
  lists `attempts` with kind, status, results, tokens and duration; the
  metrics projection adds `attempt`, `durationMs` and `tokens` to each review
  result observation (not to its finding or disposition rows).
- **Reversibility:** additive fields.
- **Source:** interview D7.

## DEC-6. Incorporated documents; a missing one fails the dependent criterion

- **Answered by:** agent
- **Decision:** A canonical `protocol/DEFINITION-OF-DONE.md` (new) is
  incorporated when the spec contains "global Definition of Done"; relative
  spec links to feature-home files are incorporated too, bounded (16
  documents, 256 KiB each; no hidden or workflow-record paths; no external
  fetch). Unincluded references are non-blocking notes, but a criterion that
  cannot be judged without the document fails (design review round 1).
- **Alternatives:** note only; every link in every document; any note
  blocking.
- **Reversibility:** reversible.
- **Source:** interview D5, scratchpad S2.

## DEC-7. After-merge rows by an `After merge:` marker

- **Answered by:** agent
- **Decision:** A rubric row whose criterion starts with `After merge:` is
  never selected; FEATURE candidates cover every other row; the packet lists
  such rows. The planning parser and its validation binding are unchanged.
  Completion does not assess these rows.
- **Alternatives:** a rubric column; reviewer judgment; a completion-time
  assessment.
- **Reversibility:** reversible; unmarked specs are unaffected.
- **Source:** interview D6.

## DEC-8. The server runs under Node's permission model

- **Answered by:** agent
- **Decision:** The launch is `node --permission --allow-fs-read=<protocol
  resources> --allow-fs-read=<context file> <server> <context>`: a write or
  spawn is refused at runtime. Electron's Node mode takes no permission
  flags; there the launch sets only `ELECTRON_RUN_AS_NODE` (the desktop does
  not run reviews).
- **Reversibility:** launch flags only.
- **Source:** scratchpad S3.

## DEC-9. `incorporated` is part of every full-rigor review input

- **Answered by:** agent
- **Decision:** Recorded even when empty and compared for reuse; results
  retained before this change are not reused after upgrade (the instructions
  changed as well).
- **Reversibility:** one comparison.
- **Source:** scratchpad S6.

## DEC-10. Real-provider smoke checks

- **Answered by:** agent
- **Decision:** Both provider CLIs were run once through GateReeve's adapters
  with the real launch; both reached the tool. Not committed (credentials and
  tokens).
- **Source:** scratchpad S4.

## DEC-11. Host-dependent tests left to CI

- **Answered by:** agent
- **Decision:** Local verification omits `scratch-cleanup.test.js` (host
  installer-root ownership, #159) and three hanging wrapper-signal tests of
  `local-agent-idle-inhibitor.test.js` (skipped by name); everything else,
  including `metrics-repair`, the rest of the idle-inhibitor file and the
  desktop suite, runs locally. Hosted CI runs all of them.
- **Source:** scratchpad S5.

## DEC-12. Mandate-assessment format repair left to #167

- **Answered by:** agent
- **Decision:** Not folded in; it changes the repair contract beyond this
  spec. Filed as #167.
- **Source:** scratchpad S7.
