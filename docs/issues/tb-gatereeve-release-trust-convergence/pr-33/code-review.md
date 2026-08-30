# PR 33 Code Review - Attempt 1

**Verdict:** FAIL

**Pinned diff:** `a01361aaf3c5779129e49972a33539c5984d0da0..dcabb44f49c251ae3126c072200a4b9163ed8a8a`

## Findings

### P1 - Validate Plugin release identity before binding its tree

`cli/src/plugin/trusted-release-lifecycle-v2.js:109` inventories and hashes the
Plugin directory without reading the existing `RELEASE.json` identity. In the
normal preparation workflow, both candidates share one tag input. In recovery,
however, `.github/workflows/coordinated-release-trust-recover.yml:268-290`
downloads the Plugin artifact from a separately supplied preparation run and
passes it directly to this builder. The run lookup binds only the source commit
and approved workflow path. Two RCs can legitimately share that source commit,
so a recovery can label an RC.8 Plugin tree as RC.9 and still produce a valid
schema-v2 lifecycle.

This violates exact coordinated candidate identity and AC2. Read and strictly
validate `RELEASE.json` against the requested source tag, version, source SHA,
Plugin name, and marketplace before inventorying/binding the tree. Add a
negative test for same-source, different-tag Plugin input.

### P1 - Rosetta detection must fail closed on an indeterminate probe

`apps/desktop/scripts/verify-macos-package.mjs:33-39` catches every failure
from `sysctl.proc_translated` and returns `false`. The native evidence writer
then records `native: true` and `rosettaTranslated: false`. A failed or
unexpected probe on a translated process can therefore become authoritative
Intel evidence. `apps/desktop/test/macos-package.test.js:197-200` currently
codifies that fail-open behavior.

This violates AC5 and the explicit Rosetta-substitution prohibition. Preserve
native Intel compatibility by checking a reliable fallback such as
`hw.optional.arm64`: an unavailable translation key is acceptable only when
the host establishes that ARM64 capability is absent. Unknown output or an
indeterminate fallback must reject verification. Add positive native-Intel
and negative indeterminate-probe coverage.

## Residual Risk

After remediation, the workflows still require the planned protected
GitHub-hosted Apple rehearsal to validate real runner and Apple-service
behavior. That deferred live check is not the cause of this verdict.
