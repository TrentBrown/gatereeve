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

- Dispatch run: [33452103818](https://github.com/TrentBrown/gatereeve/actions/runs/33452103818)
- Dispatch source: `10a726411fd46f58263f8c989ac83f1a65bdf33f`
- `resolve-source`: PASS
- Plugin candidate production and complete portable acceptance: PASS
- Plugin candidate round trip: PASS; exact producer manifest and semantic tree verified after GitHub artifact upload/download
- `release-trust` approval: APPROVED by the user through GitHub's protected
  deployment review; environment `release-trust`, deployment environment ID
  `20893546887`
- Apple trust production: PASS; Developer ID Application
  `Trent Brown (PMWYD5A82A)`, hardened runtime, secure timestamp, notarization
  request `9a632e61-0e6c-4bb6-85ba-ac71bef7925c` accepted, staple validated, and
  Gatekeeper accepted
- Submitted DMG SHA-256: `6be8ea26b7e194515db88b40b53c7fecb95a49cdd65c5c06672c86d55b83eb9b`
- Final trusted DMG SHA-256: `47121af4f246dbef0d6597c9361df346baacf128d3042fa122a2c8d83772e314`
- Native ARM64 evidence: PASS at `2026-09-01T00:31:18.057Z`
- Native Intel evidence: PASS at `2026-09-01T00:32:07.660Z`; native Intel runner, not Rosetta
- Native evidence aggregate SHA-256: `1285b29a945fde813524afef2891277f71dcb61dec203eee254bd91679b4657c`
- Trusted lifecycle and exact integrity commitment: PASS; preparation run completed successfully

The protected job began only after the separate environment approval. It
retained immutable submitted bytes and request history before notarization,
then verified the same trusted universal DMG independently on native ARM64 and
Intel runners. No generic workflow rerun was used after trust production began.

## Finalization and publication

- Read-only finalization: PASS;
  [run 33455275343](https://github.com/TrentBrown/gatereeve/actions/runs/33455275343),
  exact source `10a726411fd46f58263f8c989ac83f1a65bdf33f`
- Sealed primary plan digest: `9639bdfcb260673cea4acf137b073fe1b2f264e51b97663d85df9d94cf9f56e0`
- Sealed Plugin tree SHA-256:
  `c62f6983dd31b16e78124b6006103acad120120fa4672dab233d6e18d98cd3a3`;
  319 files plus companion integrity manifest
- Protected nonpublishing rehearsal:
  [run 33455470808](https://github.com/TrentBrown/gatereeve/actions/runs/33455470808)
  dispatched with the exact finalization run, source, tag, and plan digest;
  PASS after separate user approval of the `release-publication` deployment
  (environment ID `20741161933`); exact packet inspection and publication
  preflight passed with read-only permissions and no publication secret
- Separate primary publication approval: AWAITING explicit authorization for
  the exact sealed plan
- Public primary verification: NOT YET

### Public inventory before rehearsal

- RC.6 tag: absent
- RC.6 GitHub release: absent
- Plugin marketplace: commit `22c2d841e833af4d2aec351cf61d54dafaf8fcd3`,
  release `v0.1.0-rc.2`
- Main update manifest SHA-256:
  `23195d7507f2eade6f87ce866533d3078ba423f13667ae0e4c41ebe25a51f17b`,
  release `0.1.0-rc.2`
- Early Access response SHA-256:
  `23195d7507f2eade6f87ce866533d3078ba423f13667ae0e4c41ebe25a51f17b`,
  byte-identical to main and release `0.1.0-rc.2`
- Homebrew Cask blob: `f08840728d0b329a9dfe037467782d8c335c396e`,
  release `0.1.0-rc.2`

### Public inventory after rehearsal

- RC.6 tag: absent
- RC.6 GitHub release: absent
- Plugin marketplace: unchanged at commit
  `22c2d841e833af4d2aec351cf61d54dafaf8fcd3`, release `v0.1.0-rc.2`
- Main update manifest: unchanged at SHA-256
  `23195d7507f2eade6f87ce866533d3078ba423f13667ae0e4c41ebe25a51f17b`,
  release `0.1.0-rc.2`
- Early Access response: unchanged at the same SHA-256 and byte-identical to
  main, release `0.1.0-rc.2`
- Homebrew Cask: unchanged at blob
  `f08840728d0b329a9dfe037467782d8c335c396e`, release `0.1.0-rc.2`

The complete before/after inventory proves the protected rehearsal made no
public mutation. Real publication remains a new dispatch and decision.

## Constraints

- Do not use generic workflow reruns after protected trust begins.
- Do not change trusted bytes under `v0.1.0-rc.6` after live Apple bytes or request history exists.
- Publication approval is distinct from `release-trust` approval.
- Cask finalization/publication and Mac installation are P6, after primary publication.
