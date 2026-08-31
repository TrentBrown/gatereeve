# RC.6 Acceptance - tb-gatereeve-release-artifact-integrity

## Candidate identity

- Tag: `v0.1.0-rc.6`
- Source: `10a726411fd46f58263f8c989ac83f1a65bdf33f`
- Source branch: `main`
- Previous failed identity: `v0.1.0-rc.5` (immutable; never retry or repair)

## Mainline prerequisite

- PR: [#44](https://github.com/TrentBrown/gatereeve/pull/44)
- Merge commit: `10a726411fd46f58263f8c989ac83f1a65bdf33f`
- Merge verification: PASS (`ancestor`)
- Plugin CI: [run 33451532082](https://github.com/TrentBrown/gatereeve/actions/runs/33451532082) — PASS
- Initial mainline packaging attempt: `hdiutil create` returned `Resource busy` before any protected release activity.
- Failed-job retry: PASS, including universal DMG and native ARM64/x64 packaged runtime.

## Protected preparation

- Dispatch run: NOT YET
- `release-trust` approval: NOT YET
- Plugin candidate round trip: NOT YET
- Apple trust production: NOT YET
- Native ARM64 evidence: NOT YET
- Native Intel evidence: NOT YET
- Trusted lifecycle and exact integrity commitment: NOT YET

## Finalization and publication

- Read-only finalization: NOT YET
- Sealed primary plan digest: NOT YET
- Protected nonpublishing rehearsal: NOT YET
- Separate primary publication approval: NOT YET
- Public primary verification: NOT YET

## Constraints

- Do not use generic workflow reruns after protected trust begins.
- Do not change trusted bytes under `v0.1.0-rc.6` after live Apple bytes or request history exists.
- Publication approval is distinct from `release-trust` approval.
- Cask finalization/publication and Mac installation are P6, after primary publication.
