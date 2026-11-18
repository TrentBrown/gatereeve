# Decisions - tb-pr-explainer

**Feature start:** 2026-11-18

- **D-implementation-1: portable instructions, no renderer dependency.** The approved design is implemented as one entrypoint plus artifact, visual-evidence, and optional governed-invocation references. No new runtime dependency or required template/framework.
- **D-implementation-2: replacement and historical report recognition.** Remove the old skill entrypoint and current inventory/doctor/documentation callers. Retain old report-name recognition solely to preserve historical records; add the new filename narrowly, with a behavioral regression proving unrelated HTML/JS/JSON remain source. No workflow gate or authority changes.
- **D-implementation-3: version-qualified trial evidence.** Real pinned PR42 and PR101 exercise UI and non-UI explanation. A separately labeled fixture exercises ignored/non-default report discovery and rejection of unrelated stale imagery. Actual trial HTML remains task-owned; retained HTML text copies let the unchanged installed adapter review the new filename before release. No active installation or test-capture changes.

These reconcile implementation choices within the human-approved design; no new product-scope decision or requirement amendment. The autonomy dial refusal is retained in scratchpad.md and tracker.md, with no branch-protection change.

- **D-implementation-4: explicit validation replacement.** Preserve all broad-run failures. The clean full Node run had 434 passes, two skips and one stale staged-copy failure; regenerate that copy and rerun its exact regression, current focused tests, all remaining broad stages and four artifact checks. The optional site suite also exposed an unchanged fixed-rc.1 expectation against an unchanged rc.29 manifest; keep its failing receipt and unchanged-blob proof, exclude only that unrelated release tuple from selected current checks, and request independent coverage qualification. No release metadata or unrelated test repair is included.

- **D-implementation-5: fresh final full backstop.** Changing the local closed-PR preference changed the protocol repository identity, so older-identity proof was not qualified as current. A fresh full run on the repaired final candidate passed (435 Node passes, two skips, 100 Python passes, all packaging/audit/setup stages). Independent review can consume this result plus current scoped artifact/site evidence, and qualify only the remaining unrelated legacy release-tuple scope exclusion. Historical failures remain retained.
