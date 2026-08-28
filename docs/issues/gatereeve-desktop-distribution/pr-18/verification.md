# PR #18 Verification - Guarded Homebrew Cask distribution

**Scope:** slice
**Base:** `87489313ca97c1f2443aa1d48045538de23ae7e1`
**Evaluated source:** `10a36c25211846dd8d66a017c414ff8d08d4b20e`

## Verification matrix

| Category | Result | Exact command or evidence |
|---|---|---|
| Build / typecheck | PASS | Hosted universal macOS packaging and packaged-runtime jobs pass for Apple Silicon and Intel in run [33191917304](https://github.com/TrentBrown/gatereeve/actions/runs/33191917304) |
| Syntax / changed-file checks | PASS | New Node.js modules parse in the focused suites; `git diff --check 87489313ca97c1f2443aa1d48045538de23ae7e1..10a36c25211846dd8d66a017c414ff8d08d4b20e` |
| Focused Cask unit tests | PASS | `node --test cli/test/homebrew-cask.test.js cli/test/cli.test.js cli/test/context-parity.test.js cli/test/python-guards.test.js cli/test/developer-documentation.test.js`; exact rendering, packet identity, read-only dry run, approval binding, tap creation, generated-PR publication, retry, and tamper rejection pass |
| Desktop regression | PASS | `npm run check --prefix apps/desktop`: 81 tests pass, including the Cask smoke architecture guard |
| CLI regression | PASS WITH LOCAL ENVIRONMENT LIMITATION | `PYTHONDONTWRITEBYTECODE=1 npm test --prefix cli`: 131/132 pass locally; only the unchanged offline-bundle test cannot spawn `unzip` on this NUC. Both hosted Ubuntu acceptance and container jobs pass with that dependency present |
| Release integration | PASS | A packet prepared from trusted coordinated run `33183133044` binds source `117a585`, `v0.1.0-rc.1`, DMG size `246098110`, SHA-256 `9cbe51065692857ba929e153863fa92c8fe2dc4d275eb29453014a04e1f1ea92`, Developer ID identity, notarization, stapling, Gatekeeper, and the direct-install proof; public dry run verifies the exact GitHub release without mutation |
| Native Cask install and upgrade | PASS | Run [33191917383](https://github.com/TrentBrown/gatereeve/actions/runs/33191917383) installs a predecessor Cask from the exact approved DMG, upgrades through the rendered final Cask, and re-verifies bundle identity, code signing, Gatekeeper, and the universal executable on both `macos-15` ARM and `macos-15-intel` |
| Application runtime | PASS | Hosted Plugin CI proves the exact universal package and packaged runtime independently on Apple Silicon and Intel; the direct public DMG was separately installed and launched by the maintainer before this slice |
| Branch-document validation | PASS | `validate_branch_docs.py`, `lint_issues.py`, `lint_tracker.py`, and `gate_triage.py` pass after promoting both decisions |
| Hosted exact-head CI | PASS | All 15 checks pass: two Cask smoke jobs, both packaged runtimes, universal packaging, macOS source runtime, both Ubuntu versions across acceptance/container/Desktop contract/Desktop runtime, and Cloudflare Pages |
| Public tap mutation | NOT RUN BY DESIGN | `TrentBrown/homebrew-gatereeve` remains absent. Creating the public repository and publishing `Casks/gatereeve.rb` require a fresh merged-main packet and separate exact user approval |

## Behavioral evidence

- The generated Cask installs only `GateReeve.app` from the already-published,
  checksum-matched universal DMG. It neither rebuilds the application nor
  installs or upgrades the required Plugin or optional CLI.
- Preparation seals the Cask, source release record, destination, full Apple
  trust evidence, direct-install evidence, and human-readable publication plan.
- Dry-run verifies the public tag, target commit, asset name, byte count, and
  digest and inspects tap state without creating a repository, branch, commit,
  pull request, or release.
- Confirmation requires the exact inspected plan SHA-256, an approver, and an
  explicit confirmation flag. Tap creation is limited to the approved public
  repository identity and fails closed on divergent existing state.
- Publication uses the existing deterministic one-generated-commit pull-request
  transport. Receipts make interruption and exact retry idempotent.
- The smoke workflow uses disposable local taps and refuses to disturb an
  existing GateReeve installation or a pre-existing smoke tap.

## Known limitations carried to the public operation

- This PR proves the mechanism and the actual Homebrew client behavior without
  exercising the separately authorized public mutation. After merge, the packet
  must be regenerated from merged `main`, inspected, and explicitly approved.
- The first hosted attempt exposed a package-boundary error: a CLI container test
  imported a Desktop-only script. Commit `10a36c2` moved the shared pure renderer
  into the CLI module and the architecture assertion into the Desktop suite;
  replacement run 33191917304 passes both containers and every other Plugin CI
  job, while run 33191917383 passes both native Homebrew jobs.
- Python bytecode writes discovered during parallel regression testing could
  contaminate canonical packaged sources. The subprocess environment now sets
  `PYTHONDONTWRITEBYTECODE=1`; source purity and hosted container checks pass.
