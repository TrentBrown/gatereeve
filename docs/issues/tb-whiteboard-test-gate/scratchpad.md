# Decision Scratchpad - tb-whiteboard-test-gate

**Feature start:** 2026-09-24

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Preserve the single-plugin composer beneath a marketplace composer

[x] **Promote**
- **Confidence:** HIGH
- **Blast radius:** Plugin source layout, build CLI, marketplace staging, release candidates, native validation, smoke tests, and release integrity checks.
- **Triggered by:** P1 exposed that `composePackages()` is both a useful single-plugin primitive and an assumed flat-output contract in existing tests and commands, while marketplace publication is hard-coded to one plugin.
- **Decision:** Keep `composePackages()` as the deterministic composer for one plugin's shared source plus platform overlays. Add a marketplace registry and a higher-level composer that invokes the primitive once per registered plugin and writes `dist/{platform}/{pluginId}`. Treat catalogs and release integrity as a set of registered plugin identities. Keep the existing Agentic Development Workflow source at the plugin-source root for compatibility; place Whiteboard Test at `plugin-src/plugins/whiteboard-test` as a separate canonical source tree.
- **Alternatives considered:** Change the existing composer to always emit nested multi-plugin output, which would needlessly break its stable API and obscure single-package testing; merge Whiteboard resources into Agentic Development Workflow, which would violate the approved independent-plugin boundary; duplicate release scripts for Whiteboard, which would preserve the hard-coded design rather than generalize it.

## [2] Make evaluation and evidence publication explicit agent-workflow resources

[x] **Promote**
- **Confidence:** HIGH
- **Blast radius:** Agent-workflow module schema, resource loading, runtime validation, artifact publication, Judge, Whiteboard, CLI, and Desktop.
- **Triggered by:** A generic staged-agent runtime cannot safely infer which plugin owns a validator or which declared artifact is the authoritative evidence root.
- **Decision:** Every `agent-workflow` module explicitly names its resource plugin, evaluator resource/export, and authoritative evidence root. The runtime resolves only through trusted plugin roots, validates the evaluator result before publication, publishes only declared files, and asks the protocol core to record the root only after the pinned boundary is rechecked. Judge and Whiteboard therefore share mechanics without sharing evaluators or semantics.
- **Alternatives considered:** Select validators by module ID convention, which creates hidden coupling; let stages record their own evidence, which bypasses the reeve; treat every generated file as independently authoritative, which weakens provenance and Desktop artifact discovery.

## [3] Pin Desktop provider profiles and verify them with live fresh-context smokes

[x] **Promote**
- **Confidence:** HIGH
- **Blast radius:** Automatic Desktop execution, provider compatibility, support documentation, and release verification.
- **Triggered by:** Mocked adapter tests proved argument shape but did not prove that installed Codex and Claude Code versions accept the exact flags, model, empty MCP configuration, structured schema, and isolation mode.
- **Decision:** Desktop uses explicit high-reasoning provider profiles (`gpt-5.5` for the currently supported Codex CLI and `opus` for Claude Code), while headless callers can select an explicit model. Keep a repeatable live adapter smoke that runs a fresh structured context and reports the receipt. The smoke exposed and corrected Claude Code's required `{ "mcpServers": {} }` empty configuration; unsupported Codex models remain fail-closed rather than silently downgraded.
- **Alternatives considered:** Omit an explicit model and inherit a provider default, which permits silent capability drift; retain `gpt-5.6-sol` despite the supported installed CLI rejecting it; rely only on mocked process tests.

## [4] Isolate temporary Git fixtures from developer commit hooks

[x] **Promote**
- **Confidence:** HIGH
- **Blast radius:** Test fixtures only.
- **Triggered by:** Broad Node and Python suites inherited the developer's protected-branch hook and failed while creating disposable `main` repositories, even though production behavior was not under test.
- **Decision:** Configure `core.hooksPath=/dev/null` only inside disposable release-conductor and merge-verification fixture repositories. Also compare canonical real paths in macOS temporary-directory assertions so `/var` and `/private/var` aliases do not create false failures.
- **Alternatives considered:** Disable the user's global hook for the test process, which would broaden the exception; classify the failures as unrelated and leave the broad suite red; weaken the production protected-branch rule.

## [5] Bind installation and release preflight to the active multi-plugin registry

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Installation documentation, native platform contracts, Release Conductor preflight, and release workflow tests

Use TrentBrown/gatereeve as the Git-backed marketplace source because the coordinated publisher writes this repository's marketplace branch. Derive Plugin manifest version checks from marketplace-plugins.json, including each registered plugin's initialVersion, before protected release authority becomes reachable. Keep later native and candidate-integrity validation as independent checks.

**Triggered by:** Release-readiness inspection found that local-install commands still targeted the retired marketplace repository and the protected release preflight enumerated only the original plugin manifests

**Alternatives considered:**
Continue publishing while documenting the stale repository, which would install rc.2 instead of the current marketplace; rely only on later candidate validation, which weakens the conductor's fail-early contract; hard-code the Whiteboard paths, which would recreate the next multi-plugin maintenance defect.

## [6] Restore recorded fingerprints before automatic agent scheduling

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Automatic Judge and Whiteboard execution at active PR boundaries

The scheduler now reconstructs the active attempt fingerprint map from recorded gate outcomes and supplies it to protocol projection before selecting an eligible agent-workflow gate. The execution-preparation guard still rechecks the pinned PR context and reconstructs the same fingerprint map immediately before launch and again before outcome recording.

**Triggered by:** The first real PR #67 agent-workflow launch returned no eligible results after Verification passed because projection omitted all recorded fingerprints.

**Alternatives considered:**
Require an external fingerprints file for automatic scheduling - rejected because Desktop and headless automatic launches must be self-contained. Treat UNKNOWN freshness as eligible - rejected because it weakens protocol fail-closed semantics.

## [7] Expand compact boundary context through the trusted PR resolver

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Automatic agent-workflow launches and boundary currentness checks

Keep the compact context as the stable protocol event contract. Before an automatic agent launch, use a new trusted pr_context.py check-boundary-current operation to validate the compact repository, PR, URL, merge base, source head, and feature base against current Git and GitHub state, then return the full canonical PR context to the isolated workflow. The check intentionally allows uncommitted boundary evidence while rejecting source drift.

**Triggered by:** The repaired scheduler reached execution preparation, where the trusted PR validator rejected the protocol compact boundary context because it expected the richer persisted PR-context schema.

**Alternatives considered:**
Store the full tool-specific PR context in future boundary events - rejected because it changes the stable protocol event shape and does not repair existing attempts. Skip currentness validation for compact events - rejected because it would allow stale source to reach an isolated reviewer.

## [8] Explicitly trust only the generated Codex snapshot checkout

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Codex adapter launch arguments for isolated Judge and Whiteboard stages

Pass Codex --skip-git-repo-check only for the GateReeve-created disposable snapshot. Preserve ephemeral execution, ignored user config and rules, read-only sandboxing, empty inherited shell environment, explicit model and reasoning, bounded JSON schema, and the snapshot cleanup lifecycle.

**Triggered by:** The first fully prepared isolated Judge launch reached Codex, which rejected GateReeve own disposable pinned snapshot as an untrusted checkout.

**Alternatives considered:**
Run Codex against the developer checkout - rejected because it weakens pinned read-only isolation. Preconfigure every random snapshot directory as trusted - rejected because the path is disposable and would require broader persistent trust mutation. Use only Claude Code - rejected because Codex parity is an acceptance requirement.

## [9] Deduplicate identical feature and final-slice patches within provider budget

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Feature-final Judge and Whiteboard input packets for single-PR features and large diffs

When featureBaseSha equals sliceBaseSha, carry the complete patch once, set slicePatch to null, and attest slicePatchSameAsFeature=true. Preserve both changed-file inventories and all feature documents. Reduce the deterministic packet ceiling to 900 KiB so remaining oversized changes fail closed before provider launch instead of being silently truncated. PR #67 now produces a 715,875-byte complete packet.

**Triggered by:** The first isolated Codex turn received 1,376,184 characters because a single-PR feature-final packet embedded the same patch twice, exceeding the provider 1,048,576-character input ceiling.

**Alternatives considered:**
Silently truncate the patch - rejected because it loses coverage. Raise or ignore the provider limit - impossible and nonportable. Split Judge into unbounded per-file turns - rejected because the approved Judge is one bounded independent attempt and retries must remain bounded.

## [10] Externalize complete patches into digest-bound snapshot sidecars

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** All isolated agent-workflow provider prompts, snapshot digests, and large change packets

Keep full patch coverage without injecting patch bodies into the model prompt. Materialize complete feature and slice patches under the reserved .gatereeve-agent-evidence directory inside the disposable read-only snapshot, replace inline patch values with path, digest, and byte-count references, and include the sidecar manifest in the snapshot digest. Both Codex and Claude Code can inspect the referenced text with their existing read-only tools. Reject prompt envelopes above 512 KiB before provider launch; do not truncate.

**Triggered by:** The deduplicated 715,875-byte feature packet was below the character ceiling but still caused Codex to exit before producing structured output, consistent with a provider context-token limit.

**Alternatives considered:**
Truncate or summarize patches - rejected because it can silently lose coverage. Depend on one provider larger context window - rejected because equivalent Codex and Claude Code behavior is required. Give the model access to the developer checkout Git history - rejected because the approved contract is a disposable pinned read-only view.

## [11] Keep provider schemas explicit and retain both process diagnostics

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** All local agent-workflow provider schema failures and process diagnostics

Every constant-valued field in a provider-facing output schema must also declare its JSON type so the schema is accepted by strict structured-output providers. When a provider exits unsuccessfully, retain bounded stderr and stdout together; warnings on stderr must not hide a structured API error on stdout.

**Triggered by:** The first sidecar-backed Judge launch reached Codex with a bounded prompt, but Codex rejected the Judge schema because `schemaVersion` used `const` without `type`. The adapter reported only unrelated stderr warnings and concealed the actionable stdout error.

**Alternatives considered:**
Strip provider warnings - rejected because warnings remain useful diagnostic evidence. Prefer stderr over stdout - rejected because Codex reports structured request failures on stdout. Loosen the Judge schema - rejected because explicit typing preserves, rather than weakens, the contract.

## [12] Bind prerequisite evidence and native reveal validation

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Agent-workflow dependency packets and Whiteboard passage validation

Materialize every prerequisite gate artifact as a digest-verified read-only snapshot sidecar and expose its path, outcome, event, digest, and size in `initial.dependencyEvidence`. Judge requires Verification evidence. Whiteboard requires native `<details><summary>` controls for every concise, deep, evidence, and Push Harder reveal, and its authoritative root binds a deterministic validation receipt over HTML, stage outputs, and stage receipts.

**Triggered by:** The first substantive independent Judge failed R4, R5, R6, and R8 because marker-only HTML could pass without dependable controls, validation was not digest-bound, and the Judge prompt claimed Verification evidence that the runtime did not provide.

**Alternatives considered:**
Treat Verification as implicit in the dependency event - rejected because the reviewer must inspect the actual evidence. Require custom JavaScript controls - rejected because static validation cannot prove arbitrary handlers and scripts may fail. Run a provider-specific browser during every gate - rejected because headless Codex and Claude Code parity must not depend on Desktop Electron. Native details controls provide deterministic accessible reveal behavior while leaving richer optional HTML, CSS, SVG, and JavaScript available.

## [13] Publish agent artifacts under immutable attempt directories

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Agent-workflow evidence paths and historical attempt auditability

Publish every agent-workflow bundle beneath `pr-<n>/attempts/<attempt-id>/` and record that exact root path in the gate event. A later attempt may create its own bundle but cannot overwrite the failed or passed evidence from an earlier attempt.

**Triggered by:** The substantive attempt-8 Judge produced durable failure evidence at fixed packet-root filenames. A successful retry at those same filenames would invalidate the earlier event's evidence reference.

**Alternatives considered:**
Overwrite packet-root artifacts and rely on Git history - rejected because the working boundary event must remain locally auditable before commit and across retries. Copy failed artifacts aside without changing event paths - rejected because the event would still reference mutable bytes. Encode the attempt only inside the manifest - rejected because filesystem publication would remain destructive.

## [14] Separate ordering edges from evidence flow and constrain Whiteboard waivers

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Boundary agent inputs, module contracts, waiver events, CLI, snapshots, and model migration

Treat `after` as ordering and freshness only. Agent-workflow inputs externalize artifacts only for the module's declared `dependsOn` edges, never for `after` predecessors. Add the generic `non-behavioral-only` waiver policy and apply it to Whiteboard Defense. Such a waiver requires a human-confirmed event plus a structured `NON_BEHAVIORAL` classification and digest-bound evidence reference; the basis is preserved in the event and projection.

**Triggered by:** Attempt-9 Judge correctly found that the boundary DAG combined `after` with hard dependencies and the runtime then exposed the Judge artifact to Whiteboard. It also found that Whiteboard's waiver flag did not enforce the approved non-behavioral restriction.

**Alternatives considered:**
Remove Judge ordering - rejected because the approved flow should wait for Judge when enabled. Hide only the Judge gate by ID - rejected because ordering-only semantics must be generic for plugins. Trust a free-form waiver reason - rejected because it is neither typed nor evidence-bound. Disable waivers entirely - rejected because approved non-behavioral exemptions remain useful.

## [15] Execute and bind every generated Whiteboard artifact before passage

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Agent-workflow receipts, Whiteboard evaluation, CLI and Desktop dependencies, staged protocol resources, and browser smoke coverage

Run every generated Whiteboard HTML artifact through a trusted host validator before the plugin evaluator can return PASS. The validator parses the actual generated bytes with a DOM, rejects every non-fragment and non-data resource reference, executes inline scripts in a time-bounded no-code-generation VM, exercises every native reveal control, checks visual text alternatives and finding links, and returns a digest-bound receipt incorporated into the authoritative Whiteboard validation receipt. Agent stage receipts also bind the requested capability profile. Keep an Electron smoke against a run-specific artifact path to verify representative behavior in the production sandboxed browser surface.

**Triggered by:** Attempt-10 Judge correctly found that the deterministic validator inspected HTML as text while the only browser smoke used a fixed fixture, allowing relative resources or generated runtime failures to escape the governed passage decision. The same report noted that receipts recorded actual provider settings without explicitly recording the requested capability profile.

**Alternatives considered:**
Launch provider-specific Electron for every headless CLI run - rejected because it breaks Codex and Claude Code portability. Return to a constrained renderer - rejected because the approved artifact retains freeform HTML, CSS, SVG, and optional JavaScript. Trust static regex checks plus the native controls - rejected because they cannot execute the generated document. Treat the DOM result as advisory - rejected because artifact integrity, unlike disclosed work weakness, must prevent Whiteboard PASS.

## [16] Bind current boundary artifacts without rewriting attempt history

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** PR boundary packet manifest and validation

Add boundary manifest schema version 2. Each applicable gate now identifies its current human artifact with a packet-relative path and SHA-256 digest, so a packet can point at the exact immutable attempt artifact that granted passage. Retain schema version 1 for historical packets. Route every formal gate output through `boundary_gate.py --attempt-id` into `attempts/<attempt-id>/`; version 2 permits those audited attempt files and preserved legacy root gate reports, rejects symlinks and unrelated extras, and verifies every current gate reference by name, regular-file status, nonempty content, and digest.

**Triggered by:** Packet validation after the attempt-12 Judge PASS found that the legacy fixed-filename contract would read PR #67's preserved attempt-8 root `judge.md` failure instead of the current attempt-12 PASS under its immutable attempt directory.

**Alternatives considered:**
Overwrite the packet-root Judge files - rejected because the attempt-8 event binds those exact bytes and history must remain immutable. Copy the latest result to a mutable `latest` file - rejected because it recreates ambiguous unbound evidence. Delete failed attempt evidence - rejected because it destroys the review history. Ignore nested attempt files in packet validation - rejected because current passage would still resolve the wrong root artifact.

## [17] Make Whiteboard presentation semantics machine-enforceable

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Whiteboard Defender output schema, generated HTML validation, plugin validator, staged Desktop resources, and representative browser fixtures

Give every finding a stable portable ID. Require an inline element whose ID and typed data attributes bind that finding, place challenge-scoped findings inside their owning challenge, require a summary link back to the inline marker, and require both locations to visibly name the finding type and summary. Reject answer-entry and grading controls, audio or video media, and any Explain Diff mention before Whiteboard can pass.

**Triggered by:** Attempt-14 Judge found that prompt-level requirements for inline linked findings and the bans on grading, audio assessment, and Explain Diff dependency were not all required by the deterministic PASS contract.

**Alternatives considered:**
Rely only on the Defender prompt - rejected because model compliance is not a deterministic gate. Link findings directly to the challenge root - rejected because it does not identify the exact inline finding or prove that its type and summary are rendered. Add a constrained renderer - rejected because the approved freeform HTML model remains valuable; a semantic DOM contract preserves visual freedom while enforcing the required behavior.
