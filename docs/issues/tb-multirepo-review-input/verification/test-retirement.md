# Retired orchestration and retained safety coverage

The cutover removes old public slice/boundary/change commands, journal replay,
model migration, dependency scheduling, owner ordering, automatic advisory runs,
and desktop module mutation/task APIs. Tests whose assertions require those
retired interfaces were removed with the implementation, rather than retaining
a compatibility interpreter. Old feature journals and user project files were
not deleted or converted.

| Retired test family | Current replacement / retained safety |
| --- | --- |
| Old lifecycle, feature-store, model, graph and ordering | current-core: authorization, phase predicates, pause, source drift, idempotence, interrupted activation, current-only public adapter/CLI tests |
| Boundary/retry/advisory scheduling and artifact publication | current-core: explicit readiness, real execution, retained receipts, exclusive job claim, repeat reconciliation, corrupt/missing bytes, symlink/traversal negatives |
| Tracked compact review, pinned snapshots, old evidence finalization | current-core: parent/repository records, exact raw inputs, two repositories, clean source, integration/completion, closure failure |
| Old review freshness/owner dependency semantics | current-core: grouped exact reuse, consumed proof, rule bytes, installed dependency bytes, changed source, delta coverage, stale support records |
| Desktop ordering/module execution/attestation | current-view, renderer-integration, current protocol adapter, IPC absence assertions; real preload/native controls no mutation APIs |
| Module-task terminal mode | User-shell PTY input/resize/restart, descendant process cleanup, renderer isolation and window quit guards retained |
| Old textual instructions | Current SessionStart, current operations, packaging import/inventory assertions |

Provider isolation/receipt validation, module-provider transport safety, protected
release/publishing and trust tests, Markdown/artifact confinement, IPC frame
validation, terminal lifecycle, package provenance, current CLI/desktop integration
and Python resolver/safety tests remain. This mapping is not a numerical claim
that fewer tests alone prove equivalent coverage; independent review checks the
remaining omissions against the approved rubric.

The final cleanup also removes the dormant Python boundary retry/gate/packet and
feature-final orchestration, their old sequential-flow tests, the retired Judge
stage bundles/validator, the desktop dependency diagram and old projection-only
presentation helpers. Current runner/assessment contracts, real source integration,
local closure, current activation recovery, Python PR context/lifecycle safety and
resolver tests replace those procedural assertions. The Python suite now has 62
passing tests; the earlier 104-test result belongs to the pre-cleanup candidate.
