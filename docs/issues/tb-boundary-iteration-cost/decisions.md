# Decisions - tb-boundary-iteration-cost

**Feature start:** 2026-10-12

Permanent implementation decisions will be promoted from scratchpad.md at review boundaries. No implementation decisions have been promoted yet. Approved product/design decisions remain in interview.md D1-D16 and the frozen approved design.md.

---

## Version compact review inputs instead of changing pinned legacy execution

**Confidence:** HIGH

**Blast Radius:** Agent-workflow input schema, Judge definition, protocol model compatibility and staged packages.

Add an optional versioned review-input declaration to agent-workflow definitions. Existing declarations without it continue through the existing builder. The adopted Judge definition selects compact inputs and history exclusion. This keeps frozen feature locks and earlier attempts interpretable while new definitions explicitly opt in. Keep streamed material outside the agent snapshot until its manifest/digests are validated; publish exclusion audit separately from the Judge-visible view.

**Triggered by:** P1/P2 require new input contracts while R22 prohibits silently changing older model semantics.

**Alternatives considered:**
- Replace the existing builder globally: changes old pinned gates implicitly.
- Increase its aggregate buffer: leaves duplicated payloads and history exposure.

**Promoted:** 2026-10-12. PR: [#77](https://github.com/TrentBrown/gatereeve/pull/77).

---

## Preserve capture source and explicitly bind current verification attachments

**Confidence:** HIGH

**Blast Radius:** Filtered source view and current Verification dependency materialization.

Historical MyLifeMap evidence directories contain capture scripts and YAML test flows beside logs. Retain these source/configuration files in legacy evidence directories instead of hiding them or rejecting an otherwise valid review. Strict governed packet/advisory namespaces still reject unclassified executables. Empty blobs shared by records and source cannot leak history and do not trigger copy-alias rejection.

Current Verification image/PDF references require explicit path/hash attachments. Verify and rematerialize those selected files under the reserved evidence root, keep the report unchanged, and reject missing/corrupted or ambiguously named attachments. This preserves current evidence while excluding archived report directories.

**Triggered by:** Read-only rehearsal of MyLifeMap's historical oversized whole-feature review and current image-evidence retention requirement.

**Alternatives considered:**
- Drop every evidence directory recursively: hides executable capture/test source.
- Restore all old evidence: exposes unrelated prior review records.
- Guess image authority from file location: loses explicit source and digest binding.

**Promoted:** 2026-10-12. PR: [#77](https://github.com/TrentBrown/gatereeve/pull/77).

---

## Freeze rubric scope and validate exact archived source

**Confidence:** HIGH

**Blast Radius:** Adopted compact Judge preparation and snapshot integrity; legacy attempts unchanged.

Compact boundary attempts may declare a nonempty unique rubric subset from their slice declaration. It is frozen in the journal/fingerprint and checked against approved spec IDs. Whole-feature scope must contain the entire rubric. The Judge must return exactly those IDs, while still checking all changed work for scope, gaps and contradictions. This replaces hidden plan/previous-report scope cues with an explicit binding scope; it is not an implementation verdict.

Compact snapshots bypass Git export-ignore/export-subst through an empty temporary shared clone and verify each allowed file, mode and symlink against the pinned Git blob before exposing it. Remove the temporary Git database before execution. History exclusion never justifies an archive silently changing production source.

**Triggered by:** Excluding raw plans removes the old implicit scope source; archive attributes can omit or rewrite review inputs even when the commit is pinned.

**Alternatives considered:**
- Provide the raw plan again: leaks decision/review history.
- Trust git archive without content validation: can alter the exact reviewed source.

**Promoted:** 2026-10-12. PR: [#77](https://github.com/TrentBrown/gatereeve/pull/77).

---

## Bind completion recovery to typed whole-feature evidence and a dedicated event

**Confidence:** HIGH

**Blast Radius:** Portable recovery API, model/core compatibility, journal replay and finalization source anchors.

Use structured, digest-bound reports for whole-feature verification, full-rubric assessment, explicit Judge waiver and retention. Bind them to the configured original base, selected integrated commit and approved spec/design hashes. Validate actual files and confirmation quotes, including explicit historical scope; preserve source evidence rather than rewriting a legacy decision. Additional assessment waivers retain their own observed confirmation and pinned policy permission. Existing slice reports cannot pass merely by changing a label.

Append FEATURE_FINALIZATION_RECOVERED with stable request/receipt identities and accepted merge-event provenance. Preserve ordinary feature-final merge behavior and configured finalization modules. Opt-in requires model1.6/core1.2 adoption; older non-capable guard catalogues remain valid. Block generic transitions so caller-supplied facts cannot manufacture the new passage. Current feature alone adopts the approved P3 semantics; MyLifeMap's actual journal is untouched. New-model feature-final merge flags require an actual feature-final review and retain a scope proof. Recovery uses the last actual review scope, allowing a planned final slice that was reviewed at slice scope; unsupported recovery targets cannot jump to Complete.

**Triggered by:** P3's reviewed recovery requirement and the malformed generic slice-merge replay.

**Alternatives considered:**
- Rewrite the last old merge as feature-final: changes historical meaning and authority.
- Accept a slice report or general proceed text: does not establish whole-feature obligations.
- Skip finalization modules after recovery: weakens normal closeout guards.

**Promoted:** 2026-10-12. PR: [#78](https://github.com/TrentBrown/gatereeve/pull/78).
