# Completion recovery evidence

Recovery requires a configured original feature base, canonical approved
spec/design in the selected repository, accepted recorded slice merges, and a
selected commit on configured integration history. Git verifies each recorded
reviewed base/head both at its recorded merge and at the selected source.
Non-evidence movement between evaluated and accepted heads rejects recovery.
All active or unresolved slices, pause, blocking changes and stale implementation
authorization block passage. Multi-repository/opaque historical provenance is
rejected for reconciliation rather than silently omitting a delivery.

Every bound report is schemaVersion 1, featureId for this record, scope FEATURE,
and contains the same source object:

```json
{
  "featureBaseSha": "<configured original base>",
  "integrationSha": "<selected integrated commit>",
  "requirementsIdentity": "sha256:<fingerprint of approved requirements>"
}
```

The requirement fingerprint uses the core `fingerprint` function over
`{spec:{path,hash},design:{path,hash},rubricIds:[...]}`. Paths are canonical
repository-relative document paths; hashes are SHA-256 of actual Git blob
bytes. Rubric IDs are in approved spec row order. The read-only preflight derives
this identity and rejects mismatching reports. Documents need reconciliation
when absent, unapproved or ambiguous; raw journals do not create requirements.

Report kinds and content:

- `whole-feature-judge-waiver`: obligation `whole-feature-judge`, nonempty reason,
  `confirmedBy:{kind:"human-confirmed",label:"<observed authority>"}`, and
  `confirmation:{kind:"observed-confirmation"|"historical-confirmation",quote,evidence:{path,hash}}`.
  The quote must actually waive the applicable Judge and occur in its bound
  text evidence. Historical confirmation adds `context`, a verbatim bound
  surrounding passage explicitly identifying whole-feature/feature-final scope.
  For either confirmation kind, the quote or verbatim approval `context` must
  identify whole-feature/feature-final scope, `feature <featureId>`, the exact
  `integrationSha` and `requirementsIdentity`. Both quote and any context must
  occur in the bound confirmation evidence. A short answer may use the exact
  source/requirements shown in its approval prompt; agent-authored source fields
  alone do not establish human applicability. Historical text without those
  bindings requires explicit applicability reconciliation; do not edit its
  original evidence to manufacture an approval.
- `feature-verification`: outcome PASS; exactly one check for each category
  `build`, `lint`, `unit`, `integration`, `endToEnd`, `runtime`. Each check has
  category and outcome PASS or NOT_APPLICABLE. PASS retains command and nonempty
  `evidence:[{path,hash}]`; NOT_APPLICABLE retains a concrete reason.
- `feature-spec-evaluation`: outcome PASS; criteria cover every approved rubric
  ID exactly once, with result PASS, explanation and nonempty bound evidence.
- `feature-retention`: outcome TRACKED requires a clean fully tracked feature
  record before mutation, with no retained symlinks. Outcome HUMAN_RETAINED
  requires confirmedBy, decision `retain-workspace`, reason, bound evidence and
  `confirmation:{quote,evidence}` observing the explicit workspace-retention
  choice. It records preservation, not an unperformed archive.

A verification/spec report may use outcome WAIVED only under that module's
pinned waiver policy. It retains `waiver:{obligation,reason,confirmedBy,evidence,
confirmation:{quote,evidence}}`; obligation is its report kind, not Judge.
Constrained non-behavioral policies also require the same human classification
and bound evidence as ordinary gate waivers. No implicit policy waiver exists.
Assessment waivers and HUMAN_RETAINED decisions require the same observed
feature/source/requirements/scope bindings in their quote or approval context.

All report/supporting references resolve inside the feature home, cannot traverse
symlinks, are nonempty and must match actual hashes. Structured reports and quoted
confirmation material are bounded to 1 MiB each; supporting logs are hashed as
streams. Full transcripts are unnecessary. The validated receipt embeds compact
reports and requirement/merge identities while keeping supporting material as
references. Actor labels are cooperative records of observed confirmation; the
protocol does not authenticate people.

The dedicated recovery event records a stable request identity, selected source,
validated receipt/hash and immutable merge-event provenance. Replay checks those
bindings and prior accepted delivery state. A repeat of the same ID/request adds
nothing, including after finalization; changed reports or a conflicting identity
are rejected. Older locks remain unchanged until explicit compatible adoption.
Ordinary feature-final merge behavior and configured finalization modules remain
intact.
