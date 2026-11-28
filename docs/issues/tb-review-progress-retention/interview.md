# Interview - tb-review-progress-retention

**Feature start:** 2026-11-27
**Status:** concluded 2026-11-27

Short design step under supervised autonomy. The human agreed the scope of
GitHub issue #147 in the coordinating thread (tracking issue #150), and the
issue is the design input. Choices the issue, the binding constraints or the
code settle are recorded as `agent` entries with their alternatives and
reversibility. The human was asked only about the one choice that was
genuinely open (D6).

Each entry: **Question** / **Answer** / **Answered by:** `human | agent` /
**Decision**, plus **Options** and **Reversibility** for agent entries.

## Binding constraints (human, coordinating thread)

- **Harvestable retention.** The retained prompt, input, schema and event
  stream of each review are stored as content-addressed objects in
  `.gatereeve-current/objects/` and referenced from that review's record. The
  live progress log may be a separate scratch file, but nothing that must be
  kept may live only there. A test shows that a finished review can be rebuilt
  from the run store alone.
- **Independence.** Progress goes to the human only, never into a peer
  reviewer's input.
- **Unchanged reviewer isolation.** The `validate_verdict` self-validation
  tool (#142) and the reviewer sandbox stay as they are.
- **Claude stream check.** Before Claude is switched to
  `--output-format stream-json --verbose`, confirm that the stream still
  carries the structured result the `--json-schema` path needs. If it does not,
  keep the structured result as it is and capture the stream another way.
- #148 (follow-up records) runs in parallel, mostly in round policy and
  completion. Stay out of its files where possible.

## Evidence base (read on main 4ce29df / rc.35)

- `runAgentProcess` buffers stdout and stderr in memory (16 MiB combined cap)
  and hands them over only after exit. Codex runs `exec --json`, so its event
  stream is already in stdout, but the stream is parsed only for the context ID
  and usage, then discarded.
- Claude runs `--output-format json`. That prints one envelope at exit, so
  nothing is visible while the review runs.
- A review result record (`kind: result`) references `input` (the prepared
  execution input), `receipt` and `artifacts` (the adapter receipt and the raw
  output). The receipt holds only *digests* of the instructions, the packet
  and the output. The packet, the output schema, the prompt text and the event
  stream are not retained, so a finished review cannot be rebuilt.
- `reviewerView` copies each history or consumed report's `input`, `receipt`
  and `artifacts` into a later reviewer's `evidence/`. Anything added to
  `artifacts` therefore reaches later reviewers.
- Planning reviews (`planning.review`, `delegation.js`) call the same adapters
  and retain the same two artifacts.

## Entries

### D1. Does Claude's stream-json still carry the structured result?

**Question:** With `--output-format stream-json --verbose` and
`--json-schema`, does Claude Code still return the schema-validated result?

**Answer:** Yes. Checked on Claude Code 2.1.332: the stream ends with a
`{"type":"result","subtype":"success",...}` event that carries
`structured_output`, `result`, `session_id`, `usage` and `total_cost_usd`. These
are the same fields the `json` envelope has. Before it come `system init`,
`assistant` and `user` (tool use and tool result) events, one per line, as
they happen.

**Answered by:** agent (empirical check)

**Decision:** Switch Claude to `stream-json --verbose`. Take the envelope from
the last `type: result` event. A stream without one is malformed output, as a
missing envelope is today.

**Options:** keep `json` and capture activity another way (no live view for
Claude; rejected because stream-json works); switch (chosen).

**Reversibility:** easy; one argument and the envelope reader.

### D2. Where the live stream goes while a review runs

**Question:** How do events reach a progress log as they arrive, without
changing the reviewer's sandbox or launch?

**Answer:** `runAgentProcess` gains an optional `onOutput(chunk)` hook that is
called for each stdout chunk as it arrives. The execution layer (not the
adapter) owns the progress file. It appends each chunk to
`.gatereeve-current/progress/<jobId>.<provider>.jsonl` in the feature home,
after one GateReeve header line (`gatereeve.progress/1`: job, provider, model,
stage, start time). It writes a trailer line with the final state. The
reviewer's argv, sandbox, tools and environment are unchanged.

**Answered by:** agent

**Decision:** Hook in `runAgentProcess` and a progress writer in the execution
layer. Files are named per job and provider, so the two parallel reviewers of
a pair and repeated rounds never share a file.

**Options:** adapter writes the file (rejected: the adapter has no feature-home
path, and the scratch environment must stay isolated); one file per provider as
the issue sketched (rejected: a later round would overwrite the earlier one
while a watcher reads it).

**Reversibility:** easy; scratch only, never authority.

### D3. What is retained, and where

**Question:** What exactly is kept for each review, and how is it referenced?

**Answer:** Every launched review attempt (initial, repair, delta; boundary,
individual and planning) retains one `review-activity` record as a JSON object
in `objects/`. It references five content-addressed objects: the exact prompt
text written to the provider's standard input, the instructions (text), the
input packet (JSON), the output schema (JSON) and the provider event stream
(stdout bytes, JSON lines). It also carries the provider and the byte counts
of the prompt and the stream. The adapter reports the prompt it actually sent
through an `onPrompt` hook, so the retained prompt is the sent bytes, not a
rebuild (planning review round 1, F1). The stream is kept
byte-for-byte from stdout, not copied from the progress file. The review's
record references it in a new `activity` field, separate from `artifacts`. A
review that failed after launch (timeout, malformed output, provider error,
rejected verdict) still retains it with whatever stream it produced.

**Answered by:** agent

**Decision:** The `activity` field on `kind: result` and `kind: planning-review`
records. The objects are stored through the existing `CurrentStore.put`, so
they are content-addressed, integrity-checked and harvestable. The progress
file is never the source of retained bytes.

**Options:** keep only the parts and rebuild the prompt (rejected in planning
review round 1: a later change to prompt assembly would make the sent prompt
unrecoverable); add the objects to `artifacts` (rejected by D5).

**Reversibility:** additive record field; old records simply have none.

### D4. Rebuilding a finished review from the run store

**Question:** What does "reconstructible" prove?

**Answer:** A helper, `reconstructReview(store, resultRef)`, reads the result
record and its `activity` from the store alone. It returns the retained
prompt, instructions, input, schema, output and parsed events, after checking
each object's integrity and the receipt's digests (instructions, input,
output). It does not need the current prompt-building code. A test runs a
review through a fake provider, deletes the progress file and the view, then
rebuilds the review from the database and `objects/` and gets byte-identical
prompt, input, schema and stream. `gatereeve read activity <result-hash>`
exposes the same reader.

**Answered by:** agent

**Decision:** As above.

**Options:** a test only (rejected: a reader on the CLI is how a human or the
telemetry viewer checks the retained activity).

**Reversibility:** easy.

### D5. Independence: progress and activity never reach a peer reviewer

**Question:** How is it guaranteed that progress goes to the human only?

**Answer:** Three rules. (1) The progress file lives in the feature home's
`progress/` folder, never inside the sealed reviewer view. (2) The retained
activity is referenced from `activity`, not `artifacts`, so `reviewerView`
never copies it into a later reviewer's `evidence/` (history or consumed),
and packet history carries no activity. (3) `review.progress` is an operation
for the human's CLI only; nothing in packet assembly reads it. Tests assert
that a later round's view and packet contain neither the progress file nor
any activity object of an earlier or peer review.

**Answered by:** agent

**Decision:** As above. Residual: a Codex reviewer's read-only sandbox can
read the host filesystem, as it already can for the feature home's `objects/`.
This PR does not change the sandbox (binding constraint). The file names carry
a job UUID and are not in the packet.

**Options:** put progress outside the feature home, in scratch (rejected: the
issue names `.gatereeve-current/progress/`, and scratch views are removed after
each review, so a watcher would lose them).

**Reversibility:** easy.

### D6. Tool-result bodies in the retained stream

**Question:** Retained event streams contain tool-result bodies, which are
repository source text the reviewer read. Once those streams are in
`objects/`, the telemetry harvester uploads them. Retain them raw, strip the
bodies (keeping calls, paths, sizes and digests), or truncate them?

**Answer:** "Retain raw (Recommended)".

**Answered by:** human (Trent, 2026-11-27, question tool)

**Decision:** Keep the provider's stdout byte-for-byte.

### D7. The watch view

**Question:** `gatereeve review watch` or a `status` field?

**Answer:** A read-only protocol operation, `review.progress`, so the plugin
adapter (no PATH CLI) and the CLI share it. It is surfaced as
`gatereeve review watch` (one snapshot; `--follow` refreshes every two seconds
until every listed reviewer has finished; `--json` prints the data). It shows
one line per reviewer: provider and model, job, elapsed time, files read
(Claude: distinct `Read` paths; Codex: commands run, since Codex reads files
through shell commands), the current activity (last tool call, truncated),
tokens so far when the stream reports them, and the state. The states are
`running`, `self-validating` (the last call is `validate_verdict`),
`finished, validating` (the process exited and GateReeve is checking the
verdict) and `done: <outcome>`. By default it lists the latest review job's
reviewers. `status` is unchanged.

**Answered by:** agent

**Decision:** As above.

**Options:** a `status` field (rejected: `status` is computed from the
journal, and polling it every two seconds is heavy); desktop UI (out of
scope).

**Reversibility:** easy; read-only.

### D8. Output size limit

**Question:** Claude's verbose stream is larger than its single envelope,
because it includes tool results. Does the 16 MiB combined stdout/stderr cap
still fit?

**Answer:** Raise the cap to 64 MiB, the size of the largest object the run
store accepts. Then any stream the reviewer is allowed to produce can also be
retained, and a long review is not ended for its own transcript. Output is
still buffered in memory as today.

**Answered by:** agent

**Decision:** `MAX_OUTPUT_BYTES` = 64 MiB. An over-limit review is terminated
and reported as today; the stream it produced up to that point is retained.

**Options:** keep 16 MiB (risks spurious UNAVAILABLE on large Claude reviews);
spool to disk (more change for no current need).

**Reversibility:** easy.

### D9. Progress file lifetime

**Question:** When are progress files removed?

**Answer:** At each new review launch, progress files for finished jobs older
than 24 hours are removed. A file with no trailer is kept, because its job may
still run. The files are scratch: nothing reads them for proof.

**Answered by:** agent

**Decision:** As above.

**Reversibility:** easy.

### D10. Files #148 is likely to touch

**Answer:** #148 works mostly in round policy and completion. This PR touches
`local-agent-adapters.js`, `execution.js` (the `independent` launch and result
record), `delegation.js` (planning-review record), a new
`review-activity.js`, the protocol adapter's operation table, the CLI command
module, and the protocol docs. It does not touch `round-policy.js`,
`review-findings.js` or completion.

**Answered by:** agent
