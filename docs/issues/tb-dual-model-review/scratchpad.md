# Decision Scratchpad - tb-dual-model-review

**Feature start:** 2026-11-18

## D1 - Runtime selection and dual-review authority contract

- [x] **Promote**
- **Confidence:** HIGH
- **Blast radius:** Protocol evidence/authority, native instructions, CLI and desktop projections.
- **Triggered by:** Approved design/specification introduce paired independent reviews and a new autonomy value.

Use the approved design and interview decisions as the source of policy. Do not hard-code model versions or introduce model-selection configuration. Preserve original reports and distinguish autonomous adjudication from reviewer PASS. Concrete schema/API changes require compatibility treatment and meaningful contract tests. Implemented in the versioned current/8 contract; see D4.

## D2 - GitHub main protection and delegated run authority

- [x] **Promote**
- **Confidence:** HIGH
- **Blast radius:** GitHub protection for TrentBrown/gatereeve main and the current named run.
- **Triggered by:** Human granted delegated autonomy; GateReeve rejected it because GitHub reported main unprotected. Human then explicitly requested protecting main: "Let's get it done."

No pre-existing branch-protection rule or ruleset was found. Enabled classic main protection requiring pull requests with zero required additional GitHub approvals, enforcing the rule for administrators, dismissing stale reviews, and disallowing force pushes/deletion. No required status-check list was introduced. GitHub subsequently reported protected=true. Current adapter accepted delegated autonomy under the existing instruction for run 19bfd222-e20d-4ef4-ba8b-b6d55d1d83f3, event sha256:3dbe2b3f3cb4192ecd7ced72181dd6a5fb9a58db17ad08bfb38efda6fa41dc05. This grants no final release merge or deployment authority.

## D3 - Immutable-object publication under concurrent readers

- [x] **Promote**
- **Confidence:** HIGH
- **Blast radius:** CurrentStore.readSafe for retained content-addressed objects; canonical document checks remain strict.
- **Triggered by:** The new full-rigor parallel-review regression reproducibly failed with "Evidence changed during capture" before a reviewer launched.

Exclusive object publication hard-links a private staging inode to its final hash path, syncs the directory, then unlinks the private name. A concurrent reader can observe the resulting ctime/link-count change even though the immutable content is identical. Permit only a decreasing link count ending at one for an exact content-addressed object, with unchanged ownership/mode and matching content hash; retain size/mtime/path/inode checks. Canonical documents do not receive this exception. This fixes a storage interaction exposed by required parallel reviews, rather than relaxing review integrity generally.

## D4 - Current/8 isolates the stronger acceptance contract

- [x] **Promote**
- **Confidence:** HIGH
- **Blast radius:** Product protocol identity/database, staged packages, desktop protocol recognition and version assertions.
- **Triggered by:** Two required provider perspectives and autonomous adjudication materially change what acceptance means.

Bump the product to gatereeve/current/8 and store its records in workflow.sqlite.current-8. Read current/7 activation only as earlier provenance during explicit resumption, preserving the original database. This prevents old current/7 consumers from silently operating on new authority records. This feature's real governing run remains under the separately installed current/7 adapter; changing product source does not upgrade its interpreter or grant new authority. Historical single-review evidence cannot become a current/8 pair.

## D5 - Autonomous judgment is not an implicit reviewer veto

- [x] **Promote**
- **Confidence:** MEDIUM
- **Blast radius:** Autonomous planning authority and review adjudication; original mandate and independent reports stay immutable.
- **Triggered by:** Implementation review against design sections 5–6 showed that unconditionally requiring a reviewer PASS for every semantic scope/mandate opinion would recreate the veto and non-convergence the third mode is intended to resolve.

Distinguish a demonstrated violation from a reviewer's unsupported claim. Autonomous judgment can rebut a completed negative assessment with retained counterevidence and an explicit account of the unchanged goal and every fixed constraint. A claimed mandate violation can be marked unsupported with evidence, never accepted as a known violation. Negative planning assessments remain FAIL in their original records and in the derived authority's evaluation; an explicit autonomous-judgment basis records dispositions rather than inventing independent PASS. Missing/UNAVAILABLE assessment, missing required coverage, integrity failures and failed mandatory checks remain ineligible. Independent planning evaluation still occurs. This interprets the approved mandate-bound judgment authority; it does not authorize changing the human goal/constraints or waive factual obligations.

Keep existing explicitly scoped human exception authority distinct from unattended adjudication (approved design section 4 and AC5). A human gate exception may retain an honest UNAVAILABLE outcome under existing policy; it is not a second review or an agent-authored PASS. Bind review exceptions to both provider histories/selection and do not let a finding-specific exception silently cover a missing peer. Autonomous acceptance still requires its own mandatory proof/adjudication rules.

## D6 - Independent initial-round provenance and complete adjudication

- **Confidence:** HIGH
- **Blast radius:** Boundary review qualification, recovery, adjudication, retained packets and native session guidance.
- **Triggered by:** Actual Sol 6.1 high review sha256:a2d69a4f171d91c905eac469fb3574f365e54f8b9f00b68e5864ba51b352ac53 found REV-001 through REV-004.

Require a recorded coordinated initial round before targeted individual perspectives can establish acceptance. Retain its pre-round baseline for interrupted-operation recovery, preserving both initial independence and original completed jobs; include original receipts/baseline in packet closure. A completed negative review is adjudicable only when every required dimension/criterion is assessed, delta coverage is complete and historical open findings have explicit current reconciliation. Keep incomplete native FAIL visible while refusing to convert it into eligible residual risk. Native SessionStart must report the actual autonomous mode and mandate-bound guidance. These repairs enforce the approved AC rather than extending the human mandate. The first actual Opus attempt returned malformed structured output and remains UNAVAILABLE; it supplied no usable assessment.
