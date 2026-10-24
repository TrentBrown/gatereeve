# Explicit Cask exception — PR84

Trent approved: “Approve and proceed.” This answers the immediately preceding request to accept only the four Homebrew Cask artifact-download failures, conditional on the remaining Plugin CI passing. Plugin CI40118890306 completed SUCCESS on c1ad9c57be896114cf994b62fae799f87aeea7b7. Subsequent changes are retained review/merge evidence only.

Scope: PR84; Cask install and upgrade (arm64/x64), Public Cask install (arm64/x64), only when their unchanged workflow fails downloading gatereeve-v0.1.0-rc.8-linked-homebrew-cask-result from historical publication33541222023. Preserve failures. No exception for product tests, unexpected Cask failures, source/target drift, or GitHub branch protections. Repair the obsolete Cask rehearsal dependency separately.

Merge authorization and local installation/publication of a bumped version were separately and explicitly granted. Final published Cask acceptance remains required; this exception applies only to the historical PR rehearsal.
