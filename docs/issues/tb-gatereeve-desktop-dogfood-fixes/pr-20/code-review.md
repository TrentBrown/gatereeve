# Code Review - PR #20

**Pinned diff:** `c030c142ac94611c8d3c37bdaa96125826b0fdb0..28a3971f33d11aaa76f4351057272d3e619f603e`
**Verdict:** PASS

## Findings

No findings.

The review inspected the implementation and surrounding contracts for Python
candidate ordering/override behavior, Setup reparenting, selected-artifact
state and asynchronous races, scroll/error/removal behavior, Markdown token
precedence, canonical relative resolution, external URL validation, IPC frame
authentication, application-protocol confinement, CSP, and denied
navigation/popups. The focused tests cover the important failure paths, and
the full 92-test Desktop suite passes.

## Residual risks and test gaps

- This Linux host cannot launch native Electron because `xvfb-run` is absent.
  Renderer integration and the production visual fixture pass, while the
  approved release phase requires packaged macOS ARM/Intel runtime evidence.
- The visual fixture is intentionally a deterministic preload simulation, not
  an operating-system external-browser test. Shared/preload/main validation
  and IPC tests cover the security boundary; the installed-Mac checklist will
  exercise the native system-browser behavior.
- R8 signing, notarization, architecture, publication, cask, and installed-app
  checks are not part of this code-review slice and remain explicitly open.
