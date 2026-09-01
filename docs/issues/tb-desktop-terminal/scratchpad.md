# Decision Scratchpad - tb-desktop-terminal

**Feature start:** 2026-08-31

Working record of decisions made during this feature's lifetime. Append entries
across delivery branches and sessions. Triage at each PR boundary; promoted
entries are appended to `decisions.md`.

## [1] Pin xterm packages and the fixed node-pty beta

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Desktop dependency graph, native installation, renderer
assets, Ubuntu runtime, and macOS packaging.

Pin `@xterm/xterm` 6.0.0, `@xterm/addon-fit` 0.11.0, and
`node-pty` 1.2.0-beta.15 exactly in the Desktop lockfile. The current stable
`node-pty` 1.1.0 tarball ships its macOS `spawn-helper` without the executable
bit; the selected beta contains executable helpers and both macOS architecture
prebuilds. Recheck the stable tag before merge and move to a fixed stable
release if one exists and passes the same package/runtime tests. Do not add a
runtime self-healing chmod path.

**Triggered by:** The required PTY dependency change and inspection of current
npm package contents during planning.

**Alternatives considered:**

- `node-pty` 1.1.0 plus postinstall or runtime chmod - rejected because it
  obscures a known upstream packaging defect and can fail under install modes
  that suppress scripts.
- An unrelated prebuilt fork - rejected because the approved design chose the
  maintained upstream package and Windows prebuild breadth is irrelevant to
  this feature.
- A custom PTY binding - rejected as unnecessary native surface area.

## [2] Keep PTY ownership and spawn configuration in Electron main

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Shared contracts, preload API, main IPC, terminal manager,
renderer controller, security tests, and all live terminal sessions.

Electron main owns a per-project terminal registry and derives the shell,
login arguments, cwd, environment, and process lifecycle from trusted saved
project and operating-system state. The renderer receives opaque session IDs
and may only observe, write input, resize, terminate, or restart a session it
owns. Both preload and main validate exact request/response/event shapes and
lifecycle state. The intentional keystroke channel retains shell authority,
but no general renderer-selected process API is introduced.

**Triggered by:** A new security-sensitive renderer-to-main API contract.

**Alternatives considered:**

- Spawn `node-pty` from the renderer - rejected because Node integration and
  renderer sandboxing must remain intact.
- Let the renderer provide executable, cwd, env, or PID - rejected because it
  expands compromise authority beyond the terminal session selected in main.
- Use project paths as session IDs - rejected because paths disclose trusted
  routing state and make cross-project confusion easier.

## [3] Stage explicit terminal assets and verify both macOS runtime paths

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Renderer custom protocol, package staging, ASAR layout,
universal merge, signing/notarization, package verifier, and release CI.

Serve only an allowlisted xterm JavaScript/CSS asset set through the existing
`gatereeve-app` protocol. Extend deterministic package staging to include the
exact production dependency trees and preserve executable modes. Keep
`node-pty` native binaries and `spawn-helper` outside ASAR where required, and
configure universal packaging so architecture-specific paths are not
incorrectly merged. Package verification must inspect and load both macOS PTY
paths; Electron's universal executable alone is insufficient evidence.

**Triggered by:** Native dependency packaging plus the existing staged-source
and universal-macOS architecture.

**Alternatives considered:**

- Expose all of `node_modules` through the renderer protocol - rejected as an
  unnecessary expansion of renderer-readable code.
- Commit copied/minified xterm distributions into `renderer/` - rejected in
  favor of exact lockfile-owned assets and explicit routes.
- Leave native assets inside ASAR without runtime proof - rejected because the
  helper must be executable and architecture selection must be verified.

## [4] Permit terminal geometry styles without relaxing script policy

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Desktop application CSP, xterm rendering, renderer-protocol
tests, and review of renderer compromise boundaries.

Keep `default-src 'none'`, `script-src 'self'`, and external stylesheet loading
restricted to `self`, while adding the CSP Level 3 `style-src-attr
'unsafe-inline'` directive for runtime-computed element dimensions. Xterm and
GateReeve's resizable regions set measured width and height through DOM style
attributes; this exception permits those geometry updates without permitting
inline scripts, inline style elements, external origins, network connections,
objects, or forms.

**Triggered by:** Integrating xterm's dynamically measured terminal geometry
under the existing strict custom-protocol CSP.

**Alternatives considered:**

- Add general `style-src 'unsafe-inline'` - rejected because it needlessly
  broadens both style elements and attributes.
- Disable CSP for vendor terminal assets - rejected because every application
  response should retain the same confinement headers.
- Replace xterm's dynamic layout machinery - rejected because it would fork a
  security-sensitive terminal renderer for no product benefit.

## [5] Terminate the captured descendant tree as well as the PTY group

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Explicit termination, project removal, application quit,
terminal-manager shutdown, and supported POSIX hosts.

Before signaling a PTY group, capture the exact descendant PID tree using the
fixed `/bin/ps -axo pid=,ppid=` interface. Signal the PTY process group and
then each captured descendant from deepest to shallowest. Interactive shells
can assign a background job to a separate process group, so signaling only
the shell's group does not satisfy application-owned cleanup. The renderer
still supplies no PID or process-selection input.

**Triggered by:** The real Ubuntu descendant-sentinel test proved that a
background `sleep` survived the original process-group-only shutdown.

**Alternatives considered:**

- Signal only `-ptyPid` - rejected by the observed surviving background job.
- Invoke a renderer-supplied kill command - rejected because it would expose
  process authority across the trust boundary.
- Depend on shell job-control cleanup - rejected because behavior varies by
  shell, foreground state, and child signal handling.

## [6] Keep Rosetta verification explicit and non-authoritative

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** macOS package verifier, packaged terminal smoke, developer
documentation, and interpretation of Intel-slice evidence.

Add an explicit `--allow-rosetta-translated` verifier mode that is accepted
only when `sysctl.proc_translated` proves the verifier itself is translated.
That mode forces the packaged application through `/usr/bin/arch -x86_64`,
labels stdout as translated, and refuses to emit the authoritative native
evidence schema. The existing default and hosted native Intel checks continue
to reject Rosetta substitution.

**Triggered by:** The approved constraint that the user has no local Intel Mac
and may use Rosetta as the manual substitute, while native Intel remains the
preferred hosted evidence.

**Alternatives considered:**

- Treat Rosetta output as native Intel evidence - rejected because it would
  misstate the host and weaken established release aggregation.
- Require a local Intel Mac - rejected by the approved availability constraint.
- Let a universal app choose its slice implicitly - rejected because a manual
  Intel-slice smoke must force `x86_64` to be meaningful.

## [7] Revalidate project ownership after lazy terminal loading

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Renderer terminal creation, project switching, startup output,
and the one-session-per-project invariant.

Treat every asynchronous terminal-library boundary as a point where the active
project may have changed. After xterm loads, recheck the selected project and
that project's explicit terminal visibility before creating a view or invoking
the main-process ensure operation; also reuse a view created by a concurrent
toggle. When PTY data arrives before the ensure response, reconcile it with the
bounded output snapshot by removing only their exact suffix/prefix overlap so
startup output is neither duplicated nor discarded.

**Triggered by:** Isolated PR review found project-switch and early-output races
that the initial renderer integration test did not exercise.

**Alternatives considered:**

- Capture the originally selected project in a renderer-supplied ensure request
  - rejected because the renderer must not choose or widen trusted project
  routing.
- Drop all early data events whenever an ensure snapshot arrives - rejected
  because output emitted after the snapshot but before the response could be
  lost.
- Serialize all project activation behind xterm loading - rejected because UI
  navigation must remain responsive and terminal loading is optional.

## [8] Allow only required scoped-package parent directories in ASAR

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Universal macOS package verification only.

Treat an ASAR directory entry for the parent scope of an explicitly staged
package (currently `/node_modules/@xterm`) as structural metadata, while still
requiring every package and descendant path under that scope to match the exact
runtime-package allowlist. This keeps package verification fail-closed without
rejecting the directory shape emitted by Electron ASAR.

**Triggered by:** Hosted Apple Silicon verification of PR #43 rejected the
required `@xterm` parent directory before it could launch the application.

**Alternatives considered:**

- Allow every path beneath `/node_modules/@xterm` - rejected because an
  unstaged sibling package would evade the exact runtime allowlist.
- Remove scoped packages from the package - rejected because xterm is the
  approved terminal renderer.
- Ignore directory entries globally - rejected because the verifier's bounded
  package inventory is useful security and release evidence.

## [9] Match node-pty unpack paths against absolute ASAR source names

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** macOS ASAR construction, native-addon loading, signing, and
packaged runtime verification.

Prefix the exact `node-pty/prebuilds` ASAR unpack glob with `**/` because the
ASAR library evaluates file patterns against absolute source filenames. Keep
the narrower prebuild subtree rather than unpacking all of `node-pty`, and
prove the configuration by constructing a real ASAR in a platform-independent
unit test and checking both `pty.node` and `spawn-helper` in
`app.asar.unpacked`.

**Triggered by:** Native Apple Silicon and Intel CI both found the expected
native addon absent from `app.asar.unpacked` despite successful universal DMG
construction.

**Alternatives considered:**

- Unpack every `.node` file through the packager default - rejected because it
  would not unpack `spawn-helper` and would broaden the package layout.
- Disable ASAR - rejected because it would unnecessarily change the established
  Desktop package structure.
- Extract native files after packaging - rejected because signing and universal
  merging should consume a deterministic packager-owned layout.

## [10] Separate pre-merge package proof from post-merge Apple trust

[x] **Promote**

**Confidence:** HIGH

**Blast Radius:** Terminal acceptance criteria, Desktop PR boundaries,
canonical spec-drafting guidance, and protected release evidence.

Treat universal package construction, ad-hoc signing, exact package inspection,
and native arm64/x86_64 runtime smoke as pre-merge acceptance. Preserve
Developer ID signing, notarization, stapling, Gatekeeper assessment, and exact
trusted-artifact smoke as mandatory post-merge release acceptance. Add a
general rule to canonical spec-draft guidance that acceptance criteria must
name the lifecycle boundary at which evidence can exist and must not require a
post-merge-only credentialed artifact to pass a PR gate.

**Triggered by:** AC8 required Developer ID and notarization evidence before
merge even though the protected workflow accepts only reviewed main commits.

**Alternatives considered:**

- Run protected signing on topic branches - rejected because it weakens
  credential and reviewed-source controls.
- Waive signing/notarization per Desktop PR - rejected because it repeats
  ambiguity and can silently lose the release obligation.
- Leave AC8 unchanged - rejected because it creates an impossible pre-merge
  gate.
