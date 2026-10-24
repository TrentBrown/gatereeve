# rc.17 release complete

Public release: https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.17
Source: `d125d5e5c76d02a5c068a1dde2da10ef8fa54d2a` (PR84 merge).

Release Conductor start 40127131443 and resume 40132059788 succeeded. The terminal chain has all 12 stages, COMPLETE, no failure, state hash `3aa78612ee14f29f48271c8f44dd6071b071e6f4bc122473309767fb9e0221ba`. All 4 Cask checks and post-merge CI passed. The actual pinned rc.16 provider returned PASS. The governing core recorded release PASS/CURRENT at sequence 225 and FEATURE_FINALIZED/COMPLETE at sequence 226.

The exact public DMG was installed and launched locally; SHA256 `0380963494e88189e3e73e3603d2f577b7d86735d5651e48f25b93291040a788`. Signature, Gatekeeper, stapled-DMG and installed runtime checks passed. Both native plugins are installed/enabled at rc.17 from the public Git marketplace in Codex and Claude. Doctor ready in both; 338 native shared files and 49 Desktop files match public/merged identities. See public-install/ for proof and precise activation limits.

Desktop metadata PR85 and Homebrew Cask PR11 merged. The earlier four obsolete rc.8 Cask PR rehearsal failures remain retained as the explicitly accepted merge exception; no rc.17 release checks were waived. The original governing rc.16 package and signed app are preserved locally. Feature records are retained in the delivery branch; there is no configured external tracker task and no pending user action.
