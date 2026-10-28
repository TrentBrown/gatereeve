# Pattern Help

Use this to explain the pattern-review command family and help the user choose
the next command. This command is guidance-only; it should not mutate files.

Input:

- Optional topic after the command, such as `workflow`, `harvest`, `promote`,
  or `review`.
- If no topic is provided, show the concise overview.

Procedure:

1. Load and follow the `pattern-help` skill.
2. Treat the first argument after `/pattern-help` as the requested topic.
3. If no topic is provided, explain the command family and the common workflow.
4. If a known topic is provided, answer with that topic's purpose, when to use
   it, main inputs, outputs, and the next likely command.
5. If an unknown topic is provided, show the known topics and ask the user to
   choose one.
6. Do not run pattern-review helpers unless the user separately asks to execute
   a command.

Known topics:

- `workflow` - normal sequence from scope creation to branch review.
- `status` - inspect scopes, bucket counts, rule health, harvest state, and
  the likely next command.
- `init` - create a `.pattern-review/` scope.
- `extract` - turn instruction prose into proposal drafts.
- `harvest` - collect GitHub PR feedback into a complaint corpus and proposal
  drafts.
- `promote` - accept, reject, defer, edit, or skip proposals.
- `review` - run active rules against a branch diff.
- `learn` - explain the deferred normalized learning loop.
- `audit` - explain the deferred rule-health audit.

Examples:

```text
/pattern-help
/pattern-help workflow
/pattern-help harvest
/pattern-help promote
```
