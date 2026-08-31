# Spec - tb-desktop-terminal

**Feature:** `tb-desktop-terminal`
**Created:** 2026-08-31

## Summary

GateReeve Desktop must provide one user-controlled interactive terminal per
saved project in a conventional resizable bottom panel. A terminal starts only
after an explicit reveal, runs the account's configured login shell in the
project's selected worktree, remains alive while hidden or while another
project is selected, and remains owned by the current application process.

GateReeve supplies terminal capability only. It does not manage agents,
preserve terminal transcripts, or treat terminal commands or output as
workflow passage or evidence.

## Definition of Done

The global Definition of Done in the software development workflow applies.

## Acceptance Criteria

- **AC1.** **Panel discovery, layout, and persistence.** For a selected saved
  project, a terminal layout button appears between the project-sidebar and
  inspector buttons, uses the outlined-window-with-bottom-division convention,
  and reports its state through its accessible label and `aria-pressed`. The
  button and Command+J on macOS or Control+J elsewhere toggle a vertically
  resizable bottom panel without hiding the workflow view or inspector. The
  last valid panel height survives application relaunch as a device-local
  preference, but every launch starts with the panel closed and no terminal
  process; an invalid stored height is safely clamped or replaced.

- **AC2.** **Trusted, explicit shell creation.** The first reveal for a project
  creates exactly one interactive PTY using the operating-system account's
  configured login shell, with the project's saved worktree as its working
  directory and normal login-shell startup behavior. GateReeve injects no
  agent command, initial prompt, or workflow-specific environment variable.
  The renderer cannot choose the executable, arguments, working directory,
  environment, or process identifier. If the configured shell cannot start,
  the panel stays open and presents an actionable failure without silently
  substituting another shell.

- **AC3.** **Project-bound session continuity.** Hiding a terminal panel or
  selecting another project does not stop the live session. During one
  application lifetime, each saved project remembers its own panel visibility
  and owns at most one session; returning to a project restores the same
  session, scrollback, foreground process, and visibility. A session is never
  retargeted to a different worktree, and projects without a session do not
  acquire one merely by being selected.

- **AC4.** **Interactive operation and explicit controls.** A running terminal
  accepts ordinary keyboard input, renders PTY output, tracks panel/window
  resizing closely enough for full-screen terminal programs, supports normal
  text selection and clipboard copy, and focuses terminal input on first
  reveal. Its compact header identifies the project and shell and exposes one
  Terminate action. When the shell exits or is terminated, the final bounded
  scrollback and exit or signal status remain visible and input is disabled
  until the user chooses Restart; Restart creates a fresh session under the
  same trusted shell and worktree contract.

- **AC5.** **Application-owned process cleanup.** Attempting to remove a project
  with a live terminal, or to quit GateReeve while any terminal is live,
  interrupts the operation with exactly two outcomes: cancel, leaving the
  application/project and terminal unchanged; or terminate the affected exact
  terminal process group(s) and continue. Explicit Terminate, confirmed project
  removal, confirmed quit, abnormal window teardown handled by application
  cleanup, and terminal-manager shutdown do not leave the shell or descendant
  test processes running. GateReeve does not detach, adopt, persist, or
  reattach terminal processes across launches.

- **AC6.** **Narrow terminal authority boundary.** Terminal communication is
  available only to the trusted GateReeve renderer through a context-isolated
  preload API with validated create/observe, input, resize, terminate, and
  restart operations and opaque session identifiers. Invalid identifiers,
  payload types, extra fields, oversized input, out-of-range dimensions,
  cross-project access, and commands in the wrong lifecycle state fail closed
  without affecting another session. Existing renderer sandboxing, disabled
  Node integration, content-security policy, navigation/window denial,
  permission denial, and webview denial remain effective.

- **AC7.** **Ephemeral output and workflow separation.** Terminal scrollback is
  bounded and exists only in memory for the current application-owned session.
  Terminal input, output, and exit data are not written to preferences,
  application logs, workflow artifacts, checkpoints, handoffs, or Session
  context, and the UI provides no transcript or Save Output action. Running a
  command changes GateReeve workflow state only if that command independently
  uses an existing authorized workflow interface; terminal transport itself
  neither grants passage nor records terminal content as evidence.

- **AC8.** **Supported-platform delivery.** A real interactive PTY smoke passes on
  Ubuntu, including input, output, resize, exit reporting, restart, and process
  cleanup. The signed/notarized universal macOS application contains loadable
  terminal runtime assets for both `arm64` and `x86_64`, and the packaged
  terminal smoke passes natively on Apple Silicon. Native Intel hosted evidence
  remains preferred when available; a local/manual Intel-slice run under
  Rosetta is acceptable only when clearly labeled as translated evidence and
  must not be reported as native Intel verification. Linux installers and
  Windows behavior are not required.

## Rubric

| # | Criterion | Pass | Fail | Evidence |
|---|-----------|------|------|----------|
| R1 | Terminal panel follows the approved layout, toggle, accessibility, resize, and launch-persistence behavior. | Button order/icon semantics, pointer and platform shortcut toggles, simultaneous workspace/inspector layout, keyboard-accessible resizing, persisted/clamped height, and closed/no-process relaunch state all match AC1. | Any control is misplaced or inaccessible; toggling hides required workspace UI; resizing is unusable; height is not safely persisted; or relaunch opens/creates a terminal. | Renderer DOM/accessibility and workspace-state tests, preference migration/normalization tests, and packaged application UI smoke on macOS. |
| R2 | Shell creation is explicit and uses only trusted project/account state. | Instrumented PTY tests prove no spawn before reveal, exactly one spawn on first reveal, configured login-shell invocation, exact saved-project cwd, ordinary startup environment, no GateReeve agent/workflow injection, and visible spawn failure. | A PTY starts without reveal, duplicate PTYs start, spawn values are renderer-controlled, cwd/shell/startup contract is wrong, injected behavior appears, or shell failure is silently replaced/hidden. | Terminal-manager unit tests with a fake PTY adapter plus Ubuntu and packaged macOS runtime evidence capturing shell/cwd/startup markers. |
| R3 | Sessions remain isolated and continuous per saved project. | Multi-project integration tests show hide/switch/return preserves each live process, foreground activity, scrollback, and in-lifetime visibility while unvisited projects remain process-free and no session changes cwd. | Hiding/switching kills or retargets a session, returning creates an unintended replacement, projects share data/processes, or selection alone creates a PTY. | Terminal-manager and renderer integration tests using distinct project markers and long-running child processes. |
| R4 | The terminal supports the required interactive lifecycle and nothing broader. | Runtime and UI tests demonstrate input/output, focus, resize propagation, selection/copy, header identity, Terminate, retained exited buffer/status, disabled exited input, and fresh Restart; no tabs, splits, profiles, naming, multi-session, transcript, or save controls are present. | Core interaction or lifecycle state is incorrect, resize breaks a full-screen probe, exited state is lost/accepts input, restart reuses invalid state, or an excluded control is shipped. | PTY integration test, renderer DOM/accessibility tests, and packaged application smoke with a terminal-size probe. |
| R5 | All application-owned terminal process groups are cleaned up through guarded destructive flows. | Tests with a shell and descendant sentinel prove cancel leaves state/processes intact and each confirmed terminate/remove/quit/cleanup path ends the targeted process groups without affecting other projects; a fresh launch has no reattached sessions. | The warning has other outcomes, cancel mutates state, removal/quit proceeds without confirmation, any descendant survives, an unrelated session is killed, or a session is detached/reattached. | Main-process lifecycle unit/integration tests with fake dialogs and real process-group sentinel checks on Ubuntu and macOS. |
| R6 | The renderer-to-PTY API is narrow, scoped, validated, and preserves existing hardening. | Contract and IPC tests reject every malformed, oversized, out-of-range, cross-project, stale, and wrong-state request; verify opaque identifiers and trusted sender checks; and assert all existing BrowserWindow, CSP, navigation, permission, and webview restrictions. | The renderer can select spawn configuration/PID, access another project's session, malformed traffic reaches the PTY, untrusted senders succeed, or an existing hardening assertion is weakened. | Shared-contract, preload, IPC, terminal-manager, renderer-protocol, and window security tests. |
| R7 | Terminal data remains bounded, ephemeral, and non-authoritative. | Tests exceed the scrollback cap and observe bounded memory behavior; inspect preferences, logs, feature records, checkpoints, handoffs, and Session inventory after distinctive terminal content; and confirm no terminal-content persistence or implicit protocol event occurs. | Scrollback is unbounded, distinctive content is persisted/exposed through forbidden surfaces, a transcript/save feature exists, or terminal transport itself changes workflow state/evidence. | Renderer/terminal state tests, filesystem-diff integration test around a distinctive secret-like marker, protocol journal comparison, and UI control inventory. |
| R8 | The terminal is deliverable on the supported platform matrix. | Ubuntu real-PTY smoke passes; universal package inspection proves required executable/native-addon slices; signed/notarized Apple Silicon package launches and passes terminal smoke; Intel evidence is native-hosted when available or explicitly labeled Rosetta-translated under the approved limitation. | Ubuntu PTY behavior fails, either macOS slice/runtime asset is missing or unloadable, packaged Apple Silicon runtime fails, signing/notarization regresses, or Rosetta evidence is represented as native. | CI logs and artifacts from Ubuntu, universal package verification, Apple signing/notarization checks, native Apple Silicon smoke, and native-Intel or explicitly translated Rosetta report. |

## Changes

Append spec amendments here. Do not remove or weaken original criteria.
