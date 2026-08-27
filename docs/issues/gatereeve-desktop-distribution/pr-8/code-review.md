# Code Review - PR #8

**Result:** PASS — no findings remain.

**Pinned base:** `dae5c536fc1d90b17a5d7397f34a6a9fc0d8cb4f`

**Pinned head:** `a5a8e93ad16d206861c1f8845823bd9ca309b52f`

## Findings

No correctness, regression, security, or test-gap finding blocks this slice.

## Findings resolved before the pinned head

- Review found that selecting both agents incorrectly required both to be
  ready, contradicting the approved at-least-one-selected-agent invariant.
  The observer and contract now require all shared prerequisites plus any one
  ready selected agent, while the UI keeps the incomplete selection visible
  (`apps/desktop/main/setup-observer.js:363-364`;
  `apps/desktop/shared/contracts.js:129-136`;
  `apps/desktop/renderer/renderer.js:132-151`).
- Review found that changing a selection could carry stale, now-unselected
  agent cards into the checking state. The coordinator now clears ephemeral
  detection results before rechecking (`apps/desktop/main/coordinator.js:208-223`).
- Review found that a failed native Plugin listing was mislabeled as proof of a
  missing Plugin. JSON-first detection now distinguishes `unavailable`, keeps a
  bounded text fallback, and presents exact manager-owned update guidance
  (`apps/desktop/main/setup-observer.js:109-158,253-325`).

All three fixes have regression coverage in
`apps/desktop/test/setup-observer.test.js:56-193`,
`apps/desktop/test/coordinator.test.js:245-301`, and
`apps/desktop/test/setup-renderer.test.js:155-186`.

## Review notes

- Finder-compatible discovery is bounded to explicit and known directories,
  with bounded NVM-version-root enumeration only on macOS
  (`apps/desktop/main/executable-discovery.js:18-81`).
- Setup subprocesses have a ten-second timeout and fixed executable/argument
  pairs; no renderer-controlled command reaches `execFile`
  (`apps/desktop/main/setup-observer.js:70-85,160-376`).
- The IPC surface accepts only selection, recheck, clipboard, named reads, and
  established OS actions; it exposes no generic process execution or workflow
  passage channel (`apps/desktop/shared/contracts.js:3-21`).
- Exact compatibility metadata rejects unknown fields, duplicates,
  contradictory equal/different state labels, and absent pairs
  (`apps/desktop/main/setup-compatibility.js:16-91`).

## Residual risks and later evidence

- Claude is not installed on the NUC, so its live native-manager output is
  represented by deterministic documented JSON/text fixtures rather than a
  second live host probe.
- This source slice does not prove universal packaged-byte behavior; P4 / I-3
  owns that evidence.
