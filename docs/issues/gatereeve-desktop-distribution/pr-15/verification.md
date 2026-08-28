# PR #15 Verification - Private update discovery

**Scope:** slice
**Base:** `5b66b98de73eb8946293d509ba08db543edb8626`
**Evaluated source:** `fd9a43e2c31a4cf492848153235268eca16c3e65`

## Verification matrix

| Category | Result | Exact command or evidence |
|---|---|---|
| Build / staging | PASS | `npm test` in `apps/desktop` runs `npm run stage:protocol` before the suite and passed; hosted run [33147485145](https://github.com/TrentBrown/gatereeve/actions/runs/33147485145) built the universal macOS application and DMG |
| Syntax / changed-file checks | PASS | `node --check` on every changed Desktop and website JavaScript file; `git diff --check` |
| Desktop unit tests | PASS | `npm test` in `apps/desktop`: 80 tests passed, including manifest schema, request bounds and timeout, channel selection, cache, notifications, IPC, renderer, and accessibility |
| Website unit tests | PASS | `npm test` in `workflow-site`: 4 tests passed, including unresolved production metadata, Plugin-prerequisite presentation, trust-gated activation, exact GitHub tag navigation, and identifier-free fetch |
| Integration contracts | PASS | Desktop suite exercises main-process coordinator, cache persistence, IPC/preload contracts, renderer integration, and real canonical feature observation; hosted Desktop contract jobs pass on Ubuntu 22.04 and 24.04 |
| User-facing renderer smoke | PASS | Linkedom renderer tests exercise the banner and fixed release action; Cloudflare Pages preview passes; hosted Electron source runtime passes on Ubuntu 22.04, Ubuntu 24.04, and macOS |
| Packaged application runtime | PASS | Hosted run 33147485145 builds one universal DMG and launches the exact mounted bytes on Apple Silicon and Intel after architecture and staged-version inspection |
| Portable workflow regression | PASS | Hosted Ubuntu 22.04/24.04 acceptance and container jobs pass. Local `PYTHONDONTWRITEBYTECODE=1 npm test` in `cli` passed 116/117; the sole local failure is `spawn unzip ENOENT`, an environment-only missing executable that hosted acceptance covers |
| Branch-document validation | PASS | `validate_branch_docs.py`, `lint_issues.py`, and `lint_tracker.py` pass; decision triage is recorded separately at this boundary |
| Public release mutation | N/A | This slice ships an empty production manifest and a hidden website release link. It creates no tag, GitHub release, download, installation, update publication, or public-release approval |

## Focused behavioral evidence

- The Desktop request is fixed to `https://gatereeve.pages.dev/releases/desktop.json`, has no query string, omits credentials and referrer data, rejects redirects, caps the response at 64 KiB, and aborts after 10 seconds.
- Manifest entries must carry exact semantic identity, DMG name/size/checksum, source commit, and six affirmative Apple-trust facts. The manifest contains no URL.
- RC installations accept only a later RC or stable release on the same version line. Stable installations ignore every RC and accept only a later stable release.
- Automatic discovery reuses a persisted result younger than 24 hours. Manual discovery performs a fresh request. All transport and validation failures become a non-disruptive `unavailable` state.
- An available update always produces the in-app banner. Native notification delivery reads the existing opt-in preference and persists the last notified version to avoid repeat delivery across launches.
- The only Desktop action derives the exact official GitHub tag page from a validated version and asks the operating system to open it. No download or installation API exists.
- The website names the Plugin as the required governance system and Desktop as optional. Its checked-in manifest has both channels set to `null`, so the release link remains absent until later publication supplies complete trusted evidence.

## Known limitations carried to later plan steps

- P8 must publish and verify the approved RC, update manifest, and exact website link through the recoverable coordinated release record.
- P10 must perform complete feature verification. R7 therefore remains `NOT YET` despite this P7 slice passing.
