# Release Closeout - tb-closed-pr-workflow

GateReeve [v0.1.0-rc.15](https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.15) contains the exact approved [PR #74](https://github.com/TrentBrown/gatereeve/pull/74) merge `d2456ded8f4d9120b105b7af7f3b10177256207e`. Reviewed head `4fed5cfc892c28a2547fd3d310c249af8acc3eea` is an ancestor of that merge. Human acceptance and verified merge passage are recorded at journal sequences 53 and 54.

The new repository boolean `keepPullRequestsClosed` defaults to false. Enabling it closes prepared PRs and reopens them only for an explicitly authorized, exact-head native merge. Active synthetic review and `sliceBoundaryMode` are retired; historical records remain readable.

## Publication and acceptance

- Start [38009713880](https://github.com/TrentBrown/gatereeve/actions/runs/38009713880) and resume [38010784767](https://github.com/TrentBrown/gatereeve/actions/runs/38010784767) completed successfully.
- All 12 ordered Release Conductor stages passed, ending at COMPLETE without failure. Terminal state SHA-256: `c96b3c3fc9659515de56167176ec8c3e660c154b18107cee478631b0c7b24f16`.
- Primary sealed plan: `f0e6f0e2a1809f683e72457414fa99a8f7f7b051e8a836b12f898b19078b8bb8`.
- Separate Cask plan: `5a128cab25efe472a258d0e5ab74936e6a7428610d64aec34c716caa1ee0a5c6`.
- Generated update-metadata [PR #75](https://github.com/TrentBrown/gatereeve/pull/75) merged as `e6acaab1f9ed99cb93ec42276ee2fd0cae940567`.
- Homebrew Cask [PR #9](https://github.com/TrentBrown/homebrew-gatereeve/pull/9) merged as `70f514bc9a54b5bff4b8f18e6bdfaa749b8a1194`.
- Both linked-record install/upgrade checks and both literal public-tap install checks passed on Apple Silicon and Intel.
- The installed, digest-verified Release Conductor provider independently replayed the retained chain and confirmed the release contains the exact feature merge. Release PASS is recorded at sequence 56; feature COMPLETE at sequence 57.

The signed installed application's provider allowlist was used for replay. Packaging binds the bundled executable digest, which differs from the unbundled development source allowlist. No trust check was bypassed.

## Direct installation

The exact public DMG was independently downloaded and hashed to `ad33d4c70a32931178061a16c0195ec1d9556818eba4296abd3f3dc20f6c173b`, matching the sealed plan and GitHub asset digest. Mounted, staged, and installed code signatures passed `codesign --verify --deep --strict`; Gatekeeper accepted the notarized Developer ID application. `/Applications/GateReeve.app` launched successfully. Five installed workflow resources exactly match reviewed source. The public website update manifest independently matched rc.15, source commit, and DMG checksum.

The prior app remains recoverable at `/Users/trent.brown/.Trash/GateReeve.app.pre-rc15-20261009T174944`. The authenticated conductor direct-install attestation is bound to the verified public DMG digest.

## Durable evidence

[Release evidence directory](release-v0.1.0-rc.15/) retains merge and CI proof, publication plan inspections, direct installation and installed-resource verification, public update verification, publication PR receipts, terminal state and full chain, and the installed provider response. Native plugin installation remains managed separately by Codex or Claude; publishing does not update an already installed native plugin cache.
