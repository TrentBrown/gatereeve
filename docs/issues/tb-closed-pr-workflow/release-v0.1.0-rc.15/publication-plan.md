# GateReeve v0.1.0-rc.15 publication plan

- Release ID: `gatereeve-v0.1.0-rc.15`
- Version: `0.1.0-rc.15`
- Source commit: `d2456ded8f4d9120b105b7af7f3b10177256207e`
- Plugin candidate SHA-256: `e1da090fc9bb8bb8cf0502de5e4198db1ccffa292c434e87b988e1752b09e90e`
- Desktop DMG SHA-256: `ad33d4c70a32931178061a16c0195ec1d9556818eba4296abd3f3dc20f6c173b`
- Desktop arm64 evidence SHA-256: `4f24af4d3d6231b805b25e87de54d0c9e1c69111e1e68fe11b55079bb3978754`
- Desktop x64 evidence SHA-256: `fcacb6436c4e93991eab7311bf9c983daabf0765ff1c50dc70c2f1cc6d39fb57`
- Desktop trust: `developer-id-notarized`
- Trust evidence: `codesign:Developer ID Application: Trent Brown (PMWYD5A82A)`
- Trust evidence: `notarytool:2ddd481e-fc86-4634-af81-ff6e3c33e26d`
- Trust evidence: `stapler:validated`
- Trust evidence: `spctl:accepted`
- Checksum asset SHA-256: `20446c2c74efce839865ba95e4a737965fb93ba8e6ebd2c768c0cef856cbe7d6`
- Update manifest SHA-256: `b263b9823c67cad52c83e6969113253fc65a3adab2778212ce244ad4634f65f8`
- Update manifest base SHA-256: `4ab8c24796e3929592556dbfbcb8c72575dd96be7921a4f50eb4b82e48a5f5c9`
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
