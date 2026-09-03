# Spec - tb-workflow-modules

**Feature:** `tb-workflow-modules`
**Created:** 2026-09-03

## Summary

GateReeve shall preserve its opinionated feature and slice lifecycle while
replacing hardcoded PR-boundary checks with a versioned module graph, adding a
generic feature-finalization module slot, and exposing project-controlled
enablement, scoped waivers, observation providers, and explicitly authorized
command execution. The first finalization implementation shall make verified
GateReeve Release Conductor completion capable of gating the feature that a
release contains.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** **Deterministic module policy and resolution.** A project can resolve
  built-in definitions and declarative manifests under `.gatereeve/modules/`
  through tracked `.gatereeve/workflow.json`. Resolution accepts only
  `boundary.evaluation` and `feature.finalization`, derives stable order from a
  valid dependency DAG, and rejects duplicate IDs, unknown slots, missing
  definitions or dependencies, cycles, and digest mismatches. The project
  policy selects exact versions or digests; every governed feature lock stores
  the complete resolved graph; an installed update does not alter an existing
  policy or feature until explicitly applied through a validated migration
  preview.

- **AC2.** **Boundary behavior through declarative modules.** The existing
  PR-boundary sequence is represented entirely as built-in modules without
  weakening its ordering, fingerprint, freshness, evidence, remediation, or
  human-review guards. Context pinning, reconciliation, decision triage, and
  packet validation are always enabled, locked, and non-waivable. Verification,
  spec evaluation, pattern review, Judge, code review, explain diff, and
  project additions are configurable; the default policy keeps Judge and code
  review enabled and required. Human-review passage remains a lifecycle action
  and is unavailable until every required current boundary outcome is
  nonblocking.

- **AC3.** **Safe project configuration and scoped dispositions.** GateReeve shows
  locked and configurable modules in project settings, stages checkbox edits,
  identifies dependencies and dependents without a hidden cascade, previews
  the tracked policy diff and active-feature migration impact, and atomically
  writes valid applied policy without staging or committing it. A module may
  allow `Skip for this boundary...` or `Skip for this feature...`; each action
  requires confirmation and a reason and records `WAIVED` against the exact
  scope fingerprint. Changed inputs stale the waiver. `NOT_APPLICABLE` remains
  distinct, and a missing required local implementation appears as an explicit
  readiness blocker rather than being silently disabled, waived, or reclassified.

- **AC4.** **State-specific module status presentation.** The six-item feature rail
  remains unchanged. Selecting Implementing shows slices and the selected
  slice's `boundary.evaluation` attempt graph; selecting Finalizing shows a
  parallel `feature.finalization` graph when modules are enabled. A shared
  renderer exposes each module's identity, authoritative outcome, freshness,
  normalized live status, provider-specific detail, next safe action, evidence,
  timestamps, attempts, failures, links, and permitted waiver control without
  loading module-supplied UI code. Projects with no finalization modules do not
  receive a misleading release section.

- **AC5.** **Deliberate run adapters and command sessions.** Modules may
  independently declare `skill`, `manual`, or `command` run adapters and an
  observation provider. Skill adapters provide copy/open-terminal dispatch
  context but never cause GateReeve to launch an agent automatically; manual
  adapters require an explicit structured attestation. Commands never run on
  project open, readiness, or background polling. A command is shown as an
  executable, argument array, working directory, and disclosed authority; it
  runs only after `Run once` or local `Always allow this command version`
  consent bound to repository and detectable version inputs. It executes in a
  dedicated cancellable, time-bounded task terminal while the user's project
  shell remains intact, and its bounded transcript and exact result are retained
  with the attempt.

- **AC6.** **Command results and provider isolation.** A providerless command maps
  exit `0` to `PASS`, nonzero exit, signal, or timeout to `FAIL`, and explicit
  user cancellation to a recorded cancelled attempt with gate outcome `UNSET`;
  structured output may enrich but not contradict that result. Installed
  observation providers run outside the Desktop process through a versioned
  JSON-over-stdio contract, and repository manifests may reference only
  allowlisted installed providers. Provider crashes, timeouts, malformed
  output, missing implementations, and stale inputs fail closed and remain
  diagnosable. Live `pending`, `running`, `waiting`, `blocked`, or `unavailable`
  progress remains separate from authoritative outcomes. A verified terminal
  provider result may record `PASS` or `FAIL` only through fresh protocol-core
  validation of identity, dependencies, fingerprint, and evidence.

- **AC7.** **Generic feature-finalization gating.** A required enabled
  `feature.finalization` module keeps its feature in Finalizing until it has a
  current nonblocking outcome bound to the feature's final merge input. A
  provider-backed asynchronous module may report intermediate stages and safe
  actions without prematurely resolving its gate. A permitted feature-scoped
  waiver is audited and fingerprint-bound. A project with no enabled
  finalization module can complete without release or deployment state, and
  GateReeve core contains no release-specific lifecycle transition or status.

- **AC8.** **GateReeve Release and post-merge proof.** The built-in **GateReeve
  Release** module has ID `gatereeve/release` and installed provider ID
  `gatereeve/release-conductor`; the GitHub workflow remains **Release
  Conductor**, and `trust` is used only for its relevant internal stage. The
  provider shows the conductor's stages and safe actions and records `PASS`
  only after validating a terminal `COMPLETE` evidence chain whose source
  contains the feature's final merge commit. One qualifying release can satisfy
  multiple included features. The fourth delivery slice demonstrates this
  contract with a real post-merge GateReeve release and retained conductor,
  source-containment, publication, installation, and smoke evidence.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Deterministic module policy and resolution | Valid built-in and project manifests resolve to the same pinned DAG across repeated runs; every listed invalid graph or digest case is rejected; policy and active-feature updates require explicit validated adoption | Resolution is nondeterministic, accepts an invalid graph, silently substitutes an update, or omits the complete graph from the feature lock | Schema and resolver unit tests; invalid-manifest/DAG fixtures; lock replay and migration-impact integration tests; exact policy/lock snapshots |
| R2 | Declarative boundary parity and locked envelope | The complete existing boundary executes through built-in module definitions with unchanged dependency, freshness, evidence, remediation, and human-review protections; locked modules cannot be disabled or waived; defaults retain Judge and code review | Any former protection is bypassed, a locked step is mutable, a configured required check is omitted, or human review becomes available early | Before/after model contract comparison; boundary protocol and negative guard tests; default-policy fixture; full existing boundary regression suite |
| R3 | Project settings, dependency edits, waivers, and readiness | Settings stage and validate edits, disclose dependency consequences and migration impact, atomically write only the policy file, and record reasoned fingerprint-bound waivers; missing required implementations block visibly | Edits cascade silently, GateReeve commits policy, stale waivers remain current, N/A and waiver collapse, or unavailable implementations are silently bypassed | Desktop coordinator/renderer tests; atomic-write failure injection; Git diff assertions; protocol waiver/freshness tests; missing-implementation fixtures |
| R4 | Compact state-specific module UI | The fixed rail remains six items; Implementing and Finalizing reveal their correct shared module graph and standard detail; empty finalization stays absent; keyboard and screen-reader behavior remains usable | Modules lengthen the rail, appear under the wrong state, require custom UI code, hide blocking state, or regress accessibility | Renderer DOM and accessibility tests; graph fixtures for both slots; packaged-app runtime walkthrough and screenshots at supported sizes |
| R5 | Explicit run adapters and isolated task terminals | Skill and manual actions remain explicit; commands never autostart, require correct local authorization, invalidate detectable changed inputs, run in dedicated task sessions, preserve the user shell, and retain bounded attributable attempts | Viewing or polling executes work, authorization crosses the wrong repo/version, commands enter the user shell, or cancellation/timeout/output cannot be attributed | Run-adapter and authorization-store unit tests; changed-digest/clone/worktree negative tests; PTY integration tests; packaged-app interactive runtime evidence |
| R6 | Command-result semantics and provider protocol | Command outcomes follow the specified exit/cancel rules; providers are allowlisted out-of-process JSON peers; malformed, unavailable, stale, duplicate, crashed, and timed-out cases fail closed; verified terminal evidence alone records through the core | Structured output overrides process failure, repository code loads as a provider, live progress is treated as passage, or a provider can append stale/invalid evidence | Process-result matrix; stdio contract and process-supervision tests; adversarial provider fixtures; protocol journal/replay/fingerprint tests |
| R7 | Generic finalization semantics | Required finalization modules block completion until current and nonblocking; stage progress remains observational; feature waivers stale correctly; projects with no module complete normally; core has no release-specific state | Completion bypasses a required module, an intermediate state passes, a waiver survives changed merge input, an empty project is blocked, or generic core requires release concepts | Feature lifecycle scenarios with zero, command, manual, provider, waived, failed, stale, and unavailable finalization modules; model contract inspection |
| R8 | GateReeve Release verified end to end | `gatereeve/release` and `gatereeve/release-conductor` expose the canonical conductor state and pass only for terminal COMPLETE evidence containing the feature merge; one release can satisfy multiple contained features; a real release completes publication and install/smoke proof | Naming or status diverges, nonterminal/divergent/expired/wrong-source evidence passes, a contained feature is not recognized, or the real release lacks required retained evidence | Release-provider unit and adversarial discovery tests; Git ancestry tests; hosted conductor run and artifact chain; public release/Cask receipts; Apple Silicon and Intel-or-Rosetta install and launch evidence |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
