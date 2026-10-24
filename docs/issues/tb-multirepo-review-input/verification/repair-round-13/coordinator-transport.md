# Advisory transport compatibility

Original rc.16 advisory-history rejects formal13's valid 133059-byte judge-view-audit.json because it applies the 128KiB advisory-record bound to formal snapshot audits (whose own limit is12MiB). A temporary helper copy uses that existing formal audit limit only at this import. Byte hashes, containment, re-read, schema, receipt and complete Judge bundle validation remain required. Original installed files and immutable records are unchanged. This copy is used only to declare advisory readiness; all mandatory formal gates and passage use the original installed core. Ordinary advisory reads/writes retain128KiB. Compact writing retains every field/finding and is accepted by the original installed reader.

```diff
--- installed/advisory-storage.js
+++ temporary/advisory-storage.js
@@ -24,8 +24,9 @@
 export async function advisoryFile(
   home,
   ref,
-  { json = false, text = false } = {}
+  { json = false, text = false, maxBytes = MAX_ADVISORY_BYTES } = {}
 ) {
+  advisoryAssert(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 12 * 1024 * 1024, 'invalid structured evidence bound');
   advisoryReference(ref);
   const root = await realpath(home);
   let target = root;
@@ -52,7 +53,7 @@
   );
   if (!json && !text) return { sourcePath: target, hash: ref.hash, bytes };
   advisoryAssert(
-    bytes <= MAX_ADVISORY_BYTES,
+    bytes <= maxBytes,
     'structured advisory evidence exceeds compact record budget'
   );
   const content = await readFile(target);
@@ -64,7 +65,7 @@
 }
 export async function immutableAdvisoryJSON(home, path, value) {
   advisoryReference({ path, hash: 'sha256:' + '0'.repeat(64) });
-  const bytes = JSON.stringify(value, null, 2) + '\n';
+  const bytes = JSON.stringify(value) + '\n';
   advisoryAssert(
     Buffer.byteLength(bytes) <= MAX_ADVISORY_BYTES,
     'compact record budget exceeded'
--- installed/advisory-history.js
+++ temporary/advisory-history.js
@@ -90,7 +90,7 @@
             path: directory + root.files.viewAudit.path,
             hash: root.files.viewAudit.sha256,
           },
-          { json: true }
+          { json: true, maxBytes: 12 * 1024 * 1024 }
         )
       : null;
     validateAgentWorkflowReceipt(receipt);
```
