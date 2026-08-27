# Verification - PR #5

**Scope:** Slice 3, P6-P7 (`desktop-workflow-experience`)
**Pinned diff:** `1b816b3879731acf3d1ec169e5934da5c4c62a13..35ddefbc6be58531e54aed25250b5895b12399b3`
**Result:** PASS for the delivery slice

## Verification matrix

| Category | Result | Exact command and evidence |
|---|---|---|
| Build/package | PASS | `npm pack --dry-run --json` in `apps/desktop`: 46 intended runtime files, 73,907-byte package / 315,794 bytes unpacked; visual fixture and tests are excluded |
| Syntax/lint/format | PASS | `find apps/desktop/main apps/desktop/renderer -type f -name '*.js' -print0 \| xargs -0 -n1 node --check`; `node --check apps/desktop/preload/index.cjs`; `git diff --check 1b816b3879731acf3d1ec169e5934da5c4c62a13..35ddefbc6be58531e54aed25250b5895b12399b3` |
| Unit and DOM tests | PASS | `npm run check --prefix apps/desktop`: 29/29 pass, including state/readiness presentation, artifact viewers, complete history/model views, Session containment and refresh, exact HTML protocol, IPC allow-list, diagnostics, and window restrictions |
| Integration tests | PASS | The same suite consumes the real canonical GateReeve feature, renders all views, loads the complete event count, and proves the event journal is byte-for-byte unchanged |
| Canonical staging compatibility | PASS | `node --test cli/test/stage-protocol.test.js`: 2/2 pass; CLI defaults and consumer-specific exact staging remain compatible |
| Repository regression | PASS | Exact head `35ddefb` passed all six Plugin CI jobs: Ubuntu 22.04/24.04 acceptance, container, and Desktop contract. Three exact-head runs completed successfully; Cloudflare Pages also passes. |
| Browser/minimum layout | PASS | Production renderer plus the visual fixture was inspected in the collaborative browser at 1280x800 and 760x560. All five views were navigable; the six-state rail and 10 boundary gates rendered; at 760x560 the layout had no horizontal overflow and collapsed to a usable single column. |
| Application runtime | PENDING MANUAL | `GATEREEVE_DESKTOP_SMOKE=1 npm start --prefix apps/desktop` reaches Electron but this NUC lacks `libatk-1.0.so.0`. Supported Ubuntu/macOS runtime proof remains assigned to P8. |

## Deterministic document checks

- `validate_branch_docs.py docs/issues/gatereeve-desktop` - PASS, with the expected pre-triage warning for two decisions.
- `lint_issues.py docs/issues/gatereeve-desktop` - PASS.
- `lint_tracker.py docs/issues/gatereeve-desktop` - PASS.
- `gate_triage.py` remains intentionally pending until the decision-triage gate.

## Focused behavior evidence

- The overview derives the feature rail from the pinned model, identifies feature/slice position, presents milestones, all delivery slices, attempt history, dependency-bearing gate cards, blockers, source distinctions, and exact copyable commands.
- The artifact view uses the canonical complete inventory and lazy named reads. Markdown is rendered as DOM, JSON and JSONL are rendered from canonical structured values, text is preserved, and trusted HTML is served unchanged through `gatereeve-artifact://desktop/<artifact-id>`.
- The complete journal and pinned model load lazily; event payloads, actor/passage data, exact IDs, grouped model nodes, transitions, provenance, migration impact, and Mermaid source remain inspectable.
- Session context is a separate exact allow-list: `CHECKPOINT.md`, `.checkpoints/*.md`, and regular files under `.handoffs/`. Symlink escapes and symlinked allow-list directories are refused, non-Markdown checkpoint files are excluded, and refresh invalidates the optional Session inventory without changing workflow evidence.
- The preload/IPC inventory contains no workflow mutation, arbitrary path, shell command, agent launch, CLI execution, or generic process-execution channel.

## Known unrelated/local-environment failures

- The broad local CLI suite passes 104/105 tests. Its sole failure is `spawn unzip ENOENT` in the offline marketplace ZIP test because this NUC has no `unzip` executable. The failure is unrelated to the Desktop diff.
- Python bytecode generation must be disabled while running the broad suite in this source tree; otherwise its release-composition guard correctly rejects the generated transient `plugin-src/shared/resources/scripts/__pycache__`. The generated cache was removed and the final 104/105 run used `PYTHONDONTWRITEBYTECODE=1`.

## Manual verification retained for P8

On supported Ubuntu and macOS hosts, launch with `npm start --prefix apps/desktop` and verify native focus behavior, screen-reader announcements, keyboard focus order, direct explain-diff interaction, and minimum-size use in the real Electron window. P8 owns those supported-platform and accessibility-hardening checks, so R8 remains `NOT YET`.
