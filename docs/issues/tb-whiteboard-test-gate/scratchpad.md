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
