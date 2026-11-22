# Handoff (summary) - retain reviewer inputs and activity

Received 2026-11-22 from the `tb-eval-telemetry-platform` thread
(`TrentBrown/gatereeve-telemetry`). Objective: GateReeve keeps, for every
reviewer run, the exact inputs the reviewer received and a record of what it
did, in the per-feature workflow state, so a telemetry harvester can copy it
and a past review round can be analysed and re-run.

Gaps today: the prompt (only digests and a character count survive), the
reviewer's activity (the Codex `--json` stream is discarded; Claude's
`--output-format json` emits only the final result), raw output that failed
the contract, and sessions (by design of `--ephemeral` and
`--no-session-persistence`, which stay).

Recommendations adopted in D29–D31: store `request.instructions`,
`request.input` and the output schema as content-addressed objects keyed by
the receipt's digests; store the Codex event stream; switch Claude to
`--output-format stream-json --verbose` and read the final result from the
stream; retain raw output and validation errors on contract failure; rely on
candidates' full per-repository commit IDs for the reviewed source; leave
redaction to the harvester.
