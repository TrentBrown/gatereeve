# Portable Resource Root

In skill and command documentation, `<plugin-root>` is the parent directory of
the package's `skills/` directory. Resolve it from the real path of the loaded
`SKILL.md`.

Before opening a resource or running a command:

1. Replace `<plugin-root>` with the resolved absolute package path.
2. Quote the full path so installations beneath directories containing spaces
   work correctly.
3. Do not substitute the canonical source checkout, a user's home directory,
   or a platform cache convention.

Platform hook variables such as `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` belong
only in native platform adapters. Shared skill prose uses `<plugin-root>` so it
remains identical in both packages.
