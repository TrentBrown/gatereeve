# GateReeve v0.1.0-rc.2 release preparation

## Immutable source and namespace

- Release tag: `v0.1.0-rc.2`
- Source commit: `1b7c7e519c90a13d140f59c65e0304bb78000753`
- Integration ref at dispatch: `origin/main`
- Git tag preflight: absent
- GitHub release preflight: absent

The source commit is the merge of governed PR
[#20](https://github.com/TrentBrown/gatereeve/pull/20). The preparation run
uses the full commit SHA as `source_ref`; it does not resolve a moving branch
after dispatch.

## Protected rehearsal

- Workflow: `coordinated-release-prepare.yml`
- Run:
  [#33234514595](https://github.com/TrentBrown/gatereeve/actions/runs/33234514595)
- Apple trust requested: yes
- Repository permission: `contents: read`
- Publication capability: none

The plugin candidate, universal Desktop candidate, ARM64 verification, and
Intel verification passed before the protected job requested environment
access. The protected job subsequently passed Developer ID signing, hardened
runtime and secure timestamps, notarization, stapling, Gatekeeper assessment,
and ephemeral credential cleanup. Its exact trusted output then passed native
ARM64 and Intel verification before the workflow created the immutable
coordinated release record.

## Trusted artifact identity

- Desktop DMG: `GateReeve-0.1.0-rc.2-macos-universal.dmg`
- Bytes: `246106267`
- SHA-256: `ec50610dfbeffe9bf0004f313e1413ae6d62c58a88cc3b0fa2c25b30b280754f`
- Developer ID: `Developer ID Application: Trent Brown (PMWYD5A82A)`
- Team ID: `PMWYD5A82A`
- Notarization request: `59e62a4e-bf52-4bf3-bb22-e85768ed75a1`
- Notarization status: `Accepted`
- Hardened runtime: yes
- Secure timestamp: yes
- Staple validated: yes
- Gatekeeper accepted: yes

The [immutable release record](evidence/v0.1.0-rc.2/release-record.json),
[ARM64 evidence](evidence/v0.1.0-rc.2/desktop-arm64.json), and
[Intel evidence](evidence/v0.1.0-rc.2/desktop-x64.json) preserve the exact
machine-readable identities.

## Coordinated publication preflight

The repository-owned inspector accepted the packet. The generated
[publication plan](evidence/v0.1.0-rc.2/publication-plan.md) has SHA-256
`88b18713d9d91d9d98bb5068d11faf2f235bf172e2b0120bcd327d363612eb76`.
The read-only [publication dry run](evidence/v0.1.0-rc.2/publication-dry-run.json)
passed with all five public surfaces still pending.

The coordinated release was approved against that exact plan digest and is now
published. The immutable record preserves receipts for tag `v0.1.0-rc.2`,
Plugin marketplace commit `22c2d841e833af4d2aec351cf61d54dafaf8fcd3`, the
[signed Desktop prerelease](https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.2),
manifest [PR #22](https://github.com/TrentBrown/gatereeve/pull/22) merged as
`b3adff3c4551ee090967885b3051c23a2ae0adb2`, and the production Early Access
manifest with SHA-256
`23195d7507f2eade6f87ce866533d3078ba423f13667ae0e4c41ebe25a51f17b`.

Trent Brown confirmed direct installation of this exact public DMG on macOS at
`2026-08-29T15:45:56Z`. The repository-owned `prepare-cask` contract sealed
that proof into the [Cask record](evidence/v0.1.0-rc.2/cask/cask-record.json),
the exact [Cask bytes](evidence/v0.1.0-rc.2/cask/Casks/gatereeve.rb), and the
[Cask publication plan](evidence/v0.1.0-rc.2/cask/publication-plan.md).

The Cask publication plan has SHA-256
`53095d7e4eafdbb596a694eb670cc5d676bf6b00532a3e8f448ac3c04181974c`;
the generated Cask has SHA-256
`0f369a3651876036042ce2ca4c1785bcd0077641c114647379899178980b3e8f`.
The user approved this exact plan in the active conversation. The
repository-owned publisher merged
[tap PR #2](https://github.com/TrentBrown/homebrew-gatereeve/pull/2) as
`91725d7e7aa3a8e0f82ddc2658f51d12a3385900`. The public
`Casks/gatereeve.rb` now has the exact approved SHA-256
`0f369a3651876036042ce2ca4c1785bcd0077641c114647379899178980b3e8f`,
and a post-publication dry run reports the Cask surface complete.

The post-publication
[Homebrew Cask Smoke run](https://github.com/TrentBrown/gatereeve/actions/runs/33262844457)
passed all four macOS jobs. The literal public-tap install passed on arm64 and
x64, and the disposable predecessor-to-`v0.1.0-rc.2` upgrade passed on both
architectures. The tracked
[hosted evidence](evidence/v0.1.0-rc.2/cask/hosted-smoke/) binds every check to
the exact public Cask, DMG checksum, bundle identity, Developer ID, Gatekeeper
acceptance, and universal binaries.

## Publication boundary

The user explicitly approved both public coordinated publication and the
separate exact Homebrew plan in the active conversation. The repository-owned
publishers completed all coordinated surfaces and the public Cask mutation.
Trent Brown then completed the real user-Mac Homebrew transition from rc.1 to
rc.2. The [upgrade evidence](evidence/v0.1.0-rc.2/cask/user-mac-homebrew-upgrade.md)
records the exact Cask inventory, successful application replacement, strict
deep code-signing validation, and Gatekeeper acceptance as Notarized Developer
ID. The installed application behavior checklist remained required before R8
could pass.

The installed application launches and the first
[user-Mac checklist](evidence/v0.1.0-rc.2/cask/user-mac-installed-app-checklist.md)
group passes. The rc.2 Setup view shows Python 3.14.7 as present, the enlarged
Rolling Vale masthead artwork, and the stable complete sidebar through repeated
Setup/workflow navigation. Desktop and Plugin both report `0.1.0-rc.2` and
matched compatibility. Trent Brown subsequently confirmed that the selected
artifact updates automatically, manual Refresh retains selection, and bottom
and ordinary scroll positions survive legitimate PortReeve artifact changes.
Installed AC4-AC5 therefore pass; AC6-AC7 Markdown and link checks remain
before R8 can pass.

Trent Brown completed the final installed checks. Strong emphasis, ordinary
emphasis, inline code, and Markdown link labels render correctly; HTTPS links
open in the system browser without navigating GateReeve; relative canonical
links select their target inside GateReeve; and same-document fragments scroll
within the current artifact. The installed AC1-AC7 checklist is complete. R8
now has complete release, public Cask, Homebrew upgrade, Apple trust, and
installed-application evidence for formal evaluation.
