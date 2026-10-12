# S2 pinned-source Verification

P3 completion recovery, scoped portable guidance/API and model/core adoption are implemented locally. Pinned source 7a998a9ad9545f53c3df778d848f72a3399f8050; base ae9bc5a370d95d81f2b7acc8e6f90077087a7514; scope SLICE; attempt s2-pr78-a4. Full checks ran against this same implementation before its source commit. Independent Judge follows; nothing here marks the full feature complete or repairs MyLifeMap's actual journal.

| Category | Command | Result |
|---|---|---|
| Build/package/lint | `PYTHONDONTWRITEBYTECODE=1 bash ci/portable-acceptance.sh` | PASS: Codex/Claude validation/native validation/lint, repeatable package builds, setup/doctor smoke. |
| CLI unit/integration | above: `npm test --prefix cli` | PASS: 340 tests. Recovery cases use real temporary Git merges, accepted review journals, source-bound reports and executed Node fixture contracts. |
| Python | above: three unittest discovery commands | PASS: 28 pattern, 97 scripts, 2 smoke tests. |
| Dependency audit | above: `npm audit --prefix cli --audit-level=high` | PASS: zero vulnerabilities. |
| Desktop build/unit/integration | `PYTHONDONTWRITEBYTECODE=1 npm run check --prefix apps/desktop` | PASS: staged shared protocol, renderer build, 206 tests. |
| Skill entrypoints | isolated temporary Python/PyYAML environment running skill-creator quick_validate.py | PASS: software-development-workflow and workflow-pr-boundary; no repository dependency/default configuration changed. |
| Whitespace | `git diff --check` | PASS. |
| Runtime contract | new recovery integration tests included in CLI suite | PASS: actual plugin-local preflight and optional CLI agree on source identity/blockers, CLI nonzero on rejected preflight, one repeat-safe mutation; finalization remains blocked until required modules pass. |
| Browser/user-facing E2E | N/A | No new screen or UI flow; existing snapshot/action metadata and Desktop host contract suites cover shared presentation. |

Coverage includes explicit/historical whole-feature waiver, multiple accepted merged slices, actual integrated-source proof, wrong source/requirement identity/feature/scope, missing verification category/full-rubric row, corrupt/symlink/empty evidence, missing accepted review, forged integration claims, pause/blocking changes/unresolved delivery, stable identity conflicts, own permitted assessment waivers, human workspace retention, altered replay receipts, old-lock explicit adoption and normal feature-final compatibility. No rejection appends an event. Existing merges are unchanged. Complete still requires configured finalization modules.

Corrected provisional issues: temporary fixture Git hooks inherited the personal main-commit guard (disabled only inside scratch fixtures); initialization ordering needed a nonexistent feature home; the new additive guard catalog required explicit compatibility for older non-capable model locks. Source review closed a flag-only feature-final shortcut while preserving the existing unscoped proposal / actual feature-final review path; actual boundary scope governs recovery. Unsupported recovery targets cannot bypass finalization. All final suites pass without waivers.

Protocol adoption applies only to this in-flight feature under approved P3 authorization. Its retained migration preview reports feature.recovery.validated and recover-finalization added, no guards/transitions removed and no gate/module definitions changed. Source checks still require normal current formal evidence and exact-head human merge authorization.

Fresh retention regression evidence: ignored untracked report, support log and Judge-waiver confirmation each have clean ordinary Git status but reject without append; an unrelated ignored feature record rejects TRACKED. Full portable and Desktop suites reran after the source correction.

Current human-authority contract coverage: observed/historical contexts bind exact whole-feature scope, feature name, selected integration SHA and requirements fingerprint; all retained context bytes are verified. Vague authority, feature-prefix alias, absent scope/context and wrong requirements reject without append. Separate verification waivers and workspace retention use the same binding. Short answers with concrete bound approval prompts and immutable historical contexts pass. Latest full acceptance passes 340 CLI +127 Python tests, 206 Desktop tests and zero audit vulnerabilities.

Durable receipt runtime coverage: resealed missing/malformed/unsafe Judge confirmation, verification/spec support paths, missing/altered/swapped/extra report references and requestIdentity mismatch all reject on replay. Shared preparation/replay validators preserve exact approved requirement descriptors and the canonical four report bindings. Latest complete acceptance passes 340 CLI, 127 Python, 206 Desktop with no waivers.
