## Judge Evaluation

**Verdict:** PASS WITH CONCERNS

**Pinned range:** `20b555eb6abeae051b32cfc309321478c196337a..34d272628b42662b2f0781175b9ebcc7da98b63e`

### Rubric Evaluation

| # | Criterion | Result | Evidence |
|---|---|---|---|
| R5 | Apple trust | PASS WITH CONCERNS for P6; overall `NOT YET` | `APPLE-RELEASE-SETUP.md` gives an executable individual-enrollment, fresh-CSR, G2 identity, team-key, recovery, GitHub configuration, rehearsal, and rotation path. `.github/workflows/coordinated-release-prepare.yml:197` confines credentials to a protected nondeployment job and cleans them at line 307. `apps/desktop/scripts/notarize-macos.mjs:57` through line 137 verifies, notarizes, staples, assesses, and writes non-secret exact-byte evidence. The real protected service run is necessarily post-merge. |
| R6 | Coordinated release and recovery | PASS WITH CONCERNS for P6; overall `NOT YET` | `.github/workflows/coordinated-release-prepare.yml:318` independently verifies the trusted bytes on both native architectures. `cli/src/plugin/coordinated-release.js:96` validates the complete evidence and line 120 rejects incomplete or contradictory trust state before it enters the coordinated record. Later public convergence remains out of scope. |

### Scope Check

- **Scope creep found:** No.
- **Details:** The changes implement P6/I-5: credential guidance, protected
  signing/notarization, exact trust evidence, native verification, and
  publication guards. They do not add update discovery, website publication,
  public release, or Cask behavior.

### Gap Check

- **Unaddressed AC:** No P6 implementation gap. AC5 and AC6 remain intentionally
  incomplete at the feature level because their live public outcomes are owned
  by P8/P10.
- **Operational gap:** The `main`-only protected environment cannot execute the
  branch-defined workflow before merge. The first nonpublishing protected
  rehearsal is therefore a declared post-merge check, not evidence already
  claimed by this packet.

### Contradiction Check

- **Contradictions found:** None. The workflow retains `contents: read`, marks
  the environment use as `deployment: false`, and creates only temporary CI
  artifacts. It cannot perform any public publication surface in this slice.

### Concerns

The remaining concern is integration with real Apple signing and notarization
services. Unit tests accurately model command sequencing and hosted CI proves
the development package path, but only the protected rehearsal can reveal
certificate-chain, keychain-import, or Apple-service behavior. The runbook and
tracker identify the exact rehearsal, and R5 remains `NOT YET`, so this concern
does not block merging the code needed to run it.
