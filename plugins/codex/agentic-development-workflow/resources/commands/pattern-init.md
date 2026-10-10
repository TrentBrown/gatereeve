# Pattern Init

Use this to intentionally create a pattern-review rule scope before extracting,
promoting, auditing, or reviewing rules.

Input:

- Optional target repo, worktree, directory, or file path.
- If no argument is provided, use the current working directory as the target.

Procedure:

1. Load and follow the `pattern-init` skill.
2. Run the deterministic helper:
   `python3 "<plugin-root>/resources/scripts/pattern_tool.py" init <target>`.
3. Create `<target>/.pattern-review/` when it does not already exist. If the
   target is a file, create the directory beside that file.
4. Create missing lifecycle files without overwriting existing files:
   `rules.yaml`, `proposals.yaml`, `deferred.yaml`, and `rejected.yaml`.
5. Create `.pattern-review/README.md` when missing.
6. Report which files were created and which already existed.

Output:

- Initialized `.pattern-review/` directory
- Empty YAML lifecycle files ready for `pattern-extract` and `pattern-promote`
