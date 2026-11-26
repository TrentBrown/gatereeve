# Design - tb-review-verdict-normalization

**Status:** approved (gate passed 2026-11-26; revised 2026-11-26, see Changes)

GitHub issue #141 (PR 2 of the reviewer-pipeline sequence in tracking issue
#150), built on PR #152 (#140). Settled entries are in `interview.md` (D1–D10),
with the re-tally.

## Problem

Many UNAVAILABLE review results come from verdicts that are usable in substance
but are thrown out whole over a mechanical mismatch: prose around the JSON, an
extra property, a PASS that also reports a blocking finding, a `present`
disposition for an advisory finding the implementer claimed, a stale claim or
disposition ID. Both providers already run with CLI schema enforcement, and
these shapes still arrive. Some meaning-changing gaps do go to the repair turn,
but the repair turn cannot fill a missing disposition: the repair is rejected
as a substantive change.

## Intent

Under the agreed policy, GateReeve corrects a verdict only where the answer
follows from the verdict itself, and records each correction with its rule.
Everything that changes meaning goes back to the reviewer through the existing
single repair turn, with the exact field path, and the repair turn can actually
supply what was asked for. Rejections and corrections are counted per rule in
the metrics store.

## Chosen shape

1. **Prose unwrap (D1).** `parseObject` in `local-agent-adapters.js` unwraps
   only when its caller passes a list to record the correction in; without
   one it parses exactly as today. With a list, when the text does not parse,
   it collects balanced top-level `{...}` spans that parse as objects. Exactly
   one is used and a `prose-unwrapped` row is added to the list; otherwise the
   existing malformed-JSON error. The adapters pass a list only when `runStage`
   receives an `onNormalized` hook, and report the rows through it, so the
   strict stage-result shape is unchanged. `independent()` in `execution.js`
   is the only caller that passes the hook; it adds the rows to every verdict
   of that execution. Planning reviews and analysis pass no hook, so their
   output is never unwrapped.
2. **Unknown properties (D6).** Before schema validation, a schema-guided strip
   (`stripUnknown(schema, value, path)`) removes properties the verdict schema
   does not define and records `unknown-property` rows with the field path.
   The envelope check (`Object.keys(output).length === 1`) strips extra
   envelope keys the same way. Required, type and enum errors still go to
   repair with the path from `validateJsonSchema`.
3. **PASS with a blocking finding (D2).** In `checkVerdict`, a PASS reporting a
   blocking non-low finding, or `present` for an earlier blocking finding, is
   rewritten to FAIL first, recorded as `pass-with-blocking-finding` with the
   finding IDs and the original outcome. The remaining checks run on the FAIL.
4. **Format repair (D3, D7).** `validateFormatRepair` accepts dispositions for
   IDs the original omitted; stated dispositions keep their status. It accepts
   a FAIL where the original said PASS when the original reported a blocking
   finding, or when a disposition the repair supplied marks an earlier
   blocking finding `present`: either way the verdict is a FAIL by its own
   content (D2).
5. **`present` non-blocking (D4).** A required ID (claimed) whose earlier
   finding does not block may be `present` on a PASS; recorded as
   `present-non-blocking`.
6. **Stale IDs (D5).** Undisclosed dispositions on the review gate are dropped
   (`disposition-not-disclosed`). Claims naming no retained finding are
   dropped before packet assembly (`claim-not-retained`), excluded from the
   packet and ledger, and recorded on each result of that execution. The
   unaffected-open and missing-disposition errors stay repair-turn errors and
   name `dispositions[i]`; the criterion-outcome contradiction names
   `criteria[i]`.
7. **Counts (D8).** Contract UNAVAILABLE results record `rejectionRule`, a
   stable identifier derived from the rejection's leading sentence. The
   metrics projection (`workflow-projection.js`) writes one observation per
   rule per result with `check` `verdict-normalization` or
   `verdict-rejection`, a new allowed `rule` field and `count`.
8. **Docs (D9).** `PROTOCOL.md` describes the rules, the repair allowance and
   the corrected disposition sentence; `commands/pr-review.md` tells the
   implementer to claim only findings it changed. The desktop mirror is
   restaged.
9. **Fixtures.** One test per class, named after its tally row, built from the
    retained shapes (anonymized; malformed JSON synthetic because raw output
    was not retained): each normalized class is accepted with its record;
    each meaning-changing class reaches the repair turn with its field path,
    and a repair that supplies the value is accepted.

## Alternatives considered

- **Fill a missing `blocking` from severity or evidence text:** guesses
  meaning. Rejected by the policy.
- **Treat an open finding marked `unaffected` as `present` (then FAIL):** the
  reviewer may have meant resolved. Kept as a repair-turn error.
- **Pick the first or largest JSON object when several appear:** could choose
  a draft over the final verdict. Rejected; several candidates stay malformed.
- **Keep refusing stale claims:** the claim names nothing GateReeve can check,
  and the refusal costs the reviewer. Dropped with a note instead.
- **Counts as a new metrics table:** more schema for the same data. Existing
  observation rows with a `rule` field suffice; surfaces are #149.

## Constraints

- Contract stays `gatereeve/current/8`. Retained results replay unchanged:
  the rules run only on new verdicts. The review rules fingerprint changes as
  expected for new executions (as with PR #152).
- Keep scope to #141; #142 (self-validation, complete packets) follows on the
  same files.
- Edit `plugin-src/`; restage the tracked desktop mirror; never edit `dist/`.
- Public text names no local paths or other projects.

## Open risks

- The re-tally misses stores deleted since PR #152; the measured priorities
  come from that PR's table.
- A balanced-brace scan can mis-split text containing unmatched braces inside
  prose; the result is then "none" or "several" and stays malformed JSON, the
  current behavior.
- Deriving `rejectionRule` from message text couples counts to wording; a
  test pins the mapping for every rejection this PR names.

## Changes

- 2026-11-26: Item 8 (the PR #152 outcome-row reference leftover) removed
  from this PR. The spec planning review found it outside the mandate's
  "keep the change focused on #141's scope" constraint; it is independent of
  #141 and can land in its own change (interview D10, scratchpad S2).
- 2026-11-26: Item 1 reports the unwrap through a `runStage` hook instead of a
  stage-result field, because planning reviews and analysis validate the
  stage-result keys strictly; callers without the hook are never unwrapped.
  Item 4 also accepts PASS to FAIL when the repair's own supplied disposition
  marks an earlier blocking finding present (design review round 1).
