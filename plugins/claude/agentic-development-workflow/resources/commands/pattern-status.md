# Pattern Status

Use this to inspect the current pattern-review scope without changing files.
It answers what pattern-review state exists here and what command is likely
next.

Input:

- Optional target repo or worktree path.
- Optional explicit `.pattern-review` directory.
- Optional harvest output directory containing `harvest-state.json`.
- Optional output path for a Markdown report. HTML is written beside it.

Procedure:

1. Load and follow the `pattern-status` skill.
2. If the user provided a `.pattern-review` path, inspect it explicitly.
3. Otherwise run scope discovery from the target repo or current directory,
   including descendant `.pattern-review` directories. This lets a single
   worktree path find nested scopes such as `client/.pattern-review` and
   `webservices/.pattern-review`.
4. Unless the user explicitly asks for JSON only, write a human-readable report
   by default. Use a stable temp path when the user does not provide one, such
   as `/tmp/pattern-status-<target-name>/status.md`, and show the sibling HTML
   report as the primary output.
5. Run the deterministic helper:

   ```bash
   python3 "<plugin-root>/resources/scripts/pattern_tool.py" status \
     <repo> \
     --include-descendants \
     --out /tmp/pattern-status-<target-name>/status.md
   ```

   For explicit paths:

   ```bash
   python3 "<plugin-root>/resources/scripts/pattern_tool.py" status \
     --pattern-dir <repo>/.pattern-review \
     --harvest-dir <harvest-output-dir> \
     --out /tmp/pattern-status-<target-name>/status.md
   ```

   To write human-readable reports:

   ```bash
   python3 "<plugin-root>/resources/scripts/pattern_tool.py" status \
     --cwd <repo> \
     --out docs/issues/<branch>/pattern-status.md
   ```

6. Summarize:
   - discovered `.pattern-review` scopes;
   - lifecycle bucket counts;
   - parse or audit findings;
   - promotion packet presence;
   - harvest state, when present;
   - suggested next command.
7. Open the generated HTML report in the in-app browser when browser-control
   capability is available. If browser control is unavailable, return a
   clickable local-file link or the absolute HTML path.
8. Do not mutate `.pattern-review/`, harvest outputs, or rules.

Output:

- Read-only status summary
- Suggested next command
- Markdown report by default
- HTML report beside the Markdown report by default
- HTML report opened in the in-app browser when available
