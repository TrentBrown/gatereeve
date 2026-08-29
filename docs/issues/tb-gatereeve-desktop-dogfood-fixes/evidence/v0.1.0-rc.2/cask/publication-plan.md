# GateReeve 0.1.0-rc.2 Homebrew Cask publication plan

- Cask release ID: `gatereeve-cask-v0.1.0-rc.2`
- Source tag: `v0.1.0-rc.2`
- Source commit: `1b7c7e519c90a13d140f59c65e0304bb78000753`
- Universal DMG: `GateReeve-0.1.0-rc.2-macos-universal.dmg`
- Universal DMG bytes: `246106267`
- Universal DMG SHA-256: `ec50610dfbeffe9bf0004f313e1413ae6d62c58a88cc3b0fa2c25b30b280754f`
- Apple signing identity: `Developer ID Application: Trent Brown (PMWYD5A82A)`
- Apple team ID: `PMWYD5A82A`
- Apple notarization ID: `59e62a4e-bf52-4bf3-bb22-e85768ed75a1` (`Accepted`)
- Direct DMG installation: confirmed by `Trent Brown` at `2026-08-29T15:45:56.000Z`
- Tap repository: `TrentBrown/homebrew-gatereeve` (create publicly if absent)
- Cask path: `Casks/gatereeve.rb`
- Cask token: `gatereeve`
- Cask SHA-256: `0f369a3651876036042ce2ca4c1785bcd0077641c114647379899178980b3e8f`

## Exact public mutation

1. Verify the existing GitHub prerelease still exposes the approved universal DMG identity.
2. Create the public `TrentBrown/homebrew-gatereeve` tap with an initialized `main` branch only if it is absent.
3. Publish only `Casks/gatereeve.rb` through one generated pull request whose content is bound to this plan.
4. Merge only the clean, exact generated commit and verify the bytes on `main`.

The Cask downloads the existing approved DMG from GitHub Releases. It never rebuilds or repackages GateReeve and it does not install, update, or remove the Plugin or CLI.
