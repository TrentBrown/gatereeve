# Design - tb-configurable-gate-ordering

**Status:** approved (gate passed 2026-10-14)
**Authority:** Trent: "Okay, I approve of this. Make it so." following the dependency/DAG explanation in this conversation.

## Problem

Module manifests already define hard prerequisites and conditional ordering, but repository policy only selects module versions and enablement. Owners cannot add ordering without changing a manifest. The Desktop groups gates by dependency depth and draws generic connections between groups, which can imply nonexistent prerequisites.

## Intent

Let owners enable/disable standard review modules and add completion-order relationships while retaining structural protection, enabled-module contracts, freshness, isolated Judge review and human merge authority. Make the real dependency graph understandable in configuration and the UI.

## Chosen shape

- Extend tracked `.gatereeve/workflow.json` with optional `ordering`, keyed by module ID, whose values contain `after` arrays of module IDs. Use a versioned policy/graph extension; existing schema-1 policies and historical model locks remain readable and unchanged.
- Owner links have the existing conditional `after` semantics: they constrain completion and freshness only when both endpoints are enabled. Disabling a module keeps its configured links dormant rather than weakening another module's hard requirement.
- Keep original definitions, versions and digests intact. Retain ordering separately in the resolved graph/model lock and compile it into eligibility/freshness. Do not add prior review reports to independent Judge inputs.
- Reject unknown/unselected endpoints, self-links, duplicates, cross-slot links and combined cycles. Owners cannot remove existing manifest edges or disable locked modules.
- Extend the existing Modules settings with Run after controls, an exact graph preview, ordering-change disclosure and existing explicit active-feature migration confirmation. Policy editing remains staged until Apply.
- Derive visual depth/groups from the combined graph. Draw actual individual edges and distinguish hard requirements, manifest conditional ordering and owner ordering. Apply the same rendering to review boundaries and finalization. No separate owner-authored stage object or global stage barrier.
- Preserve protocol lifecycle, advisory discovery, retry presentation guards and finalization obligations. This feature's release/publication/activation remain separate post-merge work.

## Alternatives considered

- Ordered groups with global completion barriers: rejected in favor of the existing graph and derived stages.
- Reorder policy array: rejected because array position is not an execution contract.
- Edit manifest `after` fields: rejected because owners should not change plugin definition identity/digests for repository ordering.
- Scheduling priority: completion-order edges provide the dependable meaning described and approved; eligible unrelated gates may still run concurrently.

## Constraints

Graph changes require explicit adoption for an active feature; historical attempts retain their pinned graph. A disabled hard prerequisite still invalidates policy. Locked Packet Validation's Explain Diff requirement remains enforced. Advisory records and prior review history remain excluded from formal Judge views.

## Open risks

Arbitrary graphs require accurate individual-edge rendering and accessible textual alternatives. New graph fields must survive every serialization/projection/IPC path. Dormant owner edges must be validated on re-enablement. Ordering-only migrations must disclose and invalidate affected active evidence without changing historical attempts.

## Changes

None.
