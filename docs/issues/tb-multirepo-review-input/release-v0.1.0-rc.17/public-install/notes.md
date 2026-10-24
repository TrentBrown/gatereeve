# Public rc.17 installation

Downloaded the public DMG and SHA256SUMS from GitHub release v0.1.0-rc.17. The hash matches the Release Conductor waiting-state digest: `0380963494e88189e3e73e3603d2f577b7d86735d5651e48f25b93291040a788`.

The initial local checker incorrectly requested a stapled ticket on the inner app; the distribution contract staples the DMG. That check stopped before installation and is retained in initial-check.log. The checker was corrected to validate the DMG ticket. Code signature and Gatekeeper assessments passed for the mounted app and installed copy; Gatekeeper reported Notarized Developer ID. Installed-app runtime smoke passed, the app was normally launched, and its running process was observed. The earlier candidate and rc.16 app remain backed up locally.

Both Codex and Claude now use the public Git marketplace branch, and both installed/enabled plugins are rc.17. Replacing Claude's local marketplace required native removal and installation, after its update operation correctly reported the plugins absent; no cache/config files were manually edited. All 338 shared package files match public marketplace bytes and 49 Desktop protocol/helper files match merged source. Doctor readiness checks passed using observed policy activation. This chat now exposes rc.17 skills; a separate fresh Claude SessionStart or live host-hook interception is not claimed.
