## Judge Evaluation

**Verdict:** PASS
**Evaluation basis:** approved `spec.md` plus pinned diff `0aac0e525bc59368301e22f305198ac70a09aef5..6531b39d8e905e98af9bb66bf4eb0af89c609d22` only.

### Rubric Evaluation

| # | Criterion | Result | Evidence |
|---|---|---|---|
| R1 | Producer commits to a safe complete Plugin tree | PASS | `cli/src/plugin/plugin-candidate-integrity.js:177-310` inventories sorted safe regular files, seals path/bytes/SHA-256/tree identity, requires external placement, and verifies exact agreement; `cli/src/plugin/release.js:184-211` makes it part of protected preparation with rollback on failure. |
| R2 | Artifact round trip gates Apple trust | PASS WITH CONCERNS | `.github/workflows/coordinated-release-prepare.yml:69-109` uploads hidden files, downloads and verifies the producer commitment, and includes the verification job in `desktop-trust.needs`. Workflow tests pin this ordering. The real hosted RC.6 trace remains required before feature completion. |
| R3 | Later handoffs preserve and verify exact bytes | PASS WITH CONCERNS | Finalization and both result uploads preserve hidden files; trusted lifecycle, recovery, coordinated packet verification, hosted rehearsal/publication, and linked Cask preparation all call the exact verifier (`trusted-release-lifecycle-v2.js:97`, `coordinated-release.js:292,649`, `hosted-publication-v2.js:175,280`). Real hosted RC.6 handoff evidence remains required. |
| R4 | Semantic Plugin verification remains mandatory | PASS | `assertPluginCandidateSemantics` checks release identity, both catalogs/manifests/hooks/provenance/shared inventories and parity before commitment creation and after every verification. The self-consistent incomplete-tree regression fails as required. |
| R5 | Regression suite covers the RC.5 failure class | PASS | `plugin-candidate-integrity.test.js` names and rejects hidden stripping, visible loss, additions, byte changes, malformed evidence, semantic incompleteness, and symlinks; producer and packet integration tests cover real repository contents and later mutation. |
| R6 | Existing topology, authority, and history remain intact | PASS | The changed workflows retain the universal DMG, native ARM64/x64 jobs, `release-trust`/`release-publication` separation, bounded recovery, and retained publication packets. No UI, PortReeve, credential, tag, or released-byte code changed; runbooks preserve RC.5 and require forward correction. |

### Scope Check

- **Scope creep found:** No.
- **Details:** Changes are limited to Plugin integrity evidence, the hosted handoffs that carry it, tests, release documentation, and feature governance. There is no product UI, shared runtime, PortReeve, native-service, credential, or architecture-topology expansion.

### Gap Check

- **Unaddressed AC:** None within this implementation slice. AC2/AC3 retain live hosted proof, and AC7/AC8 retain RC.6 publication and Mac/Homebrew evidence, exactly as assigned to P5-P6.

### Contradiction Check

- **Contradictions found:** None. The directory packet remains unchanged; the manifest is adjacent rather than publishable; exact-byte checks supplement rather than replace semantic checks; and publication authority remains separate from Apple trust production.

### Concerns

The key residual risk is operational rather than an uncovered code path:
GitHub's real artifact service and macOS protected runners must reproduce the
contract-test result for RC.6. The plan correctly leaves R2, R3, R7, and R8
open until that evidence exists, so this concern is nonblocking for PR #44 and
blocking for final feature completion.
