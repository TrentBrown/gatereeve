# Plan - tb-linux-reviewer-bubblewrap

## Strategy

Set a constant PATH in the shared Codex runner argument builder on Linux only. Leave inheritance and all isolation, auth and receipt behavior in place. Sync the desktop mirror.

## Steps

- **P1.** Add the Linux-only config argument to the launcher and update the checked-in desktop mirror. Advances R1 and R2.
- **P2.** Test Linux and non-Linux vectors, scrubbed inheritance, retained isolation and byte equality. Run the relevant GateReeve CLI tests. Advances R1 and R2.
- **P3.** Run disposable aws-1 planning and paired review through the patched code as devbox, inspect the actual helper and receipts, exercise controlled write and network denial, and compare the active T3 PID. Execute a disposable copy of the released plugin with the candidate adapter in place. The installed plugin stays untouched. Advances R3–R5.

Use the user's branch-direction rules. A final PR into main requires specific authorization for the exact PR.
