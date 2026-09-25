# Decisions - tb-whiteboard-test-gate

**Feature start:** 2026-09-24

Permanent record of decisions promoted from `scratchpad.md`.

---

## Preserve the single-plugin composer beneath a marketplace composer

- **Confidence:** HIGH
- **Blast radius:** Plugin source layout, build CLI, marketplace staging, release candidates, native validation, smoke tests, and release integrity checks.
- **Triggered by:** P1 exposed that `composePackages()` is both a useful single-plugin primitive and an assumed flat-output contract in existing tests and commands, while marketplace publication is hard-coded to one plugin.
- **Decision:** Keep `composePackages()` as the deterministic composer for one plugin's shared source plus platform overlays. Add a marketplace registry and a higher-level composer that invokes the primitive once per registered plugin and writes `dist/{platform}/{pluginId}`. Treat catalogs and release integrity as a set of registered plugin identities. Keep the existing Agentic Development Workflow source at the plugin-source root for compatibility; place Whiteboard Test at `plugin-src/plugins/whiteboard-test` as a separate canonical source tree.
- **Alternatives considered:** Change the existing composer to always emit nested multi-plugin output, which would needlessly break its stable API and obscure single-package testing; merge Whiteboard resources into Agentic Development Workflow, which would violate the approved independent-plugin boundary; duplicate release scripts for Whiteboard, which would preserve the hard-coded design rather than generalize it.

**Promoted:** 2026-09-24.

---

## Make evaluation and evidence publication explicit agent-workflow resources

- **Confidence:** HIGH
- **Blast radius:** Agent-workflow module schema, resource loading, runtime validation, artifact publication, Judge, Whiteboard, CLI, and Desktop.
- **Triggered by:** A generic staged-agent runtime cannot safely infer which plugin owns a validator or which declared artifact is the authoritative evidence root.
- **Decision:** Every `agent-workflow` module explicitly names its resource plugin, evaluator resource/export, and authoritative evidence root. The runtime resolves only through trusted plugin roots, validates the evaluator result before publication, publishes only declared files, and asks the protocol core to record the root only after the pinned boundary is rechecked. Judge and Whiteboard therefore share mechanics without sharing evaluators or semantics.
- **Alternatives considered:** Select validators by module ID convention, which creates hidden coupling; let stages record their own evidence, which bypasses the reeve; treat every generated file as independently authoritative, which weakens provenance and Desktop artifact discovery.

**Promoted:** 2026-09-24.

---

## Pin Desktop provider profiles and verify them with live fresh-context smokes

- **Confidence:** HIGH
- **Blast radius:** Automatic Desktop execution, provider compatibility, support documentation, and release verification.
- **Triggered by:** Mocked adapter tests proved argument shape but did not prove that installed Codex and Claude Code versions accept the exact flags, model, empty MCP configuration, structured schema, and isolation mode.
- **Decision:** Desktop uses explicit high-reasoning provider profiles (`gpt-5.5` for the currently supported Codex CLI and `opus` for Claude Code), while headless callers can select an explicit model. Keep a repeatable live adapter smoke that runs a fresh structured context and reports the receipt. The smoke exposed and corrected Claude Code's required `{ "mcpServers": {} }` empty configuration; unsupported Codex models remain fail-closed rather than silently downgraded.
- **Alternatives considered:** Omit an explicit model and inherit a provider default, which permits silent capability drift; retain `gpt-5.6-sol` despite the supported installed CLI rejecting it; rely only on mocked process tests.

**Promoted:** 2026-09-24.

---

## Isolate temporary Git fixtures from developer commit hooks

- **Confidence:** HIGH
- **Blast radius:** Test fixtures only.
- **Triggered by:** Broad Node and Python suites inherited the developer's protected-branch hook and failed while creating disposable `main` repositories, even though production behavior was not under test.
- **Decision:** Configure `core.hooksPath=/dev/null` only inside disposable release-conductor and merge-verification fixture repositories. Also compare canonical real paths in macOS temporary-directory assertions so `/var` and `/private/var` aliases do not create false failures.
- **Alternatives considered:** Disable the user's global hook for the test process, which would broaden the exception; classify the failures as unrelated and leave the broad suite red; weaken the production protected-branch rule.

**Promoted:** 2026-09-24.

---

## Bind installation and release preflight to the active multi-plugin registry

**Confidence:** HIGH

**Blast Radius:** Installation documentation, native platform contracts, Release Conductor preflight, and release workflow tests

Use TrentBrown/gatereeve as the Git-backed marketplace source because the coordinated publisher writes this repository's marketplace branch. Derive Plugin manifest version checks from marketplace-plugins.json, including each registered plugin's initialVersion, before protected release authority becomes reachable. Keep later native and candidate-integrity validation as independent checks.

**Triggered by:** Release-readiness inspection found that local-install commands still targeted the retired marketplace repository and the protected release preflight enumerated only the original plugin manifests

**Alternatives considered:**
Continue publishing while documenting the stale repository, which would install rc.2 instead of the current marketplace; rely only on later candidate validation, which weakens the conductor's fail-early contract; hard-code the Whiteboard paths, which would recreate the next multi-plugin maintenance defect.

**Promoted:** 2026-09-24.

---

## Restore recorded fingerprints before automatic agent scheduling

**Confidence:** HIGH

**Blast Radius:** Automatic Judge and Whiteboard execution at active PR boundaries

The scheduler now reconstructs the active attempt fingerprint map from recorded gate outcomes and supplies it to protocol projection before selecting an eligible agent-workflow gate. The execution-preparation guard still rechecks the pinned PR context and reconstructs the same fingerprint map immediately before launch and again before outcome recording.

**Triggered by:** The first real PR #67 agent-workflow launch returned no eligible results after Verification passed because projection omitted all recorded fingerprints.

**Alternatives considered:**
Require an external fingerprints file for automatic scheduling - rejected because Desktop and headless automatic launches must be self-contained. Treat UNKNOWN freshness as eligible - rejected because it weakens protocol fail-closed semantics.

**Promoted:** 2026-09-24. PR: 67.

---

## Expand compact boundary context through the trusted PR resolver

**Confidence:** HIGH

**Blast Radius:** Automatic agent-workflow launches and boundary currentness checks

Keep the compact context as the stable protocol event contract. Before an automatic agent launch, use a new trusted pr_context.py check-boundary-current operation to validate the compact repository, PR, URL, merge base, source head, and feature base against current Git and GitHub state, then return the full canonical PR context to the isolated workflow. The check intentionally allows uncommitted boundary evidence while rejecting source drift.

**Triggered by:** The repaired scheduler reached execution preparation, where the trusted PR validator rejected the protocol compact boundary context because it expected the richer persisted PR-context schema.

**Alternatives considered:**
Store the full tool-specific PR context in future boundary events - rejected because it changes the stable protocol event shape and does not repair existing attempts. Skip currentness validation for compact events - rejected because it would allow stale source to reach an isolated reviewer.

**Promoted:** 2026-09-24. PR: 67.

---

## Explicitly trust only the generated Codex snapshot checkout

**Confidence:** HIGH

**Blast Radius:** Codex adapter launch arguments for isolated Judge and Whiteboard stages

Pass Codex --skip-git-repo-check only for the GateReeve-created disposable snapshot. Preserve ephemeral execution, ignored user config and rules, read-only sandboxing, empty inherited shell environment, explicit model and reasoning, bounded JSON schema, and the snapshot cleanup lifecycle.

**Triggered by:** The first fully prepared isolated Judge launch reached Codex, which rejected GateReeve own disposable pinned snapshot as an untrusted checkout.

**Alternatives considered:**
Run Codex against the developer checkout - rejected because it weakens pinned read-only isolation. Preconfigure every random snapshot directory as trusted - rejected because the path is disposable and would require broader persistent trust mutation. Use only Claude Code - rejected because Codex parity is an acceptance requirement.

**Promoted:** 2026-09-24. PR: 67.
