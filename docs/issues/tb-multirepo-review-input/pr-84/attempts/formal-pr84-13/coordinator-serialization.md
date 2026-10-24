# Temporary coordinator serialization repair

The installed rc.16 advisory writer rejected attempt13 readiness with CONTRACT_INVALID: compact record budget exceeded. Even after concise remediation prose, its pretty JSON required133081bytes. The same complete47-finding object encodes to106288bytes as compact JSON, within the unchanged131072byte limit.

A temporary copy of the installed plugin changes only JSON.stringify(value,null,2) to JSON.stringify(value). The original installed plugin remains unchanged. The original installed reader accepts the compact record with every field and finding preserved. Eight checks cover original rejection, roundtrip and all47findings, immutable overwrite rejection, actual oversize rejection, path/symlink containment, digest mismatch rejection and installed-source identity. Source/provenance hashes and the exact one-line patch are retained beside this note.

Only advisory declaration uses the temporary writer. The installed protocol still validates readiness/proceed, source binding, all formal gates and eventual passage. No evaluator verdict, old record, size limit, model definition or gate requirement is changed. This operational workaround is not part of the proposed product and is not an installed release.

```diff
--- installed/resources/protocol/advisory-storage.js
+++ temporary/resources/protocol/advisory-storage.js
@@
-  const bytes = JSON.stringify(value, null, 2) + '\n';
+  const bytes = JSON.stringify(value) + '\n';
```
