import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const preparationPath = resolve(
  import.meta.dirname,
  '../../.github/workflows/coordinated-release-prepare.yml',
);
const recoveryPath = resolve(
  import.meta.dirname,
  '../../.github/workflows/coordinated-release-trust-recover.yml',
);

test('protected preparation is reviewed-main-only, serialized, and publication-free', async () => {
  const workflow = await readFile(preparationPath, 'utf8');
  assert.match(workflow, /^permissions:\n\s+actions: read\n\s+contents: read$/m);
  assert.match(workflow, /group: gatereeve-release-trust-\$\{\{ inputs\.tag \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}\n\s+fetch-depth: 0/);
  assert.match(workflow, /test "\$DISPATCH_REF" = "refs\/heads\/main"/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$DISPATCH_SHA"/);
  assert.match(workflow, /git rev-parse refs\/remotes\/origin\/main/);
  assert.doesNotMatch(workflow, /source_ref|apple_trust/);
  assert.match(workflow, /ref: \$\{\{ needs\.resolve-source\.outputs\.commit \}\}/);
  assert.match(workflow, /environment:\n\s+name: release-trust\n\s+deployment: false/);
  const trustJobHeader = workflow.match(/  desktop-trust:[\s\S]*?    steps:/u)?.[0] ?? '';
  assert.doesNotMatch(trustJobHeader, /secrets\./);
  assert.doesNotMatch(workflow, /release-publication/);
  assert.match(workflow, /RUN_ATTEMPT !== '1'/);
  assert.match(workflow, /submitted_root="\$trusted_bundle\/submitted"/);
  assert.match(workflow, /GateReeve\.app\.tar/);
  assert.match(workflow, /--trusted-dmg "\$\{\{ steps\.trust-paths\.outputs\.trusted_dmg \}\}"/);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}[\s\S]*coordinated-desktop-trusted/);
  assert((workflow.match(/retention-days: 30/g) ?? []).length >= 5);
  assert.match(workflow, /runner: macos-15\n/);
  assert.match(workflow, /runner: macos-15-intel/);
  assert.match(workflow, /aggregate-native-trust\.js/);
  assert.match(workflow, /build-trusted-release-lifecycle\.js/);
  assert.doesNotMatch(workflow, /plugin release coordinate/);
  assert.doesNotMatch(workflow, /contents: write|gh release create|git push|publish-marketplace\.sh/);
});

test('bounded recovery reuses retained bytes and Apple request history without signing authority', async () => {
  const workflow = await readFile(recoveryPath, 'utf8');
  assert.match(workflow, /preparation_run_id:/);
  assert.match(workflow, /trust_artifact_run_id:/);
  assert.match(workflow, /source_commit:/);
  assert.match(workflow, /^permissions:\n\s+actions: read\n\s+contents: read$/m);
  assert.match(workflow, /group: gatereeve-release-trust-\$\{\{ inputs\.tag \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /run\.head_sha !== process\.env\.SOURCE_COMMIT/);
  assert.match(workflow, /environment:\n\s+name: release-trust\n\s+deployment: false/);
  const recoveryJobHeader = workflow.match(/  recover-trust:[\s\S]*?    steps:/u)?.[0] ?? '';
  assert.doesNotMatch(recoveryJobHeader, /secrets\./);
  assert.match(workflow, /name: coordinated-desktop-trusted[\s\S]*run-id: \$\{\{ inputs\.trust_artifact_run_id \}\}/);
  assert.match(workflow, /notarytool history/);
  assert.match(workflow, /reconcile-notarization-history\.mjs/);
  assert.match(workflow, /notarize-macos\.mjs/);
  assert.match(workflow, /submitted\/GateReeve-/);
  assert.match(workflow, /tar -xf "\$TRUST_ROOT\/submitted\/GateReeve\.app\.tar"/);
  assert.match(workflow, /runner: macos-15-intel/);
  assert.match(workflow, /build-trusted-release-lifecycle\.js/);
  assert.match(workflow, /Use a new bounded recovery dispatch/);
  assert.doesNotMatch(workflow, /GATEREEVE_DEVELOPER_ID_P12|security import|package-macos\.mjs/);
  assert.doesNotMatch(workflow, /release-publication|contents: write|gh release create|git push/);
  assert((workflow.match(/retention-days: 30/g) ?? []).length >= 4);
});
