# PR #16 Verification - Guarded direct RC publication

**Scope:** slice
**Base:** `5a69ee81a1838d61a0521e5fa21d54185a4abc1f`
**Evaluated source:** `fb91a03bef9883f78bac21c289e747f7c1d573aa`

## Verification matrix

| Category | Result | Exact command or evidence |
|---|---|---|
| Build / typecheck | N/A | This slice adds interpreted Node.js release orchestration and has no compiled target or static typecheck step |
| Syntax / changed-file checks | PASS | `node --check` on all changed/new CLI source modules and the corrected fixture; `git diff --check 5a69ee81a1838d61a0521e5fa21d54185a4abc1f..fb91a03bef9883f78bac21c289e747f7c1d573aa` |
| Focused publication unit tests | PASS | `node --test cli/test/github-publication.test.js cli/test/coordinated-publication.test.js cli/test/coordinated-release.test.js cli/test/desktop-release-manifest.test.js`: 14 tests passed |
| CLI regression | PASS WITH ENVIRONMENT LIMITATION | `PYTHONDONTWRITEBYTECODE=1 npm test --prefix cli`: 126/127 passed; only the unchanged offline-bundle test fails because this NUC lacks `unzip` (`spawn unzip ENOENT`) |
| Desktop regression | PASS | `PYTHONDONTWRITEBYTECODE=1 npm test --prefix apps/desktop`: 80 tests passed, including staging, update discovery, packaging contracts, renderer integration, and accessibility |
| Website regression | PASS | `npm test --prefix workflow-site`: 4 tests passed, including inactive/trusted manifest presentation and identifier-free fetching |
| Integration / recovery | PASS | Fault tests interrupt every publication surface after remote mutation and prove exact retry; generated-PR tests prove creation, merge, recovery, cleanup, blocked retry, and contaminated-branch rejection |
| Remote preflight behavior | PASS | Tests verify dry-run preflights do not mutate, exact plan SHA-256 is required, immutable files are rehashed, and website reads are fixed, credential-free, redirect-free, time-bounded, and limited to 64 KiB |
| Application runtime | N/A | No application runtime behavior changes in P8; Desktop regression passes and live signed-RC runtime proof belongs to the post-merge exact packet |
| Browser / UI smoke | N/A | No renderer or website UI source changes; existing website and Desktop suites pass |
| Branch-document validation | PASS | `validate_branch_docs.py`, `lint_issues.py`, `lint_tracker.py`, and `gate_triage.py` pass after decision triage |
| Hosted exact-head CI | PASS | Exact-head run [33182578423](https://github.com/TrentBrown/gatereeve/actions/runs/33182578423) passes all 13 checks: both Ubuntu acceptance/container versions, both Ubuntu Desktop contracts/runtimes, macOS source runtime, universal package, and native packaged runtime on Apple Silicon and Intel; Cloudflare Pages also passes |
| Public release mutation | NOT RUN BY DESIGN | No tag, marketplace release, GitHub prerelease, manifest PR, or website update was created. Public proof requires a fresh merged-main packet and separate exact approval. |

## Behavioral evidence

- Trusted preparation seals `SHA256SUMS`, the future `desktop.json`, and the
  pre-publication manifest as immutable, hash-recorded workspace inputs and
  outputs. Ad-hoc records remain nonpublishable.
- The new Commander command requires either read-only `--dry-run` or explicit
  `--confirm`; confirmation additionally requires an approver and the exact
  inspected plan SHA-256.
- All remote preflights run before approval is recorded or any public adapter
  executes. Existing tags, releases, manifests, and deterministic publication
  branches must agree with the approved identity.
- Publication order remains tag, Plugin marketplace, Desktop prerelease,
  update manifest, and production website. The existing release core writes a
  durable receipt after each successful surface.
- Manifest transport uses one deterministic merge-commit PR. Its body binds
  repository, base branch, release, source commit, plan digest, destination,
  file digest, generated commit, and base commit. Extra commits, paths, assets,
  altered metadata, or a missing proof PR are rejected.
- The terminal website check accepts only exact approved manifest bytes at the
  fixed production endpoint, then records their digest and derived tag page.

## Known limitations carried to the release operation

- This PR proves the publication protocol without public mutation. After merge,
  protected CI must create a fresh trusted packet from exact merged `main`; its
  read-only remote dry run and exact user approval precede publication.
- This NUC cannot execute the unrelated offline ZIP inventory assertion because
  `unzip` is absent. Hosted acceptance covers that unchanged path.
- Initial hosted run 33182039410 failed five coordinated-release tests because
  their fixture read `/workspace/workflow-site/releases/desktop.json`, outside
  the container build context. Commit `fb91a03` creates the exact empty manifest
  in each temporary fixture; the focused rerun passes 6/6 and replacement run
  33182578423 passes both container jobs and every other hosted check.
