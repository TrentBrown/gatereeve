# GateReeve Plugin Behavioral Smoke Test

Use this optional rollout check after native installation, upgrade, hook, or
protocol packaging changes. It verifies behavior in a disposable repository;
it is not part of an ordinary feature workflow.

## Preconditions

- `workflow-doctor` reports ready in the agent being tested.
- Git, Python 3.10+, Node 22.12+, and GitHub CLI are available.
- The installed plugin is enabled and a fresh agent session can be started.

## Disposable repository

Create a temporary repository and keep its exact path for cleanup:

```bash
SMOKE_ROOT="$(mktemp -d)"
git -C "$SMOKE_ROOT" init -b smoke-feature
git -C "$SMOKE_ROOT" config user.name "GateReeve Smoke"
git -C "$SMOKE_ROOT" config user.email "gatereeve-smoke@example.invalid"
touch "$SMOKE_ROOT/README.md"
git -C "$SMOKE_ROOT" add README.md
git -C "$SMOKE_ROOT" commit -m "Initialize smoke fixture"
```

Open a fresh Codex or Claude Code session in `$SMOKE_ROOT`. Confirm the
SessionStart context reports that no feature record exists and instructs a new
non-trivial feature to initialize governance.

Ask the agent to begin a tiny non-trivial feature with the software development
workflow. Verify that initialization creates these files atomically:

```text
docs/issues/smoke-feature/interview.md
docs/issues/smoke-feature/workflow-model.lock.json
docs/issues/smoke-feature/events.jsonl
```

Ask for workflow status. It should report governed mode, feature state
`DESIGNING`, no active slice, and design approval as the next human-confirmed
passage. The optional CLI, when installed, should agree:

```bash
gatereeve status --cwd "$SMOKE_ROOT"
gatereeve graph --cwd "$SMOKE_ROOT"
gatereeve check governed --cwd "$SMOKE_ROOT"
```

Do not approve the design merely for this installation smoke test. Confirm
that observation did not append events, then remove the disposable repository
using the machine's normal temporary-file cleanup mechanism.

## Pass conditions

- Doctor was ready before the test.
- SessionStart found the correct feature mode.
- The plugin initialized the complete governed record without a PATH CLI.
- Status, graph, and history were internally consistent.
- Read-only observation did not mutate the journal.
- No files outside the disposable repository were changed, apart from normal
  agent/plugin caches.
