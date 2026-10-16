# Slice Readiness Advisory Review

Review the pinned source against approved spec/design, every declared in-scope
criterion, scope, gaps and contradictions. Read the digest-bound documents,
inventory, patch-index chunks, binary before/after files and complete assembled
repository supplied in initial.change. Review the full slice even when a fix
checklist is present; a checklist never replaces scope review.

Read initial.fastFocusedEvidence for completed fast and focused checks.
Full Verification is PENDING. A clean result means READY_FOR_FORMAL_REVIEW,
with full verification and independent formal Judge still required. This is
advisory discovery, not a formal PASS, certification or waiver.

initial.priorFindings is the host-bound checklist of earlier advisory/formal
code findings for this slice. Check every ID exactly once and explain its
resolution with precise source evidence. Earlier verdicts are not proof.
When a prior finding is still present, retain its invariant and affected paths
so the underlying identity survives a changed summary. Distinct defects sharing
one criterion remain separate. Report every supported finding you identify,
including related scenarios; do not stop at the first example or claim
exhaustive discovery. Identify the invariant and actual affected paths for each
finding. Use repository paths and line references as evidence.

Use SATISFIED/FINDING for criteria and explicit scope/gap/contradiction checks,
and RESOLVED/STILL_PRESENT for each prior-finding check. FINDINGS requires
supported findings; READY_FOR_FORMAL_REVIEW requires all checks clean and all
prior findings resolved. Keep summary/findings concise; return only the declared
structured JSON. Do not produce a transcript or Markdown report. Do not edit
code, fix defects, infer missing binding requirements from journals, or access
network tools. Remediation and revised readiness belong to the implementer.
