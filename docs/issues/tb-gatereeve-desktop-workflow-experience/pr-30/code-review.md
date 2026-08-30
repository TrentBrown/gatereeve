# PR #30 Code Review - Alert and attention policy

**Pinned diff:** `68e0c17c9274401cc938ae8c01b84f935a4128fe..f1af98bc9175aec38b4236c744972614ed9ce46f`

## Findings

No findings.

## Review notes

- The pure `globalAlert` policy excludes activity-level source changes,
  deduplicates messages, and keeps runtime/incompatible conditions severe.
- Removal of legacy alert elements is complete across markup, renderer element
  bindings, rendering functions, and accessibility assertions.
- Gate blockers remain local and guidance uses native disclosure semantics.
- Guidance context reads only `snapshot.projection.feature.state`; selecting a
  historical feature state does not alter it.
- Source, Setup, and notification placement match the approved P7 boundary.
- Eight visual-fixture scenarios and focused unit/integration assertions cover
  ordinary, exceptional, empty-action, and local-gate cases.

## Residual risks and test gaps

- Automated visual inspection of the existing local `file://` fixture was
  blocked by the in-app browser security policy. Human visual review remains
  available, and final running-Electron/minimum-width verification is planned
  in P8/I-8.
- No cross-repository, schema, dependency, security-boundary, or mutation
  contract changed in this slice.
