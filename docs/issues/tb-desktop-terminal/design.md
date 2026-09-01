# Design - tb-desktop-terminal

**Status:** approved (gate passed 2026-08-31)

## Problem

GateReeve Desktop can inspect a selected worktree and its governed workflow,
but a user who wants to act on that work must move to a separate terminal.
That context switch weakens GateReeve's usefulness as a workspace and makes it
less convenient to drive an agentic workflow while observing its state.

The missing capability is an ordinary interactive terminal, not a new agent
orchestration layer. GateReeve should let the user run a shell, development
tools, or a software agent without claiming ownership of those tools or
turning their output into workflow evidence.

## Intent

Add a simple, user-controlled terminal to GateReeve Desktop. It should feel
like the bottom terminal panel in established development harnesses: available
beside the current workflow UI, directly controlled by the user, and bound to
the selected saved project's worktree.

The initial feature deliberately stops at terminal capability. The user
decides what to run. GateReeve does not launch or manage named agent products,
compose prompts, own agent lifecycle state, preserve transcripts, or provide
resume semantics.

## Chosen shape

### Panel and interaction

- Add a terminal-panel layout button between the existing left-sidebar and
  right-inspector buttons in the masthead. Its outlined-window icon has a
  horizontal bottom division, and its accessible label and pressed state track
  panel visibility.
- Reveal a vertically resizable bottom panel while keeping the workflow view
  and inspector available above it. Persist the last panel height as a
  device-local preference.
- Toggle the panel with Command+J on macOS and Control+J elsewhere. Every
  application launch starts with the panel closed; opening it is the explicit
  action that authorizes creation of the first shell.
- Remember panel visibility separately for each project during the current
  application lifetime. Switching projects hides neither project's process;
  returning restores that project's prior visibility and session.
- Show a compact header identifying the project and shell. A running session
  offers Terminate. An exited session retains its final buffer and exit status
  and offers Restart.

### Session and shell lifecycle

- Each saved project may own one terminal session, created lazily on first
  reveal and permanently rooted in that project's selected worktree. A live
  session is never retargeted when project selection changes.
- Start the operating-system account's configured login shell in an interactive
  PTY. Normal login-shell startup establishes the environment; GateReeve adds
  no agent command, initial prompt, or workflow-specific environment variable.
- Do not offer a shell selector, arbitrary executable setting, tabs, splits,
  session naming, profiles, or multiple sessions in the initial feature. If the
  configured shell is unavailable, leave the failure visible instead of
  silently substituting another shell.
- Sessions belong to the current GateReeve application process. There is no
  detach, adoption, persistence, or reattachment across launches.
- Quitting GateReeve while any terminal is live, or removing a project whose
  terminal is live, presents exactly two choices: cancel without changing
  application/project state, or terminate the affected terminal process
  group(s) and continue. Normal Terminate and application cleanup also target
  the exact session process group so descendant tools and agents are not left
  behind.

### Rendering and process boundary

- Use a browser terminal emulator in the sandboxed renderer, with fitting and
  resize support, and a native PTY implementation in Electron main. The
  intended implementation is `@xterm/xterm` plus its fit addon in the renderer
  and `node-pty` in the main process.
- Electron main owns the terminal registry and derives the working directory,
  configured shell, arguments, and environment from trusted application and
  operating-system state. It gives the renderer opaque session identifiers.
- The preload bridge exposes only narrowly defined create/observe, input,
  resize, terminate, and restart operations. Main validates message shape,
  session identity, ownership, dimensions, and lifecycle state. The renderer
  cannot choose an executable, working directory, environment, or PID.
- Preserve the existing content-security policy, denied navigation, context
  isolation, disabled Node integration, renderer sandbox, and trusted-renderer
  IPC restrictions. These controls limit unintended authority but do not make
  terminal input safe: while a PTY is live, the renderer intentionally has the
  user's shell authority through its keystroke channel.

### Output and workflow separation

- Keep a bounded scrollback buffer only in memory for the application-owned
  session. Do not write terminal contents to preferences, application logs,
  workflow artifacts, checkpoints, handoffs, or Session context.
- Support normal selection and clipboard copy, but provide no transcript or
  Save Output action.
- Treat terminal activity as user-controlled external execution. Commands and
  output do not implicitly advance, authorize, or become evidence for the
  GateReeve workflow protocol; governed passages continue through their
  existing explicit interfaces.

### Supported platforms and evidence

- Ship the terminal in GateReeve's universal macOS application and preserve
  Ubuntu source/runtime support. Linux installers and Windows support are not
  part of this feature.
- Verify a real PTY interaction on Ubuntu and verify the packaged native
  terminal dependency in both macOS architecture slices. Apple Silicon gets
  native packaged runtime evidence.
- Existing hosted native-Intel CI remains the preferred release-quality Intel
  evidence when available. Local/manual Intel-slice testing may run under
  Rosetta on Apple Silicon and must be labeled as translated evidence. If a
  native Intel runner becomes unavailable, that translated check is an
  accepted, explicitly documented limitation rather than a delivery blocker.

## Alternatives considered

- **Managed agent sessions:** Rejected for the initial feature because agent
  launch controls, prompts, lifecycle, transcripts, and resume behavior create
  a separate product layer. A general terminal already permits users to run
  agents and leaves room for later profiles.
- **External terminal only:** Rejected because it preserves the context switch
  the feature is intended to remove.
- **Terminal as a replacement view or separate main tab:** Rejected because the
  workflow and inspector should remain visible while commands run.
- **One global terminal or retargeting on project switch:** Rejected because a
  shell's working state belongs to its project and must not silently move to a
  different worktree.
- **Terminate on every hide or project switch:** Rejected because hiding is a
  layout action, not a process-lifecycle action.
- **Detached or reattached sessions:** Rejected to keep the first lifecycle
  understandable and application-owned.
- **Tabs, splits, profiles, and multiple terminals:** Deferred as expansion
  points; they are unnecessary for a useful first version.
- **Durable transcripts:** Rejected to avoid silently collecting commands,
  secrets, and agent output or confusing terminal output with GateReeve
  evidence.
- **Renderer-selected shell, path, environment, or PID:** Rejected because it
  would turn a renderer compromise into a broader arbitrary-process API than
  terminal input inherently requires.
- **Restoring the panel across application launches:** Rejected because launch
  should not create a shell until the user explicitly reveals the terminal.
- **Rosetta presented as native Intel evidence:** Rejected. Rosetta is an
  acceptable transparent local/manual substitute, not equivalent to a native
  Intel host.

## Constraints

- The feature is implemented only on branch `tb-desktop-terminal` in the
  dedicated `/home/trent/code/tb/gatereeve-desktop-terminal` worktree, based on
  `main` commit `1220138bf4248a72c1717955c4f62e3f1cda0599`.
- The existing file-actions worktree and its changes are outside this feature.
- PTY creation requires an explicit panel reveal; a saved panel height alone
  must never create a process.
- A session's trusted root is the saved project's selected worktree at creation
  and cannot be changed for that live session.
- Closing the application and removing a project cannot proceed past a live
  terminal without the defined warning decision.
- Existing Electron renderer isolation and navigation restrictions cannot be
  weakened to implement the terminal.
- Native PTY packaging must work with the repository's Electron version,
  universal macOS packaging, code signing/notarization flow, and Ubuntu runtime.
- Terminal output remains ephemeral and outside the governed feature record.

## Open risks

- The native PTY addon may require Electron-ABI rebuild and packaging changes,
  architecture-specific validation, and signing/notarization adjustments.
- Login-shell behavior and environment inheritance differ between macOS app
  launches, interactive development launches, and Linux. Runtime tests must
  distinguish intended shell startup from missing-environment defects.
- Process trees can outlive a shell unless termination targets the correct
  process group and cleanup paths cover normal exit, forced termination,
  project removal, window shutdown, and application shutdown.
- Terminal sizing is timing-sensitive across initial reveal, panel dragging,
  project switching, window resizing, and font loading. Incorrect dimensions
  can corrupt full-screen terminal applications.
- Focus, keyboard shortcut conflicts, input-method handling, selection,
  clipboard behavior, screen-reader semantics, and reduced panel sizes need
  application-level verification in addition to unit tests.
- A renderer compromise can issue arbitrary shell input to a live PTY. The
  design intentionally accepts that capability after explicit creation, so
  regression tests around the narrow IPC boundary and existing renderer
  hardening are security-critical.
- Rosetta can validate that the Intel slice launches under translation but
  cannot expose every native Intel hardware or operating-system behavior.

## Changes
