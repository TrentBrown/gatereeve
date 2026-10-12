# Scoped spec evaluation

PASS for the S1 scope, source `ad022461458d1dda4c66ad11f6b26c9462c40327`, base `ef725bbedfda28be0967fefde6cf2748679612c2`, SLICE, attempt s1-pr77-a2. P1/P2 are implemented. This is not whole-feature completion. Full Verification is in verification.md; provider fixtures are explicitly distinguished from the independent Judge gate.

| Criterion | Result | Evidence |
|---|---|---|
| R4 | PASS | compact-review history sentinel, standalone report, source alias/symlink/rename and strict record-location tests; approved docs and current full Verification/attachment remain accessible. |
| R5 | PASS | missing/draft requirements reject; source tree, filtered digest/input identity, verified snapshot bytes/modes and separate bound host audit; Judge validator rejects audit/coverage mismatch. |
| R15 | PASS | 905+ changed files and 24 MiB+ material produce sub-64 KiB manifest, <=64 KiB chunks with exact offsets/digests; snapshot starts successfully. |
| R16 | PASS | rename keeps old/new paths and edited lines; identical feature/slice patch refs share one payload with avoided-byte metric. |
| R17 | PASS | binary create/change/delete with accessible digest-bound old/new bytes, null absent sides, tab-containing filename and no inline GIT binary patch. |
| R18 | PASS | exact base/head and final-slice base; complete allowed source view preserves earlier integrated/shared app code, unrelated source and package dependencies; final-slice inventory remains distinct from complete-feature inventory. |
| R22 | PASS in S1 scope | opted-in Judge3/model1.5/core1.1; old definition path unchanged; old-model/store/module suites and migration impact preserve attempts, gate requirements and authorization. Recovery adoption itself belongs to S2. |

AC2 and AC6 are covered for S1. AC8 historical compatibility is covered for compact inputs. AC1/3/4/5/7, remaining AC8 portability/guidance/orchestration, R10 advisory reuse and R24 full cost/journey measurements remain NOT YET for later slices. No requirement is waived or marked whole-feature complete. The final boundary must evaluate every R1-R24 criterion.

Residual limit: classification uses declared record namespaces and known legacy record names; repositories must keep required production input out of reserved record namespaces. Unknown executables reject preparation rather than being hidden.
