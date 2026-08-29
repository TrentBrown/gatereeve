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

Homebrew packet preparation is intentionally deferred to P9. The
repository-owned `prepare-cask` contract requires truthful direct-installation
proof for this exact DMG, which cannot exist before the still-unapproved public
release is available on the user's Mac. Decision 4 in `scratchpad.md` records
this sequencing constraint.

## Publication boundary

Environment review grants this run access to the Apple credentials only. It
does not authorize or perform a tag, GitHub release, marketplace publication,
update-manifest change, or Homebrew mutation. Those public changes remain a
separate exact-plan approval boundary.
