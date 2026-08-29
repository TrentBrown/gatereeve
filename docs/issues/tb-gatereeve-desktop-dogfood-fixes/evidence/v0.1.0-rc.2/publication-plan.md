# GateReeve v0.1.0-rc.2 publication plan

- Release ID: `gatereeve-v0.1.0-rc.2`
- Version: `0.1.0-rc.2`
- Source commit: `1b7c7e519c90a13d140f59c65e0304bb78000753`
- Plugin candidate SHA-256: `3a86b131f60c0551c083c1030d48a863dc1dc96a66349a00ad160b3f6ddf67ff`
- Desktop DMG SHA-256: `ec50610dfbeffe9bf0004f313e1413ae6d62c58a88cc3b0fa2c25b30b280754f`
- Desktop arm64 evidence SHA-256: `7514186c3b5d9728bcabd03463c3c57a9f0cadd9dae97002594081f70e3584f9`
- Desktop x64 evidence SHA-256: `739d9bca239b025e1f8a2e2858ea3f9c4800c1f72dff01c2e4d860b311238494`
- Desktop trust: `developer-id-notarized`
- Trust evidence: `codesign:Developer ID Application: Trent Brown (PMWYD5A82A)`
- Trust evidence: `notarytool:59e62a4e-bf52-4bf3-bb22-e85768ed75a1`
- Trust evidence: `stapler:validated`
- Trust evidence: `spctl:accepted`
- Checksum asset SHA-256: `52b196660b49f9e84713f173bb7e999f5e23dacfe959eddc7826c72a802e36b2`
- Update manifest SHA-256: `23195d7507f2eade6f87ce866533d3078ba423f13667ae0e4c41ebe25a51f17b`
- Update manifest base SHA-256: `b79f9ef8e0dcc8b0fd4e7f737edf40de30711736e0f93bdeba0f1d78b15fe762`
- GitHub release: public prerelease with the exact DMG and SHA256SUMS assets
- Update destination: `TrentBrown/gatereeve:main/workflow-site/releases/desktop.json` via an exact generated pull request
- Early Access verification: `https://gatereeve.pages.dev/releases/desktop.json`

## Deterministic publication order

1. tag
2. pluginMarketplace
3. desktopPrerelease
4. updateManifest
5. earlyAccessWebsite

Retries must converge this exact tag, source commit, and candidate identity. Completed surfaces are never deleted, replaced, or republished.
