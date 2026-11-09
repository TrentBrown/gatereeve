# Verification - implementation efficiency

## Candidate and authority

Initial implementation candidate: `91beb929fac04c9da3c1c19572fbf9605db8d80f`.
Baseline: `8b016e84ceba636f868314f32e62dcf73eefae1f`.
Installed rc.24/current-5 governs this feature. Its approval records remain intact;
new current-6 fixtures do not grant authority to this feature.

## Completed implementation checks

- CLI non-core regression: 390 passed, one skipped. Later added/changed SQLite
  process, fleet, public-context and unknown-timing cases also pass focused runs.
- Core regression: 196 assigned cases; 193 passed and one skipped in the broad
  run. Both failures were obsolete optional-review packet expectations; the
  packet was corrected and both targeted supersession cases now pass.
- Desktop regression: 177 passed in the broad run; two obsolete Judge label
  assertions and an inherited ELECTRON_RUN_AS_NODE setting were corrected in
  the test invocation. All three focused reruns pass, including actual Electron
  sandboxed rendering. No production Electron workaround was needed.
- Latest metrics/report regression: 42 passed, including unknown timing,
  duplicate/conflict/versioned imports, model-analysis provenance/citations,
  bounded storage and process-shared measurement.
- Python: 29 pattern tests, 59 workflow-script tests, two plugin smoke tests pass.
- Canonical plugin validation, native validation, portability lint and build pass.
- SQLite process tests exercise a process exiting with an uncommitted transaction
  and two separate writers competing for the same expected revision.

These are local observations, not hosted CI or release/activation evidence.
The actual installed runner is executing full portable acceptance and all desktop
checks on the initial committed candidate; its terminal result remains pending.

## Review availability

The actual independent code/reconciliation/triage request was attempted with
configured local Codex model `gpt-6-sol`, high reasoning. The local CLI rejected
that model as unsupported. All three results are retained as UNAVAILABLE; no
review verdict has been authored by the implementer. Reviewer selection is
pending the user's response to the runtime-required fallback question.

## Open regression discovered during acceptance

A three-import disposable-store reproduction accepted PASS at time T, FAIL at
T+1, then a conflicting FAIL at time T. Import currently checks timestamp conflict
only against the latest version. Check every retained observation at that time
before admitting another dataset. Preserve original datasets and test rollback.
A targeted follow-up will also use locale-independent snapshot ordering and
keep the legacy local-report iframe separate from the fleet-report iframe.

## Fleet and timing limits

The supplied rc.23 backup has 303 imported observations. A fixed all-project
report and HTML export are generated in the isolated review directory documented
in evidence-inventory.md. Project mappings remain unknown. Playpen-current,
AWS and UpCloud are explicitly missing; historical Playpen is partial. Total
execution coverage and causal speedup remain unknown. Untimed observations are
not zero work. The old handoff's percentage concerns attribution inside observed
spans, not a measured fraction of all developer time.

Hosted Ubuntu/container/desktop packaging matrices, protected integration,
publishing, installation and fresh-session activation have not occurred.


## Initial candidate actual runner result and targeted follow-up

Installed runner result `sha256:f11f941747b195f66726c6b95cc5ce68ce0ac5ad2ee8c40bc6d2fdce7e44c3f1`
retains FAIL. All 196 core cases completed (195 passed, one skipped). The outer
CLI suite reported 397 passes, one failure and two skips; the failure was a stale
assertion expecting the retired `externalRuntimeInputs` CLI message. Its early
failure stopped the remaining portable acceptance script steps. The separate
actual desktop receipt passed all 180 tests. No failure was erased.

Targeted follow-up fixes the stale message assertion, historical snapshot conflict
checking, locale-independent dataset ordering, separate local/fleet report frames,
and the desktop diagnostic-view contract selector. Fleet/CLI follow-ups pass all
14 tests; desktop targeted checks pass. No core behavior was changed by these
follow-ups. Independent review must assess proposed focused replacement coverage
against the retained broad failure and untouched passing cases.

User authorized selecting another available reviewer. An actual isolated Codex
availability check succeeded with `gpt-6.1-sol` at high reasoning. That provider
will perform fresh governing reviews; the probe itself is not a review.

## Reviewer launch diagnosis

The first shell probe and GateReeve launches resolved different Codex installations.
The standalone 0.142.4 CLI rejected the model and could not parse the newer model
catalog; its UNAVAILABLE outcomes remain retained. A real installed-adapter probe
using `/Users/trent.brown/.nvm/versions/node/v24.15.0/bin/codex` (0.166.0) completed
with gpt-6.1-sol/high and a fresh provider context. The substantive review now uses
that explicit executable through the existing runtime adapter injection. No
installed plugin or global configuration was modified; no receipt is synthesized.

## Additional import-path audit while review runs

A disposable two-snapshot reproduction confirmed that combine currently selects
the latest source metadata, losing an earlier partial-coverage limitation and
narrowing the displayed coverage window despite retaining the earlier records.
The follow-up should union known windows/limitations, preserve unknown bounds,
and retain partial status whenever any contributing source is partial/missing.

Also inspect future per-command public check labels: nested verification spans
currently inherit only the generic verification gate label despite retaining a
human-readable check purpose. Preserve useful public labels without exporting
raw argv/environment/logs. Batch these reporting fixes with any independent
findings; do not relabel the current candidate as already corrected.

## Batched independent-review repairs

The gpt-6.1-sol code/spec/reconciliation execution and separate gpt-6-astra judge
independently found the same three defects on 7ca3009: nested worker totals in
drill-down groups, loss of known legacy workflow identities, and unreachable
selected-workflow database inspection in desktop. Exact historical findings are
retained under review-7ca3009 and in the current runtime objects.

Repairs share exclusive worker accounting with the overview, preserve actual run
identities while labeling absent ones unknown, and provide a desktop workflow
selector backed by the shared database inspection service. A real SQLite desktop
integration test also exposed initialization of a new reporting store before its
first workflow projection; that is repaired. Combining snapshots now retains
earlier coverage limitations/windows. Per-command public purpose labels and
explicit batch-discovery guidance improve future observability and review.

Focused fleet and desktop regressions passed 16/16. A fresh actual runner will
retain the exact 303-record historical import input and output, plus current
focused regressions, before independent reassessment. No speedup is yet measured.

## Additional focused accounting reproduction

After 476ace0 verification, a two-model parent/child reproduction found that
filtering before nested accounting reports model-one overview contribution 80 ms
but its filtered total 100 ms. The pending correction keeps full fixed-dataset
span context for accounting while selecting only requested observations. This is
part of the same R6 accounting repair, not a new requirement.

## Measurement-independent database visibility

Review on 476ace0 closed the earlier three findings and accepted historical
evidence and focused check replacement, but found selected-workflow inspection
unavailable when collection is disabled. The current overview now displays its
already supplied authoritative database snapshot independently of shared metrics
registration. Its real protocol-adapter integration test starts the workflow with
GATEREEVE_METRICS=off and checks displayed schema, integrity and state.
