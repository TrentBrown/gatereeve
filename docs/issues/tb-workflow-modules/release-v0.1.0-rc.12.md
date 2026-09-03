# Release Evidence - GateReeve v0.1.0-rc.12

**Feature:** `tb-workflow-modules`

**Feature-final PR:** [#64](https://github.com/TrentBrown/gatereeve/pull/64)

**Feature-final merge:** `8d2fb4c51d01f24bb330ac67ed1679809fc3547f`

**Release:** [v0.1.0-rc.12](https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.12)

**Release Conductor:** [start run 33800046588](https://github.com/TrentBrown/gatereeve/actions/runs/33800046588), [resume run 33807948528](https://github.com/TrentBrown/gatereeve/actions/runs/33807948528)

**Outcome:** PASS

## Source and version binding

Release Conductor pinned `v0.1.0-rc.12` to the exact feature-final integration
commit `8d2fb4c51d01f24bb330ac67ed1679809fc3547f`. The public GitHub release targets
that commit. The universal installer and the public Homebrew Cask both identify
version `0.1.0-rc.12` and bind to the same DMG digest.

- Installer: [GateReeve-0.1.0-rc.12-macos-universal.dmg](https://github.com/TrentBrown/gatereeve/releases/download/v0.1.0-rc.12/GateReeve-0.1.0-rc.12-macos-universal.dmg)
- Installer SHA-256: `16c0613d8fc2750f0a54930027f99b133279a4511cf343435bce8932d8aa4ce7`
- Installer size: 257,339,551 bytes
- Homebrew Cask: [`Casks/gatereeve.rb`](https://github.com/TrentBrown/homebrew-gatereeve/blob/main/Casks/gatereeve.rb)
- Cask publication: [`9833ff3ac125886652383feb049ad57d3843a812`](https://github.com/TrentBrown/homebrew-gatereeve/commit/9833ff3ac125886652383feb049ad57d3843a812)
- Desktop update metadata was published to `main` by merge commit
  `f2b16e02b6860fe5df8c1f864bcd82d0916b2abe`.

## Trust and runtime evidence

The protected start run passed the following exact-artifact checks:

- built a Developer ID-signed universal DMG;
- notarized and stapled the exact DMG and passed Gatekeeper assessment;
- verified the trusted DMG natively on Apple Silicon (`macos-15`) and native
  Intel (`macos-15-intel`), exceeding the accepted Intel-or-Rosetta requirement;
- aggregated exactly one native verification document from each architecture;
- sealed the trusted Plugin/Desktop lifecycle before publication;
- sealed and rehearsed the exact primary publication plan before publishing it.

The user then supplied two direct public-installer attestations in the active
release conversation on 2026-09-03:

> I downloaded and ran the RC.12 installer, and it worked.

> yes. I launched GateReeve RC.12 successfully.

The resume run bound that confirmation to the public DMG digest at
`2026-09-03T21:26:48.141Z`, sealed and rehearsed the linked Cask plan, published
only that exact plan, and passed all four final smoke paths:

- public Cask install on arm64;
- public Cask install on x64;
- disposable-tap Cask install and upgrade on arm64;
- disposable-tap Cask install and upgrade on x64.

The complete source verification retained in the PR #64 packet also passes the
fixed six-state rail and shared Finalizing module UI, its accessibility cases,
explicit adapters, authorization invalidation, real isolated task PTYs, bounded
evidence, cancellation, and preservation of the user terminal. Native packaged
runtime checks plus the user's public installed-app launch bind those tested
behaviors to the shipped build; the manual attestation did not separately
re-exercise every automated command-session case.

## Terminal conductor evidence

Run 33807948528 completed successfully at `2026-09-03T22:41:03Z`. Its retained
artifact `gatereeve-v0.1.0-rc.12-release-conductor-0012-complete` has artifact ID
`9915910944`. The terminal state is sequence 12, stage `COMPLETE`, condition
`complete`, with no failure and no next action.

- Terminal state SHA-256: `08bcadcc3e2f6548426da7aeae63d3537fbf9e5b94ee1fce1dd7ae30f0c2b8c4`
- Terminal predecessor SHA-256: `7300114cc140a787f299f7ccbda38a53321a2e495f4697a2fde1925b56a5a2cc`
- Retained conductor artifact IDs: `9910697404`, `9910747539`, `9912997025`,
  `9913036974`, `9913065792`, `9913254121`, `9913261848`, `9913686918`,
  `9913701151`, `9915520974`, `9915795206`, `9915910944`.

GateReeve's installed `gatereeve/release-conductor` provider version `1.0.0`
downloaded and independently validated that chain. It proved that the release
source contains the final merge input (both are the exact commit `8d2fb4c...`),
returned `PASS`, and the protocol core recorded the result under finalization
attempt `f1-gatereeve-release-vnext-20260903`. The retained local provider
evidence is
[`runtime/module-attempts/module_observation_39f72562-28a1-44f0-ab2c-4e37738b2ca9.json`](runtime/module-attempts/module_observation_39f72562-28a1-44f0-ab2c-4e37738b2ca9.json)
with SHA-256
`087e18bc47bc0da7bcc9d71c57c8e0da3ae9ebfab6c14ac085e3876f5cd73c0a`.

## Release-process observations

The process preserved three deliberate protected-environment approvals: Apple
trust production, primary public publication, and Homebrew Cask publication.
It also paused for a direct download/install/launch attestation before linking
the Cask. Those boundaries prevented credentials or publication authority from
being exercised merely because a build passed, but GitHub Actions made the
overall state and next required action harder to follow than necessary.

The most useful simplifications are:

1. Make GateReeve's Finalizing card the normal release dashboard: show the
   conductor stage, exact version and digest, elapsed time, waiting approval,
   safe next action, and direct links to the approval page and installer.
2. Add a deliberate in-app direct-install attestation action that displays the
   exact public version/digest and dispatches the bound resume after confirmation.
3. Add notifications when the workflow changes from running to waiting for a
   person, and when it completes or fails.
4. Offer a single “start next release candidate” action that computes and
   previews the next RC version while retaining explicit confirmation.
5. Build and cache the small release CLI once per run. In this release, each of
   the four final smoke jobs spent roughly four minutes repeating
   `npm ci --prefix cli`.
6. Reduce repeated full artifact discovery in state-recording jobs. The
   `CASK_PUBLISHED`, `SMOKE_VERIFIED`, and `COMPLETE` record jobs each spent
   roughly four minutes reconstructing durable state. A verified chain index or
   direct predecessor handoff can preserve immutability with fewer API retries.
7. Keep one build and reuse its exact bytes throughout trust, publication,
   direct install, Cask publication, and smoke checks, as this conductor already
   does. Dedicated macOS runner capacity would further reduce queue variance.

The protected approvals should remain separate by default. Combining them
would be faster, but it would also collapse independent trust and publication
boundaries. The better first improvement is to make each required approval
obvious and one click away from GateReeve.
