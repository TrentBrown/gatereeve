# Optional governed invocation

The skill works on ordinary changes without a workflow installation. Use this contract when a caller supplies a governed candidate or an authoritative evidence packet. These are conceptual input/result responsibilities, not a new required runtime schema or gate.

## Caller inputs

- **Change identity:** selected repository or repositories, full base/head revisions or the supplied local-snapshot identity, and PR/branch/range context. Distinguish the PR target tip from the actual comparison base when those differ.
- **Intent:** the available design, plan, spec, issue, and decision records. For a sliced feature, identify which portion this candidate covers.
- **Evidence:** retained checks/results and available capture/report references, including their identities and limitations where supplied. Evidence is input to explanation, not a grant to execute new product checks.
- **Destination:** the exact output path and any caller-provided artifact identity or delivery constraints.

Use these exact inputs. If a supplied revision, retained artifact, or destination cannot be resolved, report the problem rather than substituting another live branch or feature home. Do not reinterpret an unavailable governed candidate as ordinary working-tree work. A changed live PR does not silently update the pinned explanation.

Missing supporting intent/evidence is different from an unresolved source comparison: explain the identified source honestly with the missing inputs visible. Conflicting intent and implementation become source-referenced reviewer concerns, not invented requirements or an approval verdict.

## Artifact and handoff

Generate the HTML at the explicit destination. Without one, use `pr-explainer.html` in the caller's existing feature artifact area or a durable task-owned output directory. Use separate change/revision directories when necessary. Preserve unrelated or differently scoped artifacts; do not overwrite them unless requested.

Identify inside the HTML and in the handoff:

- Artifact path and explained repository/PR or comparison.
- Full base/head or actual working-tree snapshot identity; which side each source excerpt/capture describes.
- Supporting records/evidence used, with unknown provenance or unavailable inputs identified.
- Material limitations, including any artifact-rendering or interaction checks that could not be performed.

The page may link external source/evidence but must be self-contained for reading its explanation. A later GateReeve integration can retain the file and check candidate freshness; this delivery does not require invocation, create passage conditions, publish to the PR, or grant acceptance/merge authority.

`pr-explainer` replaces the old skill. There is no explain-diff alias. Retained historical files are historical records and are not rewritten by the rename.
