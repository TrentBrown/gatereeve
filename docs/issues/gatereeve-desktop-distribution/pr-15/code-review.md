# PR #15 Code Review

**Reviewed range:** `5b66b98de73eb8946293d509ba08db543edb8626..fd9a43e2c31a4cf492848153235268eca16c3e65`

## Findings

No findings.

The review covered request privacy and bounds, abort behavior, manifest and
update-state validation, semantic channel ordering, cache freshness and atomic
persistence, concurrent checks, shutdown, notification opt-in and deduplication,
IPC renderer authentication, fixed external navigation, renderer availability,
website trust gating, staged RC identity, and test coverage.

The first hosted head exposed a Node 22 timeout-liveness problem in the new
transport test. The source was corrected by keeping the bounded request timer
referenced; the pinned head above passes both Ubuntu 22.04 and Ubuntu 24.04
Desktop contract jobs.

## Residual risks and test gaps

- The checked-in production manifest is intentionally empty. P8 must prove that
  the real publication adapter writes this exact schema only after the Desktop
  prerelease and Apple-trust evidence are durable.
- Native notification appearance is operating-system-owned; tests verify the
  opt-in and delivery contract, while the existing Electron runtime jobs prove
  application startup rather than visually inspecting Notification Center.
- No local Linux application smoke was possible on this NUC because `xvfb-run`
  is absent. Exact-head hosted Electron smoke passes on both supported Ubuntu
  images and macOS, and packaged bytes launch on both Mac architectures.
