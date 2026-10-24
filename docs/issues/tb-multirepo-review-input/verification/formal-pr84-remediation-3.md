# Formal PR84 third remediation

Attempt formal-pr84-3 failed its independent code/spec review and native OpenAI Judge on 3dd128fc5dae29a7b6fa829fe23a5f32e0842b4c. All reports and receipts remain in that attempt. The installed core recorded remediation before source changes. Advisory readiness 3 returned UNAVAILABLE/CONTRACT_INVALID; no passing advisory verdict is claimed.

Implementation claims for fresh independent assessment:

- CR3-1: known report filenames such as explain-diff.html are excluded at nested PR and attempt locations inside the recognized artifact area. Ordinary HTML, executable code and configuration remain source. The existing history/continuation regression now includes nested reports and ordinary HTML.
- Judge F1: readonly review exports now include metadata/<alias>.json with path, original Git mode and kind for every base/head/target entry. Prior result snapshots expose the same metadata. The evaluator instruction and packet name these files. Mode-only changes enter delta coverage and actual readonly materialization remains 0400. A regression inspects all current/prior endpoints for 100644-to-100755 changes.
- Judge F2: the complete command loop retains all already executed receipts, stdout and stderr when any subsequent preflight or postflight fails. Both verification and completion use this shared runner. Regressions execute successful and failed first checks, reject a later unselected repository, and verify retained output, exit code, closure and overall UNAVAILABLE.
- Judge F3: present dispositions reopen blocking findings, preserve their original finding plus reopening report, and require a later supported closure. Unaffected cannot close an open finding; PASS cannot contradict a present blocking disposition. Regressions cover close/reopen without repeating the finding, unchanged and changed candidates, missing/unaffected/present attempted PASS, and eventual independent resolution.

Seven focused regressions pass. Broader execution results are retained in repair-round-3 after completion. These claims do not substitute for the next formal independent review.
