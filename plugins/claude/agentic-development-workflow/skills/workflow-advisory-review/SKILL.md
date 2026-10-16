---
name: workflow-advisory-review
description: "Declare a specced slice ready after fast and focused checks, automatically run isolated advisory discovery, reconcile prior failures, or retain a reason to proceed to formal review without a clean advisory. Use at explicit slice readiness; ordinary edits do not trigger review."
---

# Slice Readiness Advisory

Resolve `<plugin-root>` from the real path of this file: it is the parent of
`skills/`. Read the canonical command and protocol before proceeding:

- `<plugin-root>/resources/commands/advisory-review.md`
- `<plugin-root>/resources/PROTOCOL.md`

The implementer owns fixes, defect-class review and the readiness declaration.
The protocol helper owns the isolated launch, one transient retry, compact
publication and deterministic reuse check. An advisory never records a formal
gate outcome. Keep the formal Judge blind to this history.
