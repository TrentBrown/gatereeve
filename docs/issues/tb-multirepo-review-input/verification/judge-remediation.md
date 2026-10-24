# OpenAI Judge remediation

Independent records are retained unchanged in openai-judge-initial.md/.json and
openai-judge-delta.md/.json. This file records implementer claims for reassessment,
not a verdict or formal protocol passage.

The initial review exposed broader repository history leaking into narrow review,
affected closed findings being omitted, permanent recovery failure after evidence
loss, raw provider failure diagnostics and incomplete host capability evidence.
Corrections add scope checks at both selection and export, independent closure
relevance/disposition decisions, visible history gaps with fresh-proof recovery,
sanitized provider categories, and narrow native PreToolUse merge enforcement.

The second independent delta resolved the first two defects and capability gap,
and identified four remaining defects. Current corrections:

- D1: A missing result root imposes a barrier on all older proof; a known gate's
  broken closure blocks older proof for that gate. Fresh execution after that
  retained result can restore proof, without reconstructing or hiding missing
  bytes. Applicability memoizes gap discovery within each evaluation. Regression
  covers lost FAIL root and output, old PASS rejection, and fresh-proof recovery.
- D2: Both native adapters sanitize malformed outer/nested/fenced structured JSON
  errors into a fixed category; provider text is absent from summaries/artifacts.
  Tests cover both native parsers and the execution summary path.
- D3: A configured but missing feature home denies recognized direct merging.
  Both host payload forms are tested; ordinary phase work remains available.
- D4: Automatic history has no record-count cutoff. A fresh review with 33 closed
  findings and 66 retained original/closure records proceeds. Original reports,
  stable identities and relevance justification remain intact; the native
  provider's actual prompt-byte capacity remains an explicit transport limit.

Current focused regressions: six PASS, including both D1 loss variants. Full CLI,
desktop and native package checks are retained separately. A fresh independent
delta must confirm these corrections before this implementation is called ready.

The final recheck exposed a contained retention scan error: a memo declared in
executeGates was referenced from coreEvidence. coreEvidence now owns its memo,
and retention explicitly retains the applicable acceptance inventory and
finalization/release references. The actual integration/completion regression
asserts both completion records appear and passes (retention-recheck.log).
Native lint/build were rerun after this correction.
