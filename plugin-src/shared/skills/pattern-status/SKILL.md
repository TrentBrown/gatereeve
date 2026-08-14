---
name: pattern-status
description: "Inspect pattern-review scope health, lifecycle bucket counts, parse/audit findings, promotion packets, harvest state, and suggest the next pattern command without mutating files."
---

# Pattern Status

## Portable Resource Root

Resolve `<plugin-root>` from the real path of this `SKILL.md`: it is the parent
directory of `skills/`. Replace the placeholder before opening files or running
commands, and quote the resolved path.

Use this when the user asks for pattern-review state, health, what exists in a
scope, or what pattern command should run next.

This is read-only. Do not modify `.pattern-review/`, proposal buckets,
`rules.yaml`, or harvest artifacts.

Deterministic helper:

```bash
python3 "<plugin-root>/resources/scripts/pattern_tool.py" status \
  <repo> \
  --include-descendants \
  --out /tmp/pattern-status-<target-name>/status.md
```

For slash-command use, prefer this simple form:

```text
/pattern-status <repo-or-worktree-path>
```

Interpret that as "discover applicable scopes under this path, write Markdown
and HTML reports, open the HTML report in the in-app browser when available,
and present the HTML report as the primary artifact." If the user does not
specify an output path, use a stable temp location such as
`/tmp/pattern-status-<target-name>/status.md`.

Explicit scope:

```bash
python3 "<plugin-root>/resources/scripts/pattern_tool.py" status \
  --pattern-dir <repo>/.pattern-review
```

Include a harvest output directory:

```bash
python3 "<plugin-root>/resources/scripts/pattern_tool.py" status \
  --pattern-dir <repo>/.pattern-review \
  --harvest-dir <harvest-output-dir>
```

Write Markdown and HTML reports:

```bash
python3 "<plugin-root>/resources/scripts/pattern_tool.py" status \
  --cwd <repo> \
  --out docs/issues/<branch>/pattern-status.md
```

When `--out` is provided, the helper writes the Markdown path and a sibling
`.html` file. The JSON output includes both report paths.

After generating an HTML report, open that file in the in-app browser when
browser-control capability is available. Do not make `pattern_tool.py` launch
GUI applications directly; browser opening is slash-command/agent behavior. If
browser control is unavailable, return the absolute HTML path or a clickable
local-file link.

Report:

- `.pattern-review` scope paths.
- Bucket counts for `rules`, `proposals`, `deferred`, and `rejected`.
- YAML parse failures.
- Active rule shape failures.
- Duplicate IDs across lifecycle buckets.
- Promotion packet presence.
- Harvest state high-water timestamp and seen-comment count, when available.
- Suggested next command.

Suggested next command mapping:

- No scope: `pattern-init`.
- Parse or rule-shape findings: `pattern-audit`.
- Proposals exist: `pattern-promote`.
- Active rules exist: `pattern-review`.
- Empty scope: `pattern-extract` or `pattern-harvest`.
