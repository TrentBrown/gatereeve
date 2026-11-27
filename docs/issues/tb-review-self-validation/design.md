# Design - tb-review-self-validation

**Status:** draft

GitHub issue #142 (PR 3 of the reviewer-pipeline sequence in tracking issue
#150), built on PR #152 (#140) and PR #158 (#141). Settled entries are in
`interview.md` (D1-D8), with the tally.

## Problem

Reviewer results still end UNAVAILABLE for reasons GateReeve can remove:

- A reviewer learns that its verdict breaks the contract only after it has
  answered. One repair turn follows; when that also fails, the verdict is
  lost.
- On a PASS, a missing disposition for a finding the *peer* raised rejects
  the whole verdict, although the verdict only says this reviewer did not
  assess it.
- Repair turns cost tokens and time that no record attributes to them.
- Packets are incomplete. Specs say "The global Definition of Done in the
  software development workflow applies", but no such document exists or
  reaches the reviewer, so careful reviewers return UNAVAILABLE every round.
  Rubric rows that are live or deployment acceptance checks can only be met
  after merge, and they force UNAVAILABLE at every boundary.

## Intent

Reviewers can check their verdict against GateReeve's own contract before
answering, without any new file, shell or network access. GateReeve records
`not-assessed` where that is all a verdict says, attributes every attempt's
tokens and duration, gives reviewers the documents a spec incorporates (or a
non-blocking note), and leaves after-merge rows out of boundary review.

## Chosen shape

1. **One verdict contract function (D2).** The per-verdict checks in
   `executeGatesPrepared` (`execution.js`) move into an exported
   `checkReviewOutput(output, context)`: envelope, unrequested gates,
   unknown-property strip, JSON schema, `validateVerdict`, coverage
   decisions, mandate checks, format repair and namespaced identities. It
   returns the verdicts exactly as the execution records them today. The
   execution calls it; behavior is unchanged.
2. **Self-validation tool (D1, D3).** A new stdio MCP server,
   `protocol/current/verdict-check-server.js`, exposes one tool,
   `validate_verdict` (annotated read-only, idempotent, closed world). It
   reads a context file once, answers `initialize`, `tools/list` and
   `tools/call`, and for each call runs `checkReviewOutput` on the supplied
   object and reports per gate: `valid`, the first error (field path text),
   the outcome it would record and the correction rules. It writes no file,
   opens no socket and spawns nothing. Input is bounded (4 MiB).
3. **Wiring.** An adapter that supports it declares `selfValidation: true`.
   For such an adapter, `independent()` writes `validation/context.json`
   into the reviewer view before it is sealed, sets
   `packet.selfValidation = { tool: 'validate_verdict' }`, and passes
   `request.selfValidation = { command, args }` (the running Node binary and
   the server path). The Claude adapter adds `--strict-mcp-config
   --mcp-config` with only this server, the tool in the agent's tool list and
   `--allowedTools mcp__gatereeve__validate_verdict`; the Codex adapter adds
   `-c mcp_servers.gatereeve.command/args`. Both receipts record
   `isolation.selfValidation: true|false` (optional field in the receipt
   validator). The evaluator instructions tell the reviewer to call the tool
   when `packet.selfValidation` is present, fix only what it reports, and
   return a verdict it accepts.
4. **`not-assessed` (D4).** In `checkVerdict`, on a PASS, a required ID with
   no disposition row whose finding provenance names a different provider than
   this reviewer's is given a GateReeve-authored disposition
   `{ id, status: 'not-assessed', evidence }` and recorded as
   `peer-not-assessed`. `not-assessed` is not a reviewer-selectable status
   (not in the schema enum) and closes nothing: ledgers, finding obligations
   and reconciliation ignore it, so the finding stays open. Own findings and
   stated rows keep the repair turn.
5. **Attempts (D7).** `executeBoundaryReviews` passes the attempt kind
   (`initial`, `transient-retry`, `repair`) through the review baseline; the
   execution receipt records `attempt` (an individual repair execution reads
   `repair` from its input). Each `BOUNDARY_REVIEWED` outcome row carries
   `attempts: [{ kind, status, results, tokens, durationMs }]`. The metrics
   projection adds `attempt`, `durationMs` and `tokens` to each review result
   observation (`fleet.js` allows the fields, numbers validated).
6. **Incorporated documents (D5).** A canonical Definition of Done,
   `protocol/DEFINITION-OF-DONE.md`, ships with the protocol (so the CLI and
   desktop mirrors carry it); the spec template, `WORKFLOW.md` and
   `STANDARDS.md` point to it. For a full-rigor review, a new
   `review-packet.js` reads the pinned `spec.md`: when it names the global
   Definition of Done, that file is captured; relative Markdown links to
   feature-home files not already in the packet are captured with
   `store.capture` (which refuses traversal, symlinks and oversize files).
   Captured references join the execution input (`incorporated`) and the
   reuse comparison; files are written to `incorporated/<name>` in the view;
   `packet.incorporated` lists documents and non-blocking notes. Bounds: 16
   documents, 256 KiB each. A note is not by itself a reason for
   UNAVAILABLE, but a selected criterion that cannot be judged without the
   missing document is failed with evidence naming it, so a missing required
   document never yields a PASS.
7. **After-merge criteria (D6).** `afterMergeCriteria(facts)` (new, in
   `review-packet.js`) returns rubric rows whose
   criterion text starts with `After merge:`. `sourceCandidate` refuses to
   select them and requires a FEATURE candidate to cover every other row; the
   packet carries `afterMergeCriteria`; the instructions tell reviewers not to
   score or report them. `planning.js` is unchanged.
8. **Docs.** `PROTOCOL.md` (self-validation, `not-assessed`, attempts,
   incorporated documents, after-merge rows), `commands/pr-review.md`
   guidance, spec template, and the desktop mirror restaged.
9. **Fixtures.** A reviewer fixture that starts the real server from
   `request.selfValidation`, gets an error for a broken verdict, corrects it
   and returns the accepted verdict; tool and execution parity; a paired
   round with a missing peer disposition; attempt records for a repair round;
   a spec referencing the Definition of Done producing a packet with it (and
   a note for an unresolvable link); after-merge rows left out.

## Alternatives considered

See interview D1 (shell command, rules file, GateReeve-only check), D4
(same-round peer resolution counts for this member), D5 (note only; every
link everywhere), D6 (rubric column; reviewer judgment; completion-time
assessment) and D7 (new metrics table).

## Constraints

- Contract stays `gatereeve/current/8`; retained results replay unchanged.
  The review rules fingerprint changes for new executions, as in PR #152 and
  PR #158.
- The reviewer sandbox is not widened: no new built-in tool, shell, network
  or write access; the server is GateReeve code that only reads its context.
- Do not edit `publication.js`, storage roots or `briefScope` (other threads).
- Edit `plugin-src/`; restage the tracked desktop mirror; never edit `dist/`.
- Public text names no local paths or other projects.

## Changes

- 2026-11-26: Item 6 states what a missing incorporated document means for
  a criterion that depends on it (design review round 1, high).

## Open risks

- Provider CLIs may change MCP flags. A failed server start is a provider
  failure of that attempt (retried and repaired as today), and adapters
  without the capability are unaffected. The flags were checked with the
  installed Claude Code and Codex CLIs.
- A reviewer may ignore the tool; GateReeve's own check and repair turn
  still apply, so nothing regresses.
- The context file holds the review's history and candidate paths; it sits
  in the same read-only view that already exposes them.
