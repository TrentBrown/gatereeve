# Design - tb-review-progress-retention

**Status:** draft

GitHub issue #147 (AC12 of the `tb-convergence-and-retirement` follow-up seed,
plus live progress). Interview: `interview.md` (D1-D10).

## Problem

A paired review round takes ten minutes or more, and nothing is visible while
it runs. Codex already streams JSON events, but `runAgentProcess` buffers them
and parses them only after the process exits. Claude prints a single envelope
at exit. Once a review finishes, GateReeve keeps only digests of what the
reviewer was given (instructions, input packet), plus the receipt and the
output. The prompt, input, schema and event stream are not retained, so a
finished review cannot be rebuilt or audited, and the eval telemetry harvester
(which uploads only the run database and `objects/`) has nothing to show.

## Intent

1. The human can watch each running reviewer: elapsed time, files read,
   current activity, tokens and state.
2. Every launched review attempt retains its instructions, input, schema and
   event stream as content-addressed objects in `objects/`, referenced from the
   review's record. Failed attempts are included.
3. A finished review can be rebuilt from the run store alone.
4. Progress and retained activity never enter any reviewer's input.

## Chosen shape

- **Claude** runs with `--output-format stream-json --verbose` (verified: the
  final `type: result` event carries `structured_output`, `session_id`, usage
  and cost, as the old envelope did). The envelope parser reads that last
  result event (D1).
- **Capture.** `runAgentProcess` gets an optional `onOutput(chunk)` hook,
  called for each stdout chunk as it arrives. The output cap rises from 16 MiB
  to 64 MiB, the run store's object limit (D8). An error after launch (timeout,
  output limit, provider failure, malformed output) carries the stdout captured
  so far, so it can be retained. Argv, sandbox, tools, environment and the
  `validate_verdict` launch are unchanged.
- **Progress log** (scratch, D2, D9). The execution layer writes
  `.gatereeve-current/progress/<jobId>.<provider>.jsonl` in the feature home.
  The file holds a `gatereeve.progress/1` header line, then the raw stdout
  chunks, then a trailer with the final state and outcome. When a review
  starts, finished files older than 24 hours are pruned. Nothing reads these
  files for proof.
- **Retention** (D3). A new module, `review-activity.js`, builds one
  `review-activity/1` JSON object per launched attempt. It references objects
  for the exact prompt text the adapter wrote to the provider's standard input
  (reported by the adapter through an `onPrompt` hook, not rebuilt), the
  instructions (text), the input packet (JSON), the output schema (JSON) and
  the event stream (raw stdout, JSON lines). It also carries the provider and
  the stage, and the byte counts of the prompt and the stream. The object is stored with `CurrentStore.put`/`putJson` and
  referenced from the review's record in a new `activity` field: `kind:
  result` (boundary and individual reviews, including repairs and deltas) and
  `kind: planning-review`. Tool-result bodies are retained raw (D6, human
  decision).
- **Reconstruction** (D4). `reconstructReview(store, recordRef)` reads the
  record and its activity from the store alone. It returns the retained prompt,
  instructions, input, schema, output and parsed events, after checking each
  object's integrity and the receipt's instruction, input and output digests.
  It does not depend on the current prompt-building code. The test also checks
  that the retained prompt equals the prompt built from the retained parts. It is
  exposed as `read` kind `activity` (`gatereeve read activity <hash>`).
- **Watch** (D7). A read-only operation, `review.progress`, summarizes the
  progress files of the latest review job, or of a named job. For each
  reviewer it gives provider, model, elapsed time, files read (Claude: distinct
  `Read` paths; Codex: commands run), the current activity (last tool call,
  truncated), tokens so far and a state: `running`, `self-validating`,
  `finished, validating` or `done: <outcome>`. The CLI surfaces it as
  `gatereeve review watch [--job <id>] [--follow] [--json]`.
- **Independence** (D5). Progress lives outside the sealed reviewer view.
  Activity is referenced from `activity`, never from `artifacts`, so
  `reviewerView` never copies it into a later reviewer's `evidence/`. Packet
  assembly never reads progress. Tests pin all three.

## Alternatives considered

- Keep Claude on `json` and capture activity another way: unnecessary, because
  stream-json keeps the structured result.
- The adapter writes the progress file: rejected. The adapter has no
  feature-home path, and its scratch environment stays isolated.
- Add activity objects to `artifacts`: rejected. They would be copied into
  later reviewers' evidence, which breaks independence.
- Strip or truncate tool-result bodies: rejected by the human (D6).
- Surface progress as a `status` field: rejected. `status` is computed from the
  journal and is heavy to poll.
- Keep the 16 MiB cap: rejected, because long Claude reviews could be ended
  for their own transcript.

## Constraints

- Retained bytes come from the captured stdout, never from the progress file.
- Reviewer launch, sandbox and the self-validation tool are unchanged.
- Additive record fields only. Records without `activity` remain valid, and
  the review contract version and evaluator rules do not change.
- The desktop's protocol projection is regenerated from `plugin-src`.
- Stay out of `round-policy.js`, `review-findings.js` and completion (#148).

## Open risks

- Event streams make `objects/` grow: roughly a few MiB per review, up to the
  64 MiB cap. They also put source text into the harvested objects, which the
  human accepted.
- A Codex reviewer's read-only sandbox can read the host filesystem, including
  the progress folder. This is unchanged and out of scope; the file names carry
  a job UUID that the packet does not contain.
- The live-view heuristics (files read, current activity) depend on the
  providers' event formats. Unknown events are counted but not interpreted,
  and they never affect proof.

## Changes

- **A1 (2026-11-28, human: Trent).** Run folders are never committed. The
  per-run `.gitignore` ignores everything but itself (existing ones are
  upgraded on start or resume), the root `.gitignore` covers this repository,
  and this PR removes the committed run-folder copies on the base, including a
  committed `runner-comparison.key`, without a history rewrite. Reason: once
  this feature lands, each review adds a raw event stream of several MiB to
  `objects/`, and an accidental commit would publish it. Relocating the run
  store outside the worktree, harvester changes and a harvest-gated worktree
  sweep are separate issues.
