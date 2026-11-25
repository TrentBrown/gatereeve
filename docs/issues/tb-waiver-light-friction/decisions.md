# Decisions - tb-waiver-light-friction

**Feature start:** 2026-11-25

Permanent record of decisions promoted from `scratchpad.md`.

## D1 - "standard" rigor ran as full

GateReeve rigor is `full | light`; the requested "standard" rigor ran as full,
supervised, then mandated by the human for this run (scratchpad S1).

## D2 - A verification waiver covers its follow-on checks, recorded honestly

Coverage, CI-qualification and hosted-CI head checks are verification
obligations; a current human waiver of verification covers them. Residuals stay
on the outcome as `waivedCoverage`, the decision records `observed`, and a PASS
with residuals never counts as passing for standing, delegated or autonomous
authority (`passingGate`). Rejected: a separate waivable coverage gate (design;
scratchpad S2, S3).

## D3 - The findings log grows without re-authorization

A light run keeps its authorized subject while the brief matches outside its
findings log. The comparison follows Markdown whitespace: prose collapses, leading
indentation counts, code (fenced, indented, inline spans) is verbatim; one
comparison serves authority carry-forward and delegated hand-back. Rejected:
hashing only the scope into the subject (breaks in-flight light runs); exact bytes
(breaks the pinned prose-whitespace hand-back rule) (scratchpad S2-S4).

## D4 - run.start records the feature base as a merge base, without fetching

`featureBaseSha` is the merge base of `HEAD` with the already-fetched default
branch; when none resolves it is omitted with a recorded reason. Hand-written
configurations are not changed (design).
