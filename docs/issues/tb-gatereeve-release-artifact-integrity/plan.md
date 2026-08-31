# Plan - tb-gatereeve-release-artifact-integrity

**Feature:** `tb-gatereeve-release-artifact-integrity`
**Spec:** [`spec.md`](spec.md)
**Design:** [`design.md`](design.md)
**Interview:** [`interview.md`](interview.md)
**Created:** 2026-08-31

## Inputs

- `spec.md` controls scope, required behavior, and rubric mapping.
- `design.md` supplies the chosen architecture, constraints, and boundaries.
- `interview.md` supplies supporting examples, rationale, references, and edge cases.

## Strategy

Add one repository-local integrity contract to the Plugin release layer, reuse
it at every producer/consumer boundary, and make the hosted dependency graph
prove the first upload before Apple trust begins. Keep the publishable
marketplace directory unchanged; carry its producer commitment as adjacent
release evidence. Extend existing release and workflow contract tests with the
exact RC.5 failure modes. Deliver the correction in one reviewed code slice,
then keep the feature open through the separately governed RC.6 primary and
Cask publication/install evidence.

## Steps

- **P1.** Implement a deterministic Plugin candidate integrity manifest and
  strict writer/verifier for regular files, safe relative paths, sizes,
  SHA-256 digests, and aggregate tree identity; compose it with the existing
  semantic marketplace validation. **Advances:** R1, R3, R4, R5.
- **P2.** Change preparation to emit the companion commitment, add a
  nonpublishing first-hop verification job, gate Apple trust on it, explicitly
  include hidden files in every Plugin-carrying upload, and verify the original
  commitment at trust assembly, finalization, publication, and retained-result
  consumption. **Advances:** R2, R3, R4, R6.
- **P3.** Add positive and adversarial unit/integration tests plus workflow
  contract assertions for hidden stripping, visible loss, additions, byte
  mutation, malformed evidence, semantic incompleteness, transfer ordering,
  and authority/topology preservation; update release operations documentation
  with the new failure and recovery contract. **Advances:** R1, R2, R3, R4,
  R5, R6.
- **P4.** Run targeted and broad verification, complete the governed PR
  boundary, obtain human review, merge only the reviewed topic into `main`, and
  verify exact mainline CI. **Advances:** R1, R2, R3, R4, R5, R6.
- **P5.** From the exact corrected `main`, run fresh RC.6 preparation and
  protected Apple trust, inspect native ARM64/x64 and integrity evidence, seal
  the publication plan, run the protected nonpublishing rehearsal, obtain
  separate publication approval, publish, and verify every public asset,
  digest, marketplace surface, manifest, website, and ordered receipt.
  **Advances:** R2, R3, R4, R6, R7.
- **P6.** Have the user install and launch the exact public RC.6 DMG, seal and
  rehearse the linked Cask plan, obtain distinct Cask approval, publish through
  the guarded workflow, and verify Homebrew installs or upgrades to launchable
  RC.6. **Advances:** R6, R8.
- **P7.** Evaluate all acceptance criteria and rubric rows from evidence,
  preserve the completion record, and close the feature only with zero
  `NOT YET` or `FAIL` criteria. **Advances:** R1, R2, R3, R4, R5, R6, R7, R8.

## Verification

- Targeted tests cover integrity generation/verification, coordinated release
  assembly, hosted publication, and workflow dependency/upload contracts.
- The repository's broad portable acceptance suite runs against the exact PR
  head and again through hosted mainline CI.
- Protected RC.6 run artifacts prove the real GitHub artifact round trips and
  all Apple/native/publication boundaries.
- Public asset hashes, marketplace verification, direct Mac evidence, linked
  Cask evidence, Homebrew version output, Gatekeeper assessment, and launch
  confirmation provide final operational proof.
- **Final step:** Run full rubric evaluation and produce the completion report.
