# Code Review - PR #1

**Range:** `d9127d89c55c667c83876854ccf0fef053aec585..8f30769b6e3928735c786cbf64b48d09e949ec91`
**Result:** No remaining findings

## Findings

No unresolved correctness, regression, security, or test-gap finding remains
in the pinned diff.

## Findings Resolved During Review

1. **Boundary evidence could become stale after entering human review.**
   `record-merge` now reconstructs the active attempt with freshly supplied
   fingerprints and requires `boundary.requiredGates.current`; omitting or
   changing them fails closed. See
   `plugin-src/shared/resources/protocol/transitions.js:77` and
   `plugin-src/shared/resources/protocol/model/workflow-model.json:195`.
2. **Next-action output named the wrong boundary command and omitted attempt
   identity for gate recording.** The observer now emits
   `boundary request-review <attempt-id>` and
   `gate record <attempt-id> <gate-id>`. See
   `plugin-src/shared/resources/protocol/observer.js:113`.
3. **A generated CLI projection could outrank canonical source resources in a
   development checkout.** Adapter lookup now prefers the plugin source and
   falls back to staged resources only in installed packages. See
   `cli/src/protocol/client.js:4`.

All three have focused regression coverage in
`cli/test/boundary-protocol.test.js`, `cli/test/lifecycle.test.js`, and the CLI
parity suite. The full 95-test JavaScript suite passes after remediation.

## Residual Risks and Test Gaps

- Live Claude manager activation is not exercised on this host.
- Responsive DOM behavior is exercised, but the collaborative browser could
  not capture a visual image for human inspection.
- Human-confirmed actors are cooperative-process attestations. A malicious
  full-access process is explicitly outside the design's security boundary.
- First production use should verify that skills consistently supply fresh
  external facts and gate fingerprints at every semantic mutation.
