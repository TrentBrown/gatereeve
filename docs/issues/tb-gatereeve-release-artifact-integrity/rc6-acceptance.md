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
- Separate primary publication approval: APPROVED explicitly by the user for
  sealed plan SHA-256
  `9639bdfcb260673cea4acf137b073fe1b2f264e51b97663d85df9d94cf9f56e0`
- Real publication dispatch:
  [run 33456095160](https://github.com/TrentBrown/gatereeve/actions/runs/33456095160),
  mode `publish`, `approved_by=Trent Brown`; PARTIAL after the distinct
  `release-publication` deployment approval
- Same-packet bounded recovery:
  [run 33458101816](https://github.com/TrentBrown/gatereeve/actions/runs/33458101816),
  mode `publish`, exact finalization run/source/tag/plan/approver; PASS after a
  fresh `release-publication` deployment approval
- Deterministic update-manifest PR:
  [#45](https://github.com/TrentBrown/gatereeve/pull/45); one-file change to
  `workflow-site/releases/desktop.json`, merged as
  `2b16a4f709d05da89b84bb87bafa77068cac2a1f`
- Public primary verification: PASS

The `main` branch advanced to merge `cf9bbf7596e48d29dc12308dea585efced95ca26`
for PR #43 seconds before the real dispatch. RC.6 remains intentionally bound
to its approved and already notarized source `10a7264`: the sealed source is
an ancestor of the new `main`, the coordinated publisher workflow and release
publisher paths are unchanged across the advance, and the job checks out the
exact source input. No RC.6 bytes are rebuilt from the newer commit, and RC.6
does not include PR #43.

### Bounded partial-publication recovery

Run 33456095160 preserved three successful ordered receipts before stopping:

1. Tag `v0.1.0-rc.6` at exact source `10a7264`, completed
   `2026-09-01T01:00:14.957Z`.
2. Plugin marketplace commit `4a204590e8ddf73a4a716a66998f20741426aeb3`,
   completed `2026-09-01T01:00:21.150Z`; deployed `RELEASE.json` identifies
   RC.6 and exact source `10a7264`.
3. GitHub prerelease, completed `2026-09-01T01:00:32.194Z`, with exact assets:
   DMG SHA-256
   `47121af4f246dbef0d6597c9361df346baacf128d3042fa122a2c8d83772e314`
   and `SHA256SUMS` SHA-256
   `b8d553618a884df4b954733a6b2d29b357dc938c345d679c8d162cea79b707c1`.

The publisher then received HTTP 403 while creating the deterministic update
manifest PR: GitHub Actions is not permitted to create or approve pull
requests. Repository workflow permissions report
`can_approve_pull_request_reviews=false` and default read permission. The main
manifest and Early Access response remained byte-identical RC.2 at SHA-256
`23195d7507f2eade6f87ce866533d3078ba423f13667ae0e4c41ebe25a51f17b`.

Do not delete, replace, move, or republish the completed receipts, and do not
use GitHub's generic rerun. After explicitly enabling the repository setting
that allows Actions to create pull requests, recovery is a new dispatch with
the same finalization run, source, tag, plan digest, mode, and approver. The
publisher must idempotently verify and skip the first three surfaces, then
continue at the manifest PR and Early Access verification.

The user enabled the setting, and the API then reported
`can_approve_pull_request_reviews=true` while default workflow permissions
remained `read`. Before recovery dispatch, the immutable tag still resolved to
`10a7264`, the marketplace still resolved to receipt commit `4a204590`, the
prerelease remained exact and public, and finalization run 33455275343 remained
successful. Same-packet recovery
[run 33458101816](https://github.com/TrentBrown/gatereeve/actions/runs/33458101816)
passed after a fresh `release-publication` deployment review. It bound the
exact finalized packet, idempotently verified and skipped the completed tag,
marketplace, and prerelease surfaces, then created and merged manifest PR #45
and verified the Early Access response.

The final publication result is `published` for sealed plan SHA-256
`9639bdfcb260673cea4acf137b073fe1b2f264e51b97663d85df9d94cf9f56e0`
and contains all five ordered receipts:

1. Tag `v0.1.0-rc.6` at source
   `10a726411fd46f58263f8c989ac83f1a65bdf33f`, verified
   `2026-09-01T01:22:43.494Z`.
2. Plugin marketplace commit
   `4a204590e8ddf73a4a716a66998f20741426aeb3`, verified
   `2026-09-01T01:22:45.794Z`.
3. GitHub prerelease
   `https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.6`, verified
   `2026-09-01T01:22:46.977Z`.
4. Update manifest PR #45 at merge
   `2b16a4f709d05da89b84bb87bafa77068cac2a1f`, completed
   `2026-09-01T01:22:57.152Z`.
5. Early Access response at manifest SHA-256
   `19e35e21f6684cdc14cb957c63c1d67194659bf7d98768e4416a94d9b4d6518a`,
   verified `2026-09-01T01:23:23.012Z`.

Independent public downloads matched the retained release packet: the DMG is
SHA-256
`47121af4f246dbef0d6597c9361df346baacf128d3042fa122a2c8d83772e314`
and the `SHA256SUMS` asset is SHA-256
`b8d553618a884df4b954733a6b2d29b357dc938c345d679c8d162cea79b707c1`;
the checksum file itself names the same DMG digest. The immutable tag resolves
to exact source `10a7264`, deployed `RELEASE.json` identifies RC.6 and that
source, and both the merged main manifest and public Early Access response are
byte-identical at SHA-256 `19e35e21...`. Both manifests identify RC.6, the
exact source and DMG digest, and successful Apple trust evidence. Homebrew
remains intentionally on RC.2 until the separately finalized and approved P6
Cask publication.

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
public mutation. The later separately approved primary publication and bounded
recovery completed all five primary surfaces without rebuilding trusted bytes.

## Constraints

- Do not use generic workflow reruns after protected trust begins.
- Do not change trusted bytes under `v0.1.0-rc.6` after live Apple bytes or request history exists.
- Publication approval is distinct from `release-trust` approval.
- Cask finalization/publication and Mac installation are P6, after primary publication.

## Acceptance evidence delivery

- Primary evidence PR: [#46](https://github.com/TrentBrown/gatereeve/pull/46)
- Exact reviewed head:
  `68a3977ed60c11f07ce2a36886cb892540322d99`
- Merge commit:
  `9a00ec850b999fe8abd51277cb5fe3f78a59bdfc`
- Merge verification: PASS by ancestry
- Premature feature-final slice `s3-mac-cask-acceptance`: abandoned after live
  acceptance exposed a reviewed workflow prerequisite
- Merged correction slice: `s3-cask-provenance-correction`, PR #47 merge
  `1c19304e67f34f12930b1c51c5e06621c05c6734`
- Active feature-final slice: `s4-cask-acceptance`
- Direct RC.6 install: PASS
- Cask finalization: PASS
- Cask rehearsal: PASS; publication and Homebrew install evidence: pending

## Direct Mac installation

- Confirmed by: Trent Brown
- Confirmed at: `2026-09-01T14:44:59Z`
- Downloaded asset:
  `GateReeve-0.1.0-rc.6-macos-universal.dmg`
- Downloaded SHA-256: PASS,
  `47121af4f246dbef0d6597c9361df346baacf128d3042fa122a2c8d83772e314`
- DMG Gatekeeper assessment: PASS, `accepted`, source
  `Notarized Developer ID`
- Installed application: `/Applications/GateReeve.app`
- Application Gatekeeper assessment: PASS, `accepted`, source
  `Notarized Developer ID`
- Application launch: PASS through `open /Applications/GateReeve.app`
- Apple bundle version: `0.1.0`, expected because
  `macosBundleVersion("0.1.0-rc.6")` deliberately removes the prerelease
  suffix for `CFBundleShortVersionString`; the exact RC identity remains bound
  by the public filename, digest, tag, and sealed primary record.

The read-only linked-Cask preflight then found that its workflow provenance
check incorrectly equated GitHub's moving workflow-dispatch branch `head_sha`
with the immutable release source. Successful primary recovery run 33458101816
has dispatch head `cf9bbf7596e48d29dc12308dea585efced95ca26`, while its downloaded,
fully published packet correctly binds RC.6 to ancestor source
`10a726411fd46f58263f8c989ac83f1a65bdf33f`. Cask work remains
nonpublishing until the finalizer and publisher validate source identity from
their sealed downloaded packets instead. After that correction merges, a fresh
feature-final slice will execute the linked Cask lifecycle and record the final
Homebrew installation evidence.

## Linked Homebrew Cask finalization

- Hosted workflow:
  [33525598814](https://github.com/TrentBrown/gatereeve/actions/runs/33525598814)
- Workflow result: PASS from corrected `main`
  `1c19304e67f34f12930b1c51c5e06621c05c6734`
- Primary publication run: `33458101816`
- Immutable RC.6 source:
  `10a726411fd46f58263f8c989ac83f1a65bdf33f`
- Cask release ID: `gatereeve-cask-v0.1.0-rc.6`
- Exact Cask plan SHA-256:
  `9e9e979a2b4760a5e459c62994a7c6320850e5e3c3858bb2e097a5389adfa0c1`
- Exact Cask file SHA-256:
  `c0859208ec05cdadb7b0c55c5ff964b0ab0c93b609712f0775cd30fbc063bbf6`
- Linked record SHA-256:
  `46d4704ec00f6adcdb0c16d0e2ab1a1be8065f683f5e98d808b65b5b41f8cce8`
- DMG SHA-256: exact match,
  `47121af4f246dbef0d6597c9361df346baacf128d3042fa122a2c8d83772e314`
- Direct-install evidence SHA-256:
  `8035c97847472faf1c9e94735759d021e86b0516acd78737302141f170f4f173`
- Publication state: `prepared`, unapproved, Cask surface pending
- Protected rehearsal:
  [33525707781](https://github.com/TrentBrown/gatereeve/actions/runs/33525707781),
  PASS after the separate `release-publication` environment review
- Rehearsal artifact:
  `gatereeve-v0.1.0-rc.6-linked-homebrew-cask-rehearsal`, artifact ID
  `9807833115`, archive SHA-256
  `d69e78732760a29507b20664c939714cc67a12d1ff183da4552bed1e416c5c84`
- Rehearsal result: `dryRun=true`, Cask release state `prepared`, tap state
  `present`, approval `unapproved`, surface `pending`, receipt `null`
- Independent retained-packet inspection: PASS; plan, linked record, Cask,
  immutable source, and universal DMG digests match the finalizer packet
- Independent no-mutation check: PASS; live Homebrew Cask remains
  `0.1.0-rc.2` at blob `f08840728d0b329a9dfe037467782d8c335c396e`

The finalizer authenticated the successful primary recovery run as a reviewed
`main` producer, proved the immutable source is its ancestor, downloaded the
retained primary result, and independently matched the packet source commit
and tag. It neither rebuilt trusted bytes nor mutated the Homebrew tap.

The protected rehearsal downloaded that exact retained packet and ran the
hosted publisher in dry-run mode. The workflow's real publication job was
skipped. Its output preserved the sealed plan digest
`9e9e979a2b4760a5e459c62994a7c6320850e5e3c3858bb2e097a5389adfa0c1`,
the exact Cask digest
`c0859208ec05cdadb7b0c55c5ff964b0ab0c93b609712f0775cd30fbc063bbf6`,
and the pending/unapproved publication state. A fresh live check after the run
confirmed the tap still serves RC.2, proving the rehearsal made no public
mutation. Real Cask publication now requires a distinct explicit approval of
that exact sealed plan.

## Linked Cask publication attempt

- Explicit approval: APPROVED by the user for exact sealed plan
  `9e9e979a2b4760a5e459c62994a7c6320850e5e3c3858bb2e097a5389adfa0c1`
- Protected publication run:
  [33527077278](https://github.com/TrentBrown/gatereeve/actions/runs/33527077278)
- Environment review: APPROVED; GitHub recorded no remaining pending
  deployments before runner assignment
- Exact-packet source and finalizer binding: PASS
- Result: STOPPED before mutation because the environment secret
  `GATEREEVE_PUBLICATION_TOKEN` was absent and therefore `GH_TOKEN` was empty
- Retained result artifact ID: `9808463980`, archive SHA-256
  `347ce30e4e3539d2159ccbd8ff65008c8a287f8444713794f09e8edb2080dd75`
- Post-failure no-mutation check: PASS; live Homebrew Cask remains RC.2 at blob
  `f08840728d0b329a9dfe037467782d8c335c396e`, and no RC.6 tap PR exists

This is a bounded configuration failure, not a partial publication. After the
documented fine-grained tap token is stored once in `release-publication`, a
fresh dispatch must reuse the same finalizer run, source, tag, plan digest, and
approver. Do not use GitHub's generic rerun and do not alter the Cask bytes.
