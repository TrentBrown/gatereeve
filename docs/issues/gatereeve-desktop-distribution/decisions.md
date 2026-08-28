# Decisions - gatereeve-desktop-distribution

**Feature start:** 2026-08-27

Permanent record of decisions promoted from `scratchpad.md`.

---

## Separate packaged context resolution from trusted Python gate execution

**Confidence:** HIGH

**Blast Radius:** Canonical protocol context module, Desktop staged projection, and Plugin/CLI protocol consumers

Implement workflow-context discovery and validation once in the canonical JavaScript protocol and stage no Python scripts into Desktop. Preserve the existing Python guard providers for Plugin and CLI enforcement because Desktop does not execute workflow passage guards. Keep one canonical protocol rather than creating a Desktop fork; parity tests bind JavaScript context output to the Python resolver during migration.

**Triggered by:** AC2 requires packaged local observation without Python while the existing shared protocol also exports trusted Python gate providers used by workflow enforcement.

**Alternatives considered:**
Port every Python gate validator to JavaScript in this slice — rejected as unrelated scope with a much larger governance blast radius. Fork a Desktop-only context implementation — rejected because it would create protocol drift. Continue packaging the Python resolver — rejected because installed observation would retain an undeclared system runtime prerequisite.

**Promoted:** 2026-08-27. PR: https://github.com/TrentBrown/gatereeve/pull/7.

---

## Use exact tested pairs for Desktop and Plugin compatibility

**Confidence:** HIGH

**Blast Radius:** Desktop setup observer, compatibility metadata, readiness projection, release version coordination

Store project-controlled compatibility metadata as an explicit list of tested Desktop and Plugin version pairs. Equal coordinated versions may be marked matched; unequal versions are operational only when an exact pair is marked compatible with evidence. Any absent pair is incompatible. Detection facts remain ephemeral and read-only, while incomplete or incompatible setup never hides an existing durable feature record.

**Triggered by:** P3 requires three evidence-backed compatibility states despite independently updated Plugin and Desktop installations

**Alternatives considered:**
Infer compatibility from semantic-version ranges - rejected because proximity is not evidence; require exact version equality - rejected because independent native update lifecycles create harmless tested skew; inspect a workflow record to infer Plugin version - rejected because historical records are not installation authority

**Promoted:** 2026-08-27. PR: https://github.com/TrentBrown/gatereeve/pull/8.

---

## Require one ready selected agent, not every selected agent

**Confidence:** HIGH

**Blast Radius:** Desktop Setup readiness contract, observer and coordinator projections, UI status copy, and tests

Compute operational readiness when all shared prerequisites are present and at least one explicitly selected agent has an authenticated CLI plus a compatible enabled Plugin. Continue displaying incomplete status for every other selected agent so the user can repair it, but do not make an optional second selection block use through the ready agent. Clear prior ephemeral detection cards while a changed selection is being checked so an old, now-unselected agent cannot invalidate or misrepresent the new selection.

**Triggered by:** Pinned PR #8 review found that the observer contradicted approved design constraint D14

**Alternatives considered:**
Require every selected agent to be ready - rejected because D14 explicitly requires at least one selected supported agent; silently remove incomplete selections - rejected because selection is explicit user intent and Setup must report each selected agent honestly.

**Promoted:** 2026-08-27. PR: https://github.com/TrentBrown/gatereeve/pull/8.

---

## Distinguish Plugin-manager failure from missing installation

**Confidence:** HIGH

**Blast Radius:** Codex and Claude Setup adapters, Setup contract, native remediation guidance, and tests

Use supported JSON plugin listings first, retain text fallback where useful, and classify failure of every listing attempt as unavailable rather than missing. Use each manager's documented update path for incompatible installations: refresh and reinstall from the quality-code marketplace in Codex, and refresh then invoke plugin update in Claude. Detection remains read-only; commands are copy-only guidance.

**Triggered by:** Pinned PR #8 review found that failed read-only plugin listings were being reported as proof that the Plugin was absent

**Alternatives considered:**
Treat a listing failure as missing - rejected because failed observation is not evidence of absence; reuse the install command for updates - rejected because native managers expose distinct update ownership; inspect plugin files directly - rejected because the native manager is the installation authority.

**Promoted:** 2026-08-27. PR: https://github.com/TrentBrown/gatereeve/pull/8.

---

## Select Rolling Vale as the GateReeve icon direction

**Confidence:** HIGH

**Blast Radius:** Desktop branding assets, macOS iconset, Finder/Dock/notification identity, DMG presentation, and future release documentation

Promote V1 — Rolling Vale as the production GateReeve application-icon direction. Its simple twin-tower gatehouse, pale architectural arch, raised portcullis, and continuous light road through rolling purple hills preserve the medieval GateReeve association while remaining readable at small sizes. Production asset generation may apply optical simplification at the smallest iconset sizes, but must preserve this identity and palette.

**Triggered by:** Human review of the generated icon refinement rounds selected V1 — Rolling Vale

**Alternatives considered:**
Original A was rejected as too detailed at small sizes; C was rejected as too abstract; A2/V4/V5 were rejected in favor of V1's separate towers, pale arch, and rolling landscape.

**Promoted:** 2026-08-27. PR: https://github.com/TrentBrown/gatereeve/pull/9.

---

## Use one compact recoverable record for coordinated publication

**Confidence:** HIGH

**Blast Radius:** Release CLI, candidate evidence schema, pre-publication CI, Plugin release guard, Desktop package verification, and later P6-P8 publication adapters

Represent one GateReeve release with an immutable semantic tag and source commit, checksummed Plugin and universal-DMG candidates, architecture-specific Desktop verification, explicit trust and approval state, and a fixed publication order: tag, Plugin marketplace, Desktop prerelease, update manifest, then Early Access website. Persist each completed surface immediately and require adapters to converge the exact identity idempotently, so a retry skips durable completions and resumes the same release. Keep Cask publication outside this record until its final slice, and make the existing tag publisher require a publication-ready coordinated record.

**Triggered by:** P5 requires immutable Plugin/Desktop coordination and idempotent recovery without importing PortReeve's broader multi-binary release engine

**Alternatives considered:**
Copy PortReeve's complete release engine - rejected because GateReeve has only two candidate surfaces and no native-service or architecture matrix; retain the Plugin-only tag publisher and coordinate Desktop informally - rejected because it permits divergent identities and bypasses exact approval; model publication as one atomic state - rejected because Git, marketplace, GitHub Releases, manifest, and website cannot commit atomically.

**Promoted:** 2026-08-27. PR: https://github.com/TrentBrown/gatereeve/pull/10.

---

## Package the universal application with Electron Packager

**Confidence:** HIGH

**Blast Radius:** Desktop development dependencies, macOS bundle assembly, universal binary generation, ad-hoc candidate signing, and CI artifact verification

Use the same `@electron/packager` foundation already proven by the PortReeve
sister project, but target Electron's `universal` architecture rather than
producing separate ARM and Intel applications. Add `@electron/asar` as an
explicit verification dependency so packaged-resource checks do not rely on a
transitive package. Build only development candidates in this slice and seal
them consistently with an ad-hoc identity; Developer ID signing, notarization,
and every public release path remain unavailable until P6.

**Triggered by:** P4 requires one inspectable `GateReeve.app` that contains both macOS architectures and runs from the same DMG bytes on Apple Silicon and Intel

**Alternatives considered:**
Manually splice downloaded Electron distributions - rejected because it duplicates mature universal-bundle logic and increases bundle-signing risk; adopt Electron Forge or Builder - rejected because either introduces a broader packaging framework than this application needs; publish separate architecture bundles as PortReeve currently does - rejected because AC1 explicitly requires one universal application and DMG.

**Promoted:** 2026-08-27. PR: https://github.com/TrentBrown/gatereeve/pull/9.

---

## Use a team API key for autonomous notarization

**Confidence:** HIGH

**Blast Radius:** Apple enrollment runbook, release-publication environment, notarization script, secret names, rotation and recovery guidance

Use an Account Holder-created App Store Connect team API key for notarytool, together with a password-protected Developer ID Application .p12. Store only the .p8 and base64 .p12 plus the export password as release-publication environment secrets; store key, issuer, team, and expected identity identifiers as non-secret environment variables. Keep encrypted offline recovery copies under the user's control. Do not support Apple Account app-specific passwords as a parallel CI mode.

**Triggered by:** P6 must support long autonomous CI runs, while Apple explicitly excludes individual App Store Connect API keys from notarytool

**Alternatives considered:**
Use an individual API key - rejected because Apple states individual keys cannot use notaryTool; use an Apple Account app-specific password - rejected because it couples autonomous releases to a personal login credential and adds a second authentication mode; sign every release manually on the user's Mac - rejected because the approved design assigns repeatable signing to protected CI.

**Promoted:** 2026-08-28. PR: https://github.com/TrentBrown/gatereeve/pull/11.

---

## Preserve the runner keychain search list around signing

**Confidence:** HIGH

**Blast Radius:** Protected macOS signing job and credential cleanup

Capture the hosted runner's original user keychain search list before creating
the ephemeral Developer ID keychain. Prepend the ephemeral keychain for the
signing interval, then restore the captured list before deleting credentials.
Keep the explicit keychain argument as defense in depth for identity discovery
and signing.

**Triggered by:** Protected rehearsal run 33135027205 imported and validated the exact Developer ID identity, but `codesign` could not resolve its fingerprint because the custom keychain was absent from the user search list.

**Alternatives considered:**
Replace the user search list with only the ephemeral keychain - rejected
because it unnecessarily hides runner defaults and leaves altered process
state; install the identity into the login keychain - rejected because it
weakens credential isolation and cleanup; remove Electron's explicit keychain
argument - rejected because the signer should remain constrained to the
ephemeral credential store.

**Promoted:** 2026-08-28. PR: https://github.com/TrentBrown/gatereeve/pull/12.

---

## Separate package progress from machine-readable results

**Confidence:** HIGH

**Blast Radius:** Desktop packaging CLI and protected signing workflow

Add an optional `--result-file` contract to the macOS packaging command. When
present, write the final structured package metadata directly to that path
while leaving Electron Packager progress output on its ordinary channel. Keep
stdout JSON as the default for existing direct callers.

**Triggered by:** Protected rehearsal run 33138565845 completed the signed package command, then failed because redirected stdout began with Electron Packager progress rather than the final JSON object.

**Alternatives considered:**
Parse only the last lines of mixed stdout - rejected because log formats and
line counts are not a machine contract; suppress or redirect all third-party
progress output - rejected because it removes useful CI diagnostics and depends
on upstream logging behavior; infer the application path from naming alone -
rejected because the packaging result is already the authoritative source.

**Promoted:** 2026-08-28. PR: https://github.com/TrentBrown/gatereeve/pull/13.

---

## Stage multi-root trust outputs before artifact upload

**Confidence:** HIGH

**Blast Radius:** Protected Apple-trust artifact upload, both native trusted-DMG
verification jobs, and the immutable trusted coordinated record

Copy the already notarized DMG and its apple-trust.json evidence into one
runner-temp staging directory, then upload that directory as
coordinated-desktop-trusted. This keeps the download contract flat and stable
for native verification and coordinated-record assembly without changing
either file's bytes or trust identity.

**Triggered by:** Protected rehearsal run 33140536129 notarized and uploaded the
exact DMG successfully, but GitHub preserved the common-root hierarchy of the
repository DMG and runner-temp trust JSON, so both downstream architectures
looked for files at nonexistent flat paths.

**Alternatives considered:**
Teach every consumer the current nested paths - rejected because those paths
expose runner/workspace layout and are brittle.
Upload the DMG and trust evidence as separate artifacts - rejected because it
weakens their atomic bundle identity and complicates every consumer.

**Promoted:** 2026-08-28. PR: 14.

---

## Keep update metadata declarative and URL-free

**Confidence:** HIGH

**Blast Radius:** Public Desktop manifest, Desktop update client, Early Access website, and later publication adapters

Publish a schema-versioned GateReeve Desktop manifest at the fixed project endpoint /releases/desktop.json. The document has exact stable and RC channel slots and contains only validated release identity, artifact checksum, source commit, publication time, and Apple-trust evidence; it contains no download or navigation URL. Desktop and the website derive the exact GitHub tag page from a project-owned constant plus the strictly validated semantic version. An empty manifest is valid before publication, so the Early Access page remains visibly unavailable and cannot point at an unpublished or untrusted build.

**Triggered by:** P7 requires one privacy-preserving fixed manifest, exact trusted release discovery, channel isolation, and fixed official navigation

**Alternatives considered:**
Allow manifest-controlled URLs - rejected because a compromised or malformed metadata value would control navigation and violate fixed-page behavior; expose only one latest version - rejected because stable and RC installations have different visibility rules; omit trust and artifact identity - rejected because the website must resolve only after exact trusted publication evidence exists.

**Promoted:** 2026-08-28. PR: https://github.com/TrentBrown/gatereeve/pull/15.

---

## Isolate update cache from workflow preferences

**Confidence:** HIGH

**Blast Radius:** Desktop user-data storage, startup behavior, update IPC state, and native-notification deduplication

Persist the last bounded update-check result and last natively notified version in a dedicated update-cache.json under Electron userData. Keep the existing preferences schema for user choices only and expose a validated ephemeral update projection through Desktop state. Startup publishes cached state immediately and launches a stale automatic check without awaiting it; manual checks always bypass freshness. Every failure collapses to an unavailable update projection and never affects worktree observation or setup readiness.

**Triggered by:** P7 requires persistent 24-hour automatic throttling without making update discovery part of canonical GateReeve workflow state

**Alternatives considered:**
Add cache fields to preferences.json - rejected because network observation is not a user preference and would unnecessarily migrate that schema; keep cache only in memory - rejected because relaunches could exceed the once-per-24-hour automatic limit; make update discovery part of a feature record - rejected because application release discovery is independent of the selected workflow.

**Promoted:** 2026-08-28. PR: https://github.com/TrentBrown/gatereeve/pull/15.

---

## Use coordinated package metadata for the update channel

**Confidence:** HIGH

**Blast Radius:** Packaged Desktop update selection, RC/stable isolation, and macOS version metadata

Initialize update discovery from shared/setup-compatibility.json, whose Desktop version is rewritten to the exact coordinated release version during package staging and verified inside the ASAR. Do not use Electron's macOS bundle display version as channel identity, because packaging intentionally converts 0.1.0-rc.N to the bundle-compatible 0.1.0 and would make an RC installation behave as stable.

**Triggered by:** P7 review found that macOS bundle versions strip the prerelease suffix even though the staged application package retains the exact coordinated version

**Alternatives considered:**
Use app.getVersion() - rejected because packaged macOS metadata may return the suffix-free bundle version; parse the DMG or application filename - rejected because filenames are distribution evidence rather than runtime authority; add a second update-only version file - rejected because staged compatibility metadata already has an exact verified identity.

**Promoted:** 2026-08-28. PR: https://github.com/TrentBrown/gatereeve/pull/15.
