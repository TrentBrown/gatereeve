# GateReeve v0.1.0-rc.16 publication plan

- Release ID: `gatereeve-v0.1.0-rc.16`
- Version: `0.1.0-rc.16`
- Source commit: `bf9f656535bce04dca659d8f6a1e975d552b1d6d`
- Plugin candidate SHA-256: `da3539f25cc929de67370c5a048f0b3d17552f783ed3d8c9f2b9a74a757feea5`
- Desktop DMG SHA-256: `d363a90e8497fe9f923ceb90eb36b3a1932015510e6d487023dd35452649fbbc`
- Desktop arm64 evidence SHA-256: `8f4eec89174d3dcb88bae37cf850d2fb3c47635289262f15410d745fbf713bd3`
- Desktop x64 evidence SHA-256: `ceb12faa95bbdeb45c7e1c3904db4ed9433abe8ce5c0f24f8f510050b4afce52`
- Desktop trust: `developer-id-notarized`
- Trust evidence: `codesign:Developer ID Application: Trent Brown (PMWYD5A82A)`
- Trust evidence: `notarytool:656dc5e3-131a-439a-880e-a14fc6a5665e`
- Trust evidence: `stapler:validated`
- Trust evidence: `spctl:accepted`
- Checksum asset SHA-256: `a57e3d99a810e07f033823b3c380a5857afeda1f1402d7091723b45b5f500fb1`
- Update manifest SHA-256: `93fe4ba78f482500afe4758fe08a221d26b27ef2ef6b63f140ff8500d14592b9`
- Update manifest base SHA-256: `b263b9823c67cad52c83e6969113253fc65a3adab2778212ce244ad4634f65f8`
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
