# Spec - tb-review-self-validation

**Feature:** `tb-review-self-validation`
**Created:** 2026-11-26
**Issue:** #142 (tracking #150)
**Design:** [`design.md`](design.md), [`interview.md`](interview.md) D1-D8

## Summary

Reviewers can check their verdict against GateReeve's own contract from
inside their read-only sandbox before answering. A PASS that leaves a peer's
finding without a disposition records `not-assessed` instead of being
rejected. Every review attempt's tokens and duration are attributed. Packets
carry the documents a spec incorporates by reference (or a non-blocking
note), and rubric rows that can only be checked after merge are left out of
boundary review.

Out of scope: `review.publish` and `publication.js` (#155), storage roots
(#159), `briefScope` (#156/#157), metrics surfaces (#149), a completion-time
assessment of after-merge rows, and manual evidence a run must supply
(interview D8).

## Definition of Done

The global Definition of Done in the software development workflow applies.
This change adds that document as
`plugin-src/shared/resources/protocol/DEFINITION-OF-DONE.md`; reviewers of this
candidate read it from the source under review. In addition: the CLI test suite passes, and the desktop protocol mirror is
byte-identical to `plugin-src/shared/resources/protocol`.

## Acceptance Criteria

- **AC1. One verdict contract.** The review execution validates every
  returned verdict through one exported function. Given the same output and
  context, the self-validation tool and the execution accept the same
  verdicts and report the same first error message per gate. Apart from the
  peer-disposition rule of AC5, the checks and messages the execution applied
  before this change are unchanged.
- **AC2. Read-only self-validation tool.** GateReeve ships a stdio MCP server
  with exactly one tool, `validate_verdict`, annotated read-only, idempotent
  and closed-world. It answers `initialize`, `tools/list` and `tools/call`.
  For a call it reports, per requested gate: whether the verdict is valid,
  the first contract error with its field path, the outcome GateReeve would
  record and the correction rules it would record; an envelope error is
  reported once. Malformed or oversized input (over 4 MiB) and unknown
  methods return errors without ending the server. The server is launched
  under Node's permission model with read access only to GateReeve's
  protocol resources and its context file, and with no file-write,
  child-process or worker permission, so any write or spawn it attempted
  would be refused; it opens no network connection. Its only output is its
  JSON-RPC responses on standard output.
- **AC3. Offered without widening the sandbox.** For an adapter that
  declares the capability, GateReeve writes the tool's context into the
  reviewer view before it is sealed, adds `packet.selfValidation`, and gives
  the adapter the server command. The Claude Code adapter keeps
  `--restricted`, `--strict-mcp-config` and the built-in tool list
  `--tools Read,Glob,Grep` exactly; its `--mcp-config` names only GateReeve's
  server; `mcp__gatereeve__validate_verdict` is added to the stage agent's
  tools and to `--allowedTools`, and nothing else is added. The Codex adapter
  keeps `--sandbox read-only` and its other arguments and adds only the
  `mcp_servers.gatereeve` command and arguments. Both
  receipts record `isolation.selfValidation`. An adapter that does not
  declare the capability receives no context file, no `packet.selfValidation`
  and no server command, exactly as before.
- **AC4. A reviewer self-validates and corrects.** A reviewer that calls the
  tool with a contract-breaking verdict, corrects what the tool reports and
  returns the accepted verdict is recorded as a validated PASS or FAIL in one
  attempt, with no repair turn. The evaluator instructions tell reviewers to
  do so when `packet.selfValidation` is present.
- **AC5. `not-assessed` for a missing peer disposition.** On a PASS, an
  earlier finding that needs a disposition (open or claimed), was raised by
  the other provider of the reviewer selection (by its recorded finding
  provenance) and has no disposition row in the verdict is recorded with a
  GateReeve-authored `not-assessed` disposition and rule `peer-not-assessed`;
  the verdict is accepted. `not-assessed` closes nothing: the finding stays
  open for the ledger and stays unreconciled for this member. A reviewer's
  own earlier finding without a disposition, any stated row with an
  unsupported status, and an open finding carried as `unaffected` still reach
  the repair turn as before. Reviewers cannot select `not-assessed`.
- **AC6. Attempt tokens and duration.** Each review execution receipt
  records its attempt kind (`initial`, `transient-retry` or `repair`). Each
  `BOUNDARY_REVIEWED` outcome row lists its attempts in order with kind,
  status, results, token usage and duration. The metrics projection stores
  each review result's attempt kind, duration and token usage; unknown usage
  stays null.
- **AC7. Incorporated documents.** GateReeve ships one canonical Definition
  of Done with the protocol, and the spec template and workflow policy refer
  to it. It has two parts: what must hold at the boundary review (tests for
  new or changed behavior written and passing, the build and linters clean on
  changed files, every selected criterion backed by evidence, material
  decisions recorded, tracker and issues reconciled, no unrelated changes),
  and what is checked only after merge (release, deployment and live
  acceptance, completion records). A pinned `spec.md` incorporates it when it
  contains the phrase "global Definition of Done" (case-insensitive, any
  whitespace); for such a full-rigor review the reviewer view contains that
  document and `packet.incorporated` lists it. A relative Markdown link in `spec.md` to a
  regular file in the feature home that the packet does not already carry is
  included the same way. A link that cannot be included (missing, outside the
  feature home, not a regular file, over 256 KiB, or past 16 documents) is
  listed as a non-blocking note. Included documents are part of the execution
  input: a change to them prevents reuse of an earlier result. External links
  are never fetched. Reviewers are told a missing incorporated document is a
  note, not by itself a reason for UNAVAILABLE, and that a selected criterion
  that cannot be judged without it fails with evidence naming the document.
- **AC8. After-merge criteria.** A rubric row whose criterion text starts
  with `After merge:` is an after-merge criterion. `candidate.prepare`
  refuses to select it, and a FEATURE candidate must cover every rubric row
  that is not after-merge. The review packet lists after-merge rows in
  `afterMergeCriteria`, and reviewers are told not to score them or report
  them as coverage limits, findings or UNAVAILABLE. A spec without such rows
  behaves exactly as before, and spec validation is unchanged.
- **AC9. Documentation.** `PROTOCOL.md` documents the tool and its read-only
  scope, `not-assessed`, attempt records, incorporated documents and
  after-merge criteria. The spec template states the `After merge:` marker.
  `commands/pr-review.md` tells implementers that a peer finding a PASS leaves
  without a disposition is recorded `not-assessed` and stays open, and how to
  mark after-merge rows.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | One verdict contract (AC1) | Tests run the tool's check and the execution on the same valid and invalid verdicts and get the same acceptance and first error per gate; the existing review, normalization and repair test suites pass, with only tests that asserted the rejection AC5 replaces updated to AC5 | Any Pass condition is unmet or untested | `cli/test/self-validation.test.js`, `cli/test/verdict-normalization.test.js`, `cli/test/reviewer-contract.test.js` |
| R2 | Read-only self-validation tool (AC2) | Tests drive the real server over stdio: initialize, tools/list (one tool with the annotations), a valid call, an invalid call naming the field path and recorded outcome, an envelope error, malformed and oversized input and an unknown method, with the server still answering afterwards, all with the exact launch command GateReeve gives the adapter; that command carries the permission flags AC2 states and no write, child-process or worker allowance; a process started with those flags is refused a file write and a spawn; during the calls the server makes no network call (instrumented) | Any Pass condition is unmet or untested | `cli/test/self-validation.test.js` |
| R3 | Offered without widening the sandbox (AC3) | Adapter tests compare the full Claude and Codex argument lists with and without self-validation and show only the additions AC3 names, with `--restricted`, `--strict-mcp-config`, `--tools Read,Glob,Grep` and `--sandbox read-only` unchanged, and receipts recording `isolation.selfValidation`; an execution test shows the context file and `packet.selfValidation` exist only for a capable adapter | Any Pass condition is unmet or untested | `cli/test/local-agent-adapters.test.js`, `cli/test/self-validation.test.js` |
| R4 | A reviewer self-validates and corrects (AC4) | A paired-review fixture whose reviewer starts the server from the request, receives an error for its first verdict, corrects it and returns the accepted verdict is recorded `completed` with a validated outcome and a single attempt; the instructions contain the self-validation sentence | Any Pass condition is unmet or untested | `cli/test/self-validation.test.js` |
| R5 | `not-assessed` for a missing peer disposition (AC5) | Tests show a PASS without a disposition for a peer-raised open finding is accepted with the `not-assessed` row and rule, the finding stays open and the member unreconciled; the same omission for the reviewer's own finding, a wrong-status row and an unaffected open finding still reach repair; the schema enum excludes `not-assessed` | Any Pass condition is unmet or untested | `cli/test/self-validation.test.js`, `cli/test/current-boundary-review.test.js` |
| R6 | Attempt tokens and duration (AC6) | A paired round with a repair turn records receipts with `initial` and `repair`, and a round with a transient retry records `transient-retry`; each outcome row lists its attempts with tokens and duration; projected observations carry attempt, duration and tokens; null usage stays null | Any Pass condition is unmet or untested | `cli/test/current-boundary-review.test.js`, `cli/test/current-measurement.test.js` |
| R7 | Incorporated documents (AC7) | Tests show a spec containing the phrase (in a different case and line wrapping) yields a view and packet containing the Definition of Done, and a spec without it does not; a linked feature-home file is included; missing, outside, oversized and over-count links become notes; an external link is neither fetched nor included; a changed incorporated document prevents reuse; the evaluator instructions say a missing document is a note and that a criterion that cannot be judged without it fails; the document has the two parts AC7 lists; the template and policy refer to it | Any Pass condition is unmet or untested | `cli/test/review-packet.test.js`, `plugin-src/shared/resources/protocol/DEFINITION-OF-DONE.md` |
| R8 | After-merge criteria (AC8) | Tests show `candidate.prepare` refuses an after-merge row, a FEATURE candidate is accepted without it and refused when another row is missing, the packet lists it, and a spec without the marker prepares exactly as before; the evaluator instructions tell reviewers not to score after-merge rows or report them as limits, findings or UNAVAILABLE; `planning.js` is unchanged | Any Pass condition is unmet or untested | `cli/test/review-packet.test.js`, diff of `planning.js` |
| R9 | Documentation (AC9) | `PROTOCOL.md`, the spec template and `commands/pr-review.md` contain the stated content; the desktop mirror matches the source byte for byte | Any Pass condition is unmet | `plugin-src/shared/resources/PROTOCOL.md`, `plugin-src/shared/resources/templates/spec.md`, `plugin-src/shared/resources/commands/pr-review.md`, mirror diff |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
