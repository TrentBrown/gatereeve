# Spec - tb-review-progress-retention

**Feature:** `tb-review-progress-retention`
**Created:** 2026-11-27

## Summary

GitHub issue #147 (AC12 of the `tb-convergence-and-retirement` follow-up seed,
plus live progress). When this branch is complete:

- a human can watch each running reviewer;
- every launched review attempt keeps its exact prompt, instructions, input,
  output schema and provider event stream as content-addressed objects in the
  run store's `objects/` folder, referenced from that review's record;
- a finished review can be rebuilt from the run store alone;
- neither progress nor retained activity ever reaches a reviewer's input.

The controlling design is `design.md`; the decisions are in `interview.md`
(D1-D10).

## Definition of Done

The global Definition of Done in the software development workflow applies.
It is `resources/protocol/DEFINITION-OF-DONE.md` in the workflow plugin, and
boundary reviewers receive it with the review packet. Project-specific items:

- The desktop protocol projection (`apps/desktop/resources`) is regenerated
  from `plugin-src` and its check passes.
- `PROTOCOL.md` and the user-facing CLI help describe the `activity` record
  field, `read activity`, `review.progress` and `gatereeve review watch`.

## Failure model

Handled conditions:
- Reviewers launched through the Codex (`codex exec --json`) and Claude Code
  (`--output-format stream-json --verbose`) adapters, for boundary reviews
  (`review.execute`), individual reviews (`gate.execute`, including repair and
  delta attempts) and planning reviews (`planning.review`).
- A review attempt that ends after launch in any of these ways: success, a
  verdict the contract rejects, malformed output, a provider failure (non-zero
  exit or signal), a timeout, or the output limit.
- Provider output up to 64 MiB per attempt (stdout and stderr together).
- Stdout chunks that split a JSON line, and lines that are not JSON or are
  event types GateReeve does not know.
- Up to 2 reviewers running at once in one feature home (a paired round), and
  a watcher reading their progress files while they are written.
- A run store holding records written before this change, without
  `activity`.

Outside the model, GateReeve detects and refuses with a clear error, never a
silent best effort:
- A retained activity object that is missing or fails its integrity check:
  `read activity` and `reconstructReview` fail naming the object, and never
  return partial data as a reconstruction.
- A record with no `activity` field: `read activity` reports that the record
  has no retained activity.
- `review watch --job <id>` for an ID that is neither a review job in the run
  journal nor a progress file: reports that no review attempt has that ID.
- A progress write failure (for example a full disk): the review continues
  and stops writing progress for that attempt. A review job the run journal
  records as started is still listed: without a progress file it is
  `starting` until the journal has its outcome, then `progress unavailable`;
  with a file but no trailer it shows the last recorded activity until the
  journal has its outcome, then `progress unavailable`. A planning review
  (which has no job in the journal) whose header write failed is not listed.
  Retention never depends on the progress file.
- Output beyond 64 MiB: the reviewer is terminated and the attempt is
  UNAVAILABLE as today, with the output captured up to the limit retained.

## Acceptance Criteria

- **AC1.** Claude Code reviewers run with `--output-format stream-json
  --verbose` together with the existing `--json-schema`. The verdict, context
  ID, token usage and cost come from the stream's final `type: result` event.
  A stream without such an event is reported as malformed output. All other
  reviewer launch arguments, the sandbox and the `validate_verdict`
  self-validation tool are unchanged.
- **AC2.** While a reviewer runs, its stdout is appended as it arrives to
  `.gatereeve-current/progress/<jobId>.<provider>.jsonl` in the feature home
  (a planning review uses its operation ID as the job), after a `gatereeve.progress/1` header line naming the job, provider, model,
  stage and start time. A trailer line with the final state and outcome is
  appended when the attempt ends, starting on its own line: when the
  captured stdout does not end with a newline, one newline is written before
  the trailer. At each review launch, progress files whose
  trailer is older than 24 hours are removed, and files without a trailer are
  kept.
- **AC3.** Every launched review attempt (each of the handled kinds and
  endings in the failure model) records an `activity` reference on its review
  record (`kind: result` or `kind: planning-review`). The reference points to a
  `review-activity/1` JSON object in `objects/`. That object references, as
  content-addressed objects in `objects/`: the exact prompt text written to the
  provider's standard input, the instructions, the input packet, the output
  schema and the raw stdout event stream. The object also records the
  provider, the stage, and the byte counts of the prompt and the stream. The
  retained bytes come from the
  captured stdout and the adapter-reported prompt, never from the progress
  file. An attempt refused before launch records no activity.
- **AC4.** A finished review can be rebuilt from the run store alone.
  `reconstructReview` (and `gatereeve read activity <record-hash>`) returns the
  retained prompt, instructions, input, schema, output and stream, plus
  `events` (the stream's lines that parse as JSON, in order) and `unparsed`
  (every other non-empty line, with its line number, including a final line
  without a newline), after checking each object's integrity and the receipt's instruction, input
  and output digests. It works with the progress file and the reviewer view
  deleted. A missing or corrupt object or a missing `activity` fails as the
  failure model states.
- **AC5.** Independence: neither a progress file nor a `review-activity`
  object or its referenced objects appears in a reviewer's sealed view or
  packet. This holds for history and consumed evidence of earlier or peer
  reviews too. Activity is referenced only from the `activity` field, never
  from `artifacts`.
- **AC6.** `review.progress` (read-only; `gatereeve review watch`, with
  `--job`, `--follow` and `--json`) lists one line per review attempt. An
  attempt is a review job the run journal records as started (boundary and
  individual reviews) or a progress file (planning reviews use their operation
  ID). Without `--job` it lists every attempt that has not reached a final
  state; when there is none, the newest launch: the attempts started within
  60 seconds of the newest attempt's start time, so both reviewers of a pair
  are shown. With `--job <id>` it lists that one attempt. Each line gives
  provider, model, elapsed time, files read (Claude: distinct `Read` paths; Codex: commands run), the
  current activity (last tool call, at most 120 characters), tokens so far when
  the stream reports them, and one state: `starting`, `running`,
  `self-validating`, `finished, validating`, `done: <outcome>` or `progress
  unavailable` (failure model). `--follow` redraws every 2
  seconds (within 0.5 seconds) and exits once every listed reviewer is in a
  final state (`done: <outcome>` or `progress unavailable`). A final line
  without a newline is an incomplete write: it is ignored until it is
  complete. A complete line that is not JSON, or is an unknown event, is
  counted and leaves the activity and state unchanged. The
  operation writes nothing.
- **AC7.** The provider output limit is 64 MiB per attempt. An attempt that
  exceeds it is terminated and reported UNAVAILABLE, with its output up to the
  limit retained per AC3.
- **AC8.** Records written before this change (no `activity`) still read,
  qualify and count exactly as before. The review contract version, evaluator
  rules and verdict validation are unchanged.
- **AC9.** Run folders are never committed (amendment A1). The per-run
  `.gatereeve-current/.gitignore` that `run.start` and `run.resume-current`
  write ignores everything in the folder except that file (`/*` and
  `!/.gitignore`). An existing one that lacks those 2 lines gets them appended
  on start or resume, keeping its other lines. This repository's root
  `.gitignore` ignores every `.gatereeve-current/` entry except its
  `.gitignore`. Every committed file under `docs/issues/*/.gatereeve-current/`
  on the base, including the committed `runner-comparison.key`, is removed from
  the tree in this PR, without rewriting history.

## Rubric

A row that can only be checked after merge (release, deployment or live
acceptance) starts its criterion with `After merge:`. Boundary reviews leave
such rows out.

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | AC1 Claude stream-json | Adapter args contain `stream-json` and `--verbose` with `--json-schema`; the envelope comes from the last result event; a stream without a result event is malformed; other args unchanged | Claude still uses `json`, the envelope is read from elsewhere, a missing result event passes, or other launch args or the self-validation tool changed | Adapter unit tests; recorded live check (interview D1) |
| R2 | AC2 progress log | Header, streamed stdout and trailer are written to the named file during the attempt; split chunks are kept intact; the trailer starts on its own line after stdout without a final newline; pruning removes every finished file older than 24 hours and keeps newer files and files without a trailer | Output is visible only after exit, file name or header differs, the trailer joins a stdout line, an eligible old file is kept, or a newer or trailer-less file is removed | Execution tests with a fake streaming provider |
| R3 | AC3 activity retention | Each handled attempt kind and ending (failure model) records `activity` with the 5 referenced objects in `objects/` and the provider, stage, prompt byte count and stream byte count; the bytes equal the sent prompt and captured stdout; no activity is recorded for a pre-launch refusal | A handled attempt lacks activity or one of its 4 metadata values, an object is outside `objects/`, the bytes differ from the sent or captured bytes, or retention reads the progress file | Execution and planning-review tests covering success, rejected verdict, malformed output, provider failure, timeout and the output limit, each asserting the review record's `activity` reference |
| R4 | AC4 reconstruction | With the progress file and view deleted, the reconstruction returns byte-identical prompt, instructions, input, schema, output and stream, plus `events` equal to the stream's JSON lines in order and `unparsed` equal to its other non-empty lines with line numbers (a test stream holds 1 non-JSON line and 1 unterminated final line), and the digest checks pass; the test also shows that the retained prompt equals the prompt built from the retained instructions, input and schema; a missing or corrupt object and a missing `activity` fail with a clear error | Reconstruction needs anything outside the database and `objects/`, returns a missing or different prompt, instructions, input, schema, output, stream, `events` or `unparsed` list, fails on a non-JSON line, or accepts a corrupt object | Reconstruction test; CLI `read activity` test |
| R5 | AC5 independence | Tests show a later round's view, evidence index and packet contain no progress file and no activity object of earlier or peer reviews (failure model: up to 2 reviewers); `artifacts` never holds activity | Progress or activity bytes reach a reviewer view or packet | Execution tests inspecting the sealed view and packet |
| R6 | AC6 watch | `review.progress` output has the listed fields and states for both providers (including `starting` and `progress unavailable` for a journal job with no file or no trailer); by default it lists the attempts not in a final state, or else the newest launch (attempts within 60 seconds of the newest start, both reviewers of a pair); `--job` lists the named attempt; a journal job whose header write failed is still listed; ignores an incomplete final line and counts non-JSON or unknown lines without changing state, bounds the activity text to 120 characters, reports a missing job clearly and writes nothing; the CLI `--follow` redraws every 2 seconds (within 0.5 seconds) and exits when all reviewers are done | Missing fields or states, a wrong or missing attempt selected (including a newer journal job hidden behind an older progress file), a write, an unbounded line, a different redraw interval, a partial line that changes state or errors, or `--follow` that does not exit once every reviewer is in a final state | Operation and CLI tests |
| R7 | AC7 output limit | The limit is 64 MiB; an over-limit attempt is UNAVAILABLE and its captured output is retained | A limit other than 64 MiB, or an over-limit attempt loses its output | Process-runner test |
| R9 | AC9 run folders not committed | A fresh start writes a `.gitignore` with `/*` and `!/.gitignore`; start or resume of a run whose `.gitignore` holds only `/workflow.sqlite*` appends both lines and keeps the old one; `git status` in a fixture shows nothing under `.gatereeve-current/` except `.gitignore`; the PR's tree has 0 files under `docs/issues/*/.gatereeve-current/` and history is not rewritten | The writer leaves objects, handoff, keys, progress or pending files untracked-but-visible, an existing `.gitignore` loses lines or is not upgraded, a committed run-folder file remains, or the base history changed | Adapter tests; `git ls-tree` of the PR head; the PR's commit list |
| R8 | AC8 compatibility | Existing review, history, qualification and metrics tests pass unchanged; a record without `activity` reads and qualifies as before; contract version and evaluator rules unchanged | Old records fail, qualify differently, or the contract version or rules changed | Full CLI and plugin suites in hosted CI |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.

- **A1 (2026-11-28, human: Trent).** Adds AC9 and R9: run folders are never
  committed, the committed `runner-comparison.key` and the other committed
  run-folder copies are removed without a history rewrite. Decided in reply to
  the run-data handoff: "Fold (a) into #147"; key: "Normal PR, no rewrite";
  commit policy: "Never commit; remove copies". Relocating the run store
  outside the worktree, harvester changes and a harvest-gated worktree sweep
  stay out of scope, as separate issues.
