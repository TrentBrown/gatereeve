# Interview - tb-desktop-terminal

**Feature start:** 2026-08-31
**Status:** complete

Working design notes captured during the Grill Me interview. This file is the
primary design-phase artifact before `design.md` exists. Capture settled
answers, draft contracts, examples, rationale, and important open questions as
the interview progresses.

Update this file after each settled decision or other high-value design
clarification.

This file is the output of Grill Me and the input to the Design step. It is
not a substitute for `design.md`; it is the source material from which
`design.md` is synthesized.

## D1 - Add the terminal to GateReeve Desktop

**Question:** Is the proposed terminal part of PortReeve or GateReeve, and what
product purpose should it serve?

**Answer:** GateReeve. The terminal is useful in its own right and should let a
user drive the software agentic workflow from inside GateReeve when desired.

**Decision:** Add the terminal to GateReeve Desktop. It should coexist with the
selected worktree's workflow inspection so a user can run development tools or
an agent while observing the governed workflow. PortReeve is not part of this
feature.

## D2 - Begin with a user-controlled terminal

**Question:** Should GateReeve merely provide a terminal capable of running
agents, or should it launch and manage Codex or Claude as product-level agent
sessions?

**Answer:** Keep the initial feature simple: provide the user-controlled
terminal that can run agents.

**Decision:** The initial feature provides a general interactive terminal. The
user chooses what to run. GateReeve does not add agent-specific launch buttons,
prompts, lifecycle state, transcript ownership, resume behavior, or managed
agent sessions. Agent launch profiles remain a possible later feature rather
than part of this design.

## D3 - Isolate the feature from current work (meta/workflow)

**Question:** Should this work share the active Desktop file-actions branch or
start independently?

**Answer:** Give the terminal its own topic branch and worktree, branched from
`main`, and proceed there.

**Decision:** The governed feature ID and first delivery branch are
`tb-desktop-terminal`. Its worktree is
`/home/trent/code/tb/gatereeve-desktop-terminal`, created from current `main` at
`1220138bf4248a72c1717955c4f62e3f1cda0599`. The existing file-actions worktree
and uncommitted changes remain outside this feature.

## D4 - Keep one live terminal session per saved project

**Question:** Should the terminal be one global session, terminate on project
switches, or remain bound to each saved project?

**Answer:** Use the proposed project-bound session model.

**Decision:** Each saved project may own one terminal session created on
demand and rooted permanently in that project's selected worktree. Switching
projects hides but does not terminate the prior project's session; returning
restores it. GateReeve never retargets a live terminal to another worktree.

## D5 - Use the conventional bottom-panel layout control

**Question:** Should the terminal replace a main view or remain simultaneously
visible with the workflow, and how should the user expose it?

**Answer:** Keep the workflow and terminal visible together. Follow the
convention used by other development harnesses: add a bottom-panel button
between the existing left-sidebar and right-sidebar controls, using the
provided reference icon, and use it to expose or hide the terminal at the
bottom of the window.

**Decision:** GateReeve adds a third masthead layout button ordered between
`toggle-sidebar` and `toggle-inspector`. Its icon is the familiar outlined
window with a horizontal bottom division shown in the supplied reference. The
button's pressed state and accessible label report terminal-panel visibility.
It toggles a vertically resizable bottom panel while leaving the selected
workflow and inspector available above it. Hiding or collapsing the panel does
not stop its project's live terminal session.

## D6 - Keep terminal processes application-owned

**Question:** Should live terminals detach or be reattached across application
lifetimes, or remain owned by the current GateReeve process?

**Answer:** Use the proposed application-owned lifecycle without detachment or
reattachment.

**Decision:** Initial terminal sessions live only for the current GateReeve
process. Quitting GateReeve or removing a saved project while its terminal is
live must warn the user and offer exactly two outcomes: cancel and leave the
application/project unchanged, or terminate the exact terminal process group
and continue. GateReeve does not detach, adopt, persist, or reattach terminal
processes across launches.

## D7 - Launch the account login shell without GateReeve injection

**Question:** Which shell and environment should the terminal start with?

**Answer:** Use the proposed account login-shell contract.

**Decision:** GateReeve starts the operating-system account's configured login
shell as an interactive PTY rooted in the saved project's selected worktree.
Normal shell startup files establish the user's development environment, which
is especially important for a Finder-launched macOS application. GateReeve
injects no agent command, initial prompt, or workflow-specific environment
variables. The first version has no shell selector or arbitrary executable
setting; an unavailable configured shell fails visibly rather than silently
running an unrelated shell.

## D8 - Keep terminal output bounded and ephemeral

**Question:** Should terminal output become durable GateReeve data or remain
temporary terminal scrollback?

**Answer:** Use the proposed bounded, memory-only output contract.

**Decision:** Terminal scrollback is bounded and retained only in memory for
the current application-owned session. GateReeve never writes it to
preferences, logs, workflow artifacts, checkpoints, handoffs, or Session
context and provides no automatic transcript or Save output action. Ordinary
terminal selection and clipboard copying remain available. When the shell
exits, the final buffer and exit status remain visible until the user explicitly
restarts the terminal.

## D9 - Use one lazily created shell and minimal panel controls

**Question:** How should the one-terminal limit behave when the panel first
opens, while it is running, and after it exits?

**Answer:** Use the proposed minimal single-session control model.

**Decision:** The first reveal of a project's bottom panel lazily creates that
project's shell and focuses terminal input. Later toggles show or hide the same
session. A compact header identifies the project and shell. A live session has
one explicit Terminate action for stuck processes; an exited session shows its
exit status and one Restart action. Initial scope excludes terminal tabs,
splits, naming, profiles, and additional-session controls.

## D10 - Accept explicit renderer-to-shell authority while a PTY is live

**Question:** Is it acceptable that a renderer able to send terminal
keystrokes necessarily has the user's shell authority for that live session?

**Answer:** Yes; accept that boundary with the proposed containment.

**Decision:** A live terminal is an intentional user-authorized execution
surface, not a sandbox. GateReeve still requires a user action before creating
the first PTY, keeps shell and saved-project path selection in Electron main,
and exposes only opaque session IDs with strictly validated input, resize,
terminate, and restart operations. The renderer cannot supply an executable,
working directory, environment, or process identifier. Existing CSP,
navigation denial, context isolation, Node integration denial, and renderer
sandboxing remain mandatory, but the product does not claim those controls make
terminal input harmless.

## D11 - Preserve macOS and Ubuntu scope with a transparent Rosetta exception

**Question:** Which platforms require terminal runtime evidence, and may
Rosetta substitute when the user has no Intel Mac for manual testing?

**Answer:** Keep the proposed macOS and Ubuntu boundary, but accept Rosetta as
the available local/manual x86_64 substitute. Preserve native Intel hosted
evidence when it is available.

**Decision:** The shipped feature targets GateReeve's universal macOS
application, and existing Ubuntu source/runtime support remains intact with a
real PTY integration smoke. Linux installers and Windows are out of scope.
Apple Silicon receives native packaged verification. Local/manual x86_64
verification may run the Intel application and native-addon slices under
Rosetta on Apple Silicon and must be labeled translated evidence. Existing
native Intel hosted CI remains release-quality evidence while available; if
that runner becomes unavailable, Rosetta may be recorded transparently as the
accepted feature limitation rather than blocking delivery.

## D12 - Persist geometry, not launch-time terminal visibility

**Question:** Should the terminal use Command+J on macOS and Control+J
elsewhere, remember the last panel height as a device-local preference, start
closed on every application launch, and restore each project's panel visibility
only while the application remains open?

**Answer:** Yes.

**Decision:** The terminal panel toggles with Command+J on macOS and Control+J
elsewhere. GateReeve stores the last terminal-panel height as a device-local
preference, but each application launch starts with the terminal closed so no
shell is created without an explicit user reveal. During that application
lifetime, each project remembers whether its panel is open; returning to a
project restores that visibility and its existing terminal session.

## Closing summary

### Solid

- This is a general, user-controlled terminal in GateReeve Desktop, not a
  managed agent-session product.
- The terminal is a lazily created, project-bound, application-owned PTY shown
  in a resizable bottom panel alongside the existing workflow UI.
- The launch, lifecycle, output-retention, security boundary, panel controls,
  keyboard behavior, and cross-platform verification expectations are settled.
- Terminal execution remains separate from GateReeve workflow evidence: output
  is ephemeral and terminal commands do not implicitly mutate protocol state.

### Still risky

- A native PTY dependency must be packaged, signed, and verified for both
  slices of the universal macOS application without regressing Ubuntu runtime
  support.
- Process-group termination, resize behavior, shell startup, focus, clipboard,
  and accessibility need runtime tests because platform and Electron behavior
  can differ.
- Renderer compromise while a PTY is live carries deliberate shell authority;
  the narrow main-process API reduces exposure but cannot remove that inherent
  capability.

### Unresolved

- No product decision remains open for the initial feature. Exact dependency
  versions, implementation file boundaries, and test mechanics belong in the
  specification and implementation plan after the design gate.
