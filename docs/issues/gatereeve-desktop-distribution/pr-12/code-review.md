# Code Review - PR #12

**Pinned range:** `8a93f4a1ad31f5b77fdea061ff6c8a7f9b5d82df..6d3ef5da66e2286e5067b23df70fc1cef12ded8c`

## Findings

No findings.

The review traced the exact protected failure from imported certificate and
private key through Electron identity discovery and the later `codesign`
invocation. It then reviewed runner-state capture, Bash 3.2-compatible parsing,
search-list ordering, unconditional restoration, keychain deletion, credential
file cleanup, and the workflow contract assertions.

The important invariants are coherent:

- `.github/workflows/coordinated-release-prepare.yml:245-251` records the
  original search list before any mutation and publishes only temporary paths
  through `GITHUB_ENV`.
- `.github/workflows/coordinated-release-prepare.yml:268-280` prepends the
  ephemeral keychain while preserving existing runner keychains and retains an
  explicit keychain constraint for the signer.
- `.github/workflows/coordinated-release-prepare.yml:321-345` restores the
  original search list before deleting the temporary keychain and files, even
  after a failed signing or notarization step.
- `cli/test/coordinated-workflow.test.js:25-36` prevents silent removal of both
  the setup and restoration commands.

## Residual risks and test gaps

- PR CI cannot enter the `main`-only `release-publication` environment, so only
  the corrected post-merge rehearsal can prove the real `codesign` lookup.
- The workflow contract is textual and cannot emulate macOS Security framework
  behavior on Linux. Hosted universal packaging and native runtime checks pass,
  while the protected rehearsal supplies the missing secret-bearing evidence.
- The local container lacks `unzip`; all hosted acceptance and container jobs
  pass the complete suite.
