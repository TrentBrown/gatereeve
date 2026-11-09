# Local evidence contract

The current contract is in [PROTOCOL.md](../PROTOCOL.md). Requirements and evidence
are retained under the canonical feature home, independently of application Git.
A parent folder above several repositories is supported with optional Git tracking.

Input manifests bind approved raw requirement bytes, source base/head for each
selected repository, criterion/scope, command configuration and environment,
consumed evidence and evaluator qualification. Results retain original evaluated
inputs, execution receipt, verdict, coverage, findings and dispositions. The core
validates reference closure and current applicability before milestone passage.

No evidence-only commit/push, caller changed-file list or current-file reconstruction
can substitute for missing retained bytes. Exclusive publication, hash checks and
repeat-safe journal operations preserve interrupted/conflicting work without
turning incomplete output into PASS. Retain failures. The current implementation
fails explicitly above its 64 MiB capture limit rather than silently truncating.

Source changes require refresh or qualified deltas. Identical relevant content
can reuse proof without rewriting execution provenance. Unknown relevance is
conservative. Shared helpers/configuration/dependencies are not assumed unrelated.

There is no automatic pruning or backup service. Before deleting a workspace,
obtain a scoped keep/archive/discard decision and verify any claimed archive copy
outside the deletion scope. Git tracking and remote backup are separate choices.
