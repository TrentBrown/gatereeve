# Plan - tb-desktop-terminal

**Feature:** `tb-desktop-terminal`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-31

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Build the feature around two explicit seams. A main-process terminal manager
owns every PTY, trusted spawn parameter, lifecycle transition, and process-group
cleanup. A renderer terminal controller owns only terminal presentation,
in-memory view state, and validated calls through the context-isolated preload
bridge. This keeps the inherently powerful keystroke channel narrow without
weakening GateReeve's existing renderer isolation.

Use `node-pty` for the native PTY and `@xterm/xterm` with
`@xterm/addon-fit` for rendering. Serve the browser assets only through
explicit custom-protocol routes. Extend the deterministic macOS staging flow
to include the exact production runtime dependencies and unpack executable or
native PTY assets as required. Verify both macOS architecture paths instead of
assuming the universal Electron shell proves the addon is usable.

Implement a single slice on the existing `tb-desktop-terminal` delivery branch.
Land testable main-process and contract foundations before the renderer panel,
then integrate destructive lifecycle guards, packaging, and real-runtime smoke
coverage. No step adds managed-agent behavior, durable transcripts, multiple
terminal sessions per project, or new workflow-passage authority.

## Steps

- **P1. Establish the terminal dependency and runtime-asset foundation.** Add
  exact locked runtime dependencies for the PTY, terminal emulator, and fit
  addon; add explicit renderer-protocol routes for the browser assets; and
  create deterministic staging helpers that retain only the required runtime
  packages and executable modes. Treat the current stable `node-pty` macOS
  helper-mode defect as a blocking version-selection check rather than hiding
  it in runtime recovery. **Advances:** R2, R4, R6, R8.

- **P2. Implement a testable main-process terminal manager.** Add an injected
  PTY adapter and a registry keyed by canonical saved-project path. Derive the
  account login shell, login arguments, cwd, and base environment in main;
  allocate opaque IDs; model starting/running/exited/failed/terminating states;
  bound retained output; validate input and resize; and implement terminate,
  restart, subscriber cleanup, and exact process-group shutdown. Keep all
  process and output state memory-only. **Advances:** R2, R3, R4, R5, R6, R7.

- **P3. Define and expose the narrow terminal contract.** Extend shared
  contracts, main IPC registration, and the CommonJS preload bridge with
  create/observe, input, resize, terminate, restart, and terminal-event
  operations. Validate exact keys, types, length/dimension bounds, sender,
  project/session ownership, and lifecycle state on both sides. Do not expose
  executable, argument, cwd, environment, or PID inputs. **Advances:** R2, R3,
  R4, R6.

- **P4. Integrate application-owned lifecycle guards.** Route project removal
  and application quit through a reusable confirmation decision with only
  cancel or terminate-and-continue outcomes. Ensure cancel is mutation-free,
  confirmed actions clean descendant process groups, normal shutdown closes the
  terminal manager, and unrelated project sessions remain untouched.
  **Advances:** R3, R5, R6.

- **P5. Extend device and per-project layout state.** Migrate preferences with
  a clamped terminal height but no persisted open state, and extend the
  in-memory workspace store with per-project panel visibility. Preserve the
  invariant that selection, preference loading, and application startup cannot
  create a PTY. **Advances:** R1, R3, R7.

- **P6. Build the bottom terminal panel.** Add the approved middle masthead
  layout button and icon, Command+J/Control+J menu and renderer handling, a
  horizontal keyboard/pointer resizer, compact project/shell header, terminal
  host, failure/exited status, and Terminate/Restart controls. Bind one xterm
  instance to each created project session, fit and resize it across all layout
  transitions, manage focus safely, preserve bounded scrollback while hidden,
  and retain existing workflow/inspector visibility. **Advances:** R1, R3, R4,
  R7.

- **P7. Add deterministic unit and integration coverage.** Test terminal state
  transitions, trusted spawn derivation, project isolation, bounded output,
  malformed/stale/cross-project IPC, lifecycle confirmation, descendant
  cleanup, preferences, workspace visibility, DOM order and accessibility,
  keyboard behavior, resize, exit/restart, excluded controls, forbidden
  persistence, unchanged protocol journal, CSP/navigation hardening, and the
  absence of implicit PTY creation. Use fake PTYs for exhaustive cases and real
  PTY probes for operating-system behavior. **Advances:** R1, R2, R3, R4, R5,
  R6, R7.

- **P8. Make packaging and platform evidence terminal-aware.** Extend the
  macOS package contract and verifier for staged terminal dependencies,
  unpacked native/executable assets, both `darwin-arm64` and `darwin-x64`
  runtime paths, code-signing/notarization coverage, and packaged terminal
  smoke. Extend Ubuntu runtime CI with real PTY input/output/resize/exit/restart
  and process-cleanup evidence. Preserve native Intel hosted verification when
  available and provide an explicitly translated Rosetta-only manual evidence
  path without weakening the native verifier. **Advances:** R2, R4, R5, R6,
  R8.

- **P9. Run full verification and reconcile evidence.** Run dependency install,
  the complete Desktop test suite, lint/format checks applicable to changed
  files, Ubuntu runtime smoke where available, macOS packaging and package
  verification on available hardware/CI, and focused manual accessibility and
  terminal interaction checks. Evaluate every rubric row from evidence and
  document any unavailable native-host check exactly. **Advances:** R1, R2, R3,
  R4, R5, R6, R7, R8.

## Verification

- Unit tests isolate pure contract, manager, preference, and workspace-state
  behavior from Electron and native PTY processes.
- Main/renderer integration tests exercise the actual preload contract and DOM
  behavior with controlled terminal events.
- Real PTY probes use distinctive cwd/environment/output markers, terminal-size
  reporting, an interactive child, and a descendant sentinel so behavior and
  cleanup are observable rather than inferred.
- Privacy verification compares preferences, logs, governed feature records,
  protocol events, checkpoints, handoffs, and Session inventory before and
  after a distinctive terminal marker.
- Package verification inspects the exact DMG/application bytes and launches
  the packaged terminal path on supported macOS runners.
- **Final step:** Run full rubric evaluation and produce the completion report.
