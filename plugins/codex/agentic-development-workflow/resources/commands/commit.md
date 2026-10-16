# Commit

Use when the user asks to commit or when a workflow boundary requires a commit.

1. Inspect `git status --short --branch`.
2. Inspect the relevant diff. Do not include unrelated user changes.
3. Confirm the branch is not protected unless it is an allowed repo exception
   or the user explicitly directs it.
4. For specced work, confirm workflow docs are current:
   - `issues.md` status reflects the work.
   - `tracker.md` reflects criteria movement when at a boundary.
   - `scratchpad.md` has decision entries for triggered decisions.
5. Run required verification or clearly report why verification is blocked.
6. Stage only intended files.
7. Commit with a concise imperative message. Prefer conventional prefixes when
   the repo uses them.
8. Report commit SHA, files included, and verification performed.

Never use destructive git commands to clean up the worktree unless the user
explicitly asks.
