# Decisions - workflow-state-machine-cli

**Feature start:** 2026-08-25

Permanent record of implementation decisions promoted from `scratchpad.md`.

---

## Keep the protocol core canonical in plugin shared resources

**Confidence:** HIGH

**Blast Radius:** Native plugin composition, optional CLI packaging, protocol
imports, inventory validation, release artifacts, and adapter parity tests.

The authoritative JavaScript protocol source will live once under
`plugin-src/shared/resources/protocol/`, because governance must be available in
the self-contained plugin without a global CLI. Repository-local CLI adapters
may import that source directly. Optional CLI distribution will stage the same
canonical files and verify their inventory/hash rather than maintain a second
tracked implementation. Commander and platform-specific code remain outside
the protocol core.

**Triggered by:** P1 requires one shared implementation while the current CLI
package and native plugin composer have different package roots.

**Alternatives considered:**

- Put the core under `cli/src` and copy it into native plugins - rejected
  because it makes optional tooling the apparent owner of mandatory plugin
  governance and weakens the self-contained plugin-source contract.
- Create and publish a second `@gatereeve/core` npm package - rejected for v1
  because it adds release/version coupling and an installation dependency the
  plugin does not need.
- Track copies in both trees - rejected because parity tests detect drift only
  after two authorities have already been created.

**Promoted:** 2026-08-25.

---

## Fail closed and roll forward interrupted model migrations

**Confidence:** HIGH

**Blast Radius:** Model-lock writes, event-journal replay, status discovery,
migration recovery, and worktree cleanliness during an interrupted mutation.

A model migration writes a temporary `workflow-model.migration-pending.json`
transaction marker before replacing the model lock and journal. Normal readers
classify any feature with that marker as inconsistent and refuse passage. The
marker carries the validated next lock and migration event, so recovery can
deterministically roll forward from any supported interruption point and then
remove the marker. Successful migration remains a human-confirmed journal
event with an impact report; old events retain their historical model hashes.

**Triggered by:** A migration must update both `workflow-model.lock.json` and
`events.jsonl`, but a portable filesystem cannot atomically rename two files as
one transaction.

**Alternatives considered:**

- Replace the entire feature directory atomically - rejected because the
  feature directory also contains evolving user documents and evidence that
  must not be copied or swapped by protocol storage.
- Update the lock or journal without a transaction marker - rejected because a
  crash could silently leave two contradictory authorities.
- Roll back automatically - rejected because roll-forward is deterministic
  from the confirmed next model and avoids restoring stale content over a
  journal that may already contain the migration event.

**Promoted:** 2026-08-25.

---

## Verify merged content without requiring reviewed SHA ancestry

**Confidence:** HIGH

**Blast Radius:** Human-review completion, slice merge recording, feature-final
entry, supported GitHub merge modes, and merge-evidence fingerprints.

Merge verification first accepts the strongest proof: the reviewed PR head is
an ancestor of the selected integration ref. When squash or rebase changes
commit identity, GateReeve instead requires the reviewed base to be ancestral
to both reviewed head and integration, enumerates every path changed by the
reviewed range, and compares each path's complete Git tree entry (mode, type,
and object ID) between reviewed head and integration. A mismatch fails closed.
This proves that the exact reviewed file content reached integration without
assuming commit SHA equality; it is intentionally conservative if later work
has already modified the same path.

**Triggered by:** GitHub merge, squash, and rebase modes do not preserve the
same relationship between the reviewed PR-head SHA and the integration SHA.

**Alternatives considered:**

- Require the reviewed head to be an ancestor - rejected because it excludes
  legitimate squash and rebase merges.
- Compare patch IDs - rejected because patch IDs abstract whitespace and do not
  prove exact reviewed blobs, modes, deletions, or submodule entries.
- Trust PR state or merge metadata alone - rejected because passage should be
  grounded in the local synchronized Git content used for closeout.
- Search commit messages for the PR number - rejected because message formats
  are mutable metadata rather than content proof.

**Promoted:** 2026-08-25.

---

## Stage complete canonical resources into the optional CLI package

**Confidence:** HIGH

**Blast Radius:** Optional npm packaging, standalone CLI execution, protocol
adapter imports, Python guard availability, initialization templates, and
plugin/CLI parity.

The optional CLI package stages the complete canonical
`plugin-src/shared/resources/` tree during `prepack`, while source-checkout
execution imports that same tree directly. The staged projection is generated
and ignored, never hand-edited. This keeps the CLI standalone without creating
a second tracked state authority and ensures the JavaScript core retains its
required sibling Python guards and templates.

**Triggered by:** Staging only `resources/protocol/` made the JavaScript files
look self-contained but broke `workflow_context.py`, trusted Python leaf guards,
and `interview.md` initialization in an installed CLI package.

**Alternatives considered:**

- Depend on an installed native plugin and discover its cache path - rejected
  because cache locations are platform-specific and make the optional CLI
  unnecessarily dependent on one agent installation.
- Rewrite or duplicate the Python guards and templates inside the CLI -
  rejected because it would create divergent mechanics and content.
- Publish a separate core/resources package - deferred because it introduces
  another release unit without improving v1 behavior.

**Promoted:** 2026-08-25.
