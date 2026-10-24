# Host enforcement coverage — verified 2026-10-23

Observed local versions: Codex CLI0.142.4 and Claude Code2.1.299. Official current
[Codex hook documentation](https://learn.chatgpt.com/docs/hooks) and
[Claude hook reference](https://code.claude.com/docs/en/hooks) both document
synchronous PreToolUse rejection using hookSpecificOutput.permissionDecision=deny.
Codex requires trusted hook definitions; installing a plugin is not that trust.
These references establish available capability, not candidate activation.

| Surface / action | Implemented and exercised | Limit |
| --- | --- | --- |
| Codex SessionStart | Existing packaged command/native tests | Guidance; candidate not activated in live host |
| Claude SessionStart | Existing packaged command/native tests | Guidance; candidate not activated in live host |
| Both hosts: direct gh pr merge | Packaged PreToolUse subprocess receives actual host event shapes, consults core and returns supported deny JSON, routes to protected adapter | Recognized direct shell forms only; no full shell parsing or interception of indirect scripts/alternate clients |
| Implementation, acceptance, completion | Same core checks on semantic milestone/decision operations, authorization/source/quality/retention harnesses | Other editing tools and prose are cooperative; no per-commit gate |
| Protected merge execution | Exact PR/head/base/method, direction, proof, human authority, checks and close-on-failure | Actual action through adapter; arbitrary hosted changes outside it remain external |
| Unavailable core at recognized merge | Hook denies; shared core exceptions fail closed | Missing/disabled/untrusted hook itself cannot enforce anything |
| Edits/tests/commits | Hook allows ordinary phase work | Model remains responsible for using planning authority |
| Integration/release observation | Trusted integration proof and read-only Conductor origin/chain/ancestry validation | No publication authority implied |

`current-hook.test.js` executes the canonical packaged hook entry with Codex and
Claude event payloads, blocks an unauthorized direct PR merge, allows tests and
commits, and denies an unavailable context or missing configured feature records. This is subprocess/host-contract smoke,
not a claim of a real model tool event under an installed/trusted plugin. Current
code invokes the core dynamically so unavailable core imports reach denial. Full
adapter action harnesses remain the authority for exact action execution.
