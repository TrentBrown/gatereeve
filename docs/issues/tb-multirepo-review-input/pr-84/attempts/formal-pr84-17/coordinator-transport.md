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

A second occurrence of the same cap exists in opaqueAdvisoryInputIdentity. The temporary classifier parses only regular100644 formal judge-view-audit.json up to12MiB, requiring schemaVersion1, kindreview-view-audit and the emitted source/view/excludedPaths/metrics shape. Other JSON remains128KiB. A process-local load hook supplies only the three documented advisory transport modules at their original installed URLs (inputs, storage, history); every sibling import still resolves to the installed directory. Proceed and formal readiness freshness also consume this history, so they need the same audit-reader correction. Installed core methods, native Judge and original files remain unchanged. Original audit bytes/hashes remain unchanged. Six parent controls and nine independent fixture controls check classification boundaries. This grants no authority or gate verdict.

```diff
--- installed/advisory-inputs.js
+++ temporary/advisory-inputs.js
@@ -212,11 +212,16 @@
     const size = Number(
       (await git(root, ['cat-file', '-s', sha + ':' + path])).trim()
     );
-    if (path.endsWith('.json') && size <= 128 * 1024) {
+    const formalAudit = path.endsWith('/judge-view-audit.json') && entry.startsWith('100644 blob ') && size <= 12 * 1024 * 1024;
+    if (path.endsWith('.json') && (size <= 128 * 1024 || formalAudit)) {
       try {
-        recognized = isAdvisoryWorkflowRecord(
-          JSON.parse(await git(root, ['show', sha + ':' + path]))
-        );
+        const value = JSON.parse(await git(root, ['show', sha + ':' + path]));
+        recognized = (size <= 128 * 1024 || value?.kind === 'review-view-audit' && value.schemaVersion === 1
+          && /^[a-f0-9]{40}$/u.test(value.source?.headSha ?? '') && /^[a-f0-9]{40}$/u.test(value.source?.baseSha ?? '')
+          && value.view?.policy?.kind === 'compact-review-v1' && typeof value.view.inputIdentity === 'string'
+          && Array.isArray(value.excludedPaths) && value.excludedPaths.every(path => typeof path === 'string')
+          && Number.isSafeInteger(value.metrics?.changedFiles) && Number.isSafeInteger(value.metrics?.materialBytes))
+          && isAdvisoryWorkflowRecord(value);
       } catch {
         /* Opaque data is not implicitly authoritative workflow evidence. */
       }
```

```javascript
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const original='file:///Users/trent.brown/.codex/plugins/cache/quality-code/agentic-development-workflow/0.1.0-rc.16/resources/protocol/';
const copied='/var/folders/3v/v5sch0sx5qq8r6p6pqyp2zlc0000gn/T/gr-advisory-compact-be5vndx1/agentic-development-workflow/resources/protocol/';
const transport=new Set(['advisory-inputs.js','advisory-storage.js','advisory-history.js']);
// Preserve original module URLs and sibling imports; substitute only tested
// record serialization/classification transport, never core or gate methods.
registerHooks({load(url,context,nextLoad){const result=nextLoad(url,context);const name=url.startsWith(original)?url.slice(original.length):null;return transport.has(name)?{...result,source:readFileSync(copied+name,'utf8')}:result;}});
```
