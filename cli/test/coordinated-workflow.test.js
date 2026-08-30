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
const finalizationPath = resolve(
  import.meta.dirname,
  '../../.github/workflows/coordinated-release-finalize.yml',
);
const publicationPath = resolve(
  import.meta.dirname,
  '../../.github/workflows/coordinated-release-publish.yml',
);
const caskFinalizationPath = resolve(
  import.meta.dirname,
  '../../.github/workflows/homebrew-cask-finalize.yml',
);
const caskPublicationPath = resolve(
  import.meta.dirname,
  '../../.github/workflows/homebrew-cask-publish.yml',
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
  assert.match(workflow, /environment:\n\s+name: release-trust/);
  assert.doesNotMatch(workflow, /deployment:\s*false/);
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
  assert.match(workflow, /environment:\n\s+name: release-trust/);
  assert.doesNotMatch(workflow, /deployment:\s*false/);
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

test('read-only finalization seals one exact schema-v2 packet from retained authorities', async () => {
  const workflow = await readFile(finalizationPath, 'utf8');
  assert.match(workflow, /preparation_run_id:/);
  assert.match(workflow, /trust_artifact_run_id:/);
  assert.match(workflow, /source_commit:/);
  assert.match(workflow, /^permissions:\n\s+actions: read\n\s+contents: read$/m);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /run\.head_sha !== process\.env\.SOURCE_COMMIT/);
  assert.match(workflow, /trust\.conclusion !== "success"/);
  assert.match(workflow, /coordinated-release-prepare\\\.yml/);
  assert.match(workflow, /coordinated-release-trust-recover/);
  assert.match(workflow, /name: coordinated-plugin-candidate[\s\S]*run-id: \$\{\{ inputs\.preparation_run_id \}\}/);
  assert.match(workflow, /name: coordinated-desktop-trusted[\s\S]*run-id: \$\{\{ inputs\.trust_artifact_run_id \}\}/);
  assert.match(workflow, /finalize-hosted/);
  assert.match(workflow, /inspect-hosted/);
  assert.match(workflow, /retention-days: 30/);
  assert.doesNotMatch(workflow, /^\s+environment:|name: release-(?:publication|trust)|secrets\./m);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|gh release create|git push/);
  assert.doesNotMatch(workflow, /codesign|notarytool submit|stapler staple|package-macos/);
});

test('hosted publication separates read-only rehearsal from approved exact-plan mutation', async () => {
  const workflow = await readFile(publicationPath, 'utf8');
  const rehearsalStart = workflow.indexOf('  protected-nonpublishing-rehearsal:');
  const publicationStart = workflow.indexOf('  publish-exact-plan:');
  assert(rehearsalStart >= 0 && publicationStart > rehearsalStart);
  const rehearsal = workflow.slice(rehearsalStart, publicationStart);
  const publication = workflow.slice(publicationStart);
  assert.match(workflow, /group: gatereeve-release-publication-\$\{\{ inputs\.tag \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(rehearsal, /if: \$\{\{ inputs\.mode == 'dry-run' \}\}/);
  assert.match(rehearsal, /environment:\n\s+name: release-publication/);
  assert.doesNotMatch(rehearsal, /deployment:\s*false/);
  assert.match(rehearsal, /permissions:\n\s+actions: read\n\s+contents: read/);
  assert.match(rehearsal, /--dry-run/);
  assert.match(rehearsal, /Dry run must not carry publication approval/);
  assert.match(rehearsal, /run\.conclusion !== "success"/);
  assert.doesNotMatch(rehearsal, /secrets\.|contents: write|pull-requests: write|--confirm|publish-marketplace\.sh/);
  assert.match(publication, /if: \$\{\{ inputs\.mode == 'publish' \}\}/);
  assert.match(publication, /environment:\n\s+name: release-publication/);
  assert.doesNotMatch(publication, /deployment:\s*false/);
  assert.match(publication, /permissions:\n\s+actions: read\n\s+contents: write\n\s+pull-requests: write/);
  assert.match(publication, /GATEREEVE_MARKETPLACE_PUBLISH_URL:/);
  assert.match(publication, /--approved-by "\$APPROVED_BY"/);
  assert.match(publication, /--confirm/);
  assert.match(publication, /run\.conclusion !== "success"/);
  assert.doesNotMatch(publication, /secrets\.|GATEREEVE_DEVELOPER_ID|NOTARY|codesign|notarytool|package-macos/);
  assert((workflow.match(/coordinated-release-finalize\\\.yml/g) ?? []).length === 2);
  assert((workflow.match(/retention-days: 30/g) ?? []).length === 2);
});

test('linked Cask finalization and publication preserve a separate approval boundary', async () => {
  const finalization = await readFile(caskFinalizationPath, 'utf8');
  assert.match(finalization, /^permissions:\n\s+actions: read\n\s+contents: read$/m);
  assert.match(finalization, /primary_publication_run_id:/);
  assert.match(finalization, /direct_install_confirmed_by:/);
  assert.match(finalization, /direct_install_confirmed_at:/);
  assert.match(finalization, /coordinated-release-publish\\\.yml/);
  assert.match(finalization, /run\.conclusion !== "success"/);
  assert.match(finalization, /prepare-cask-hosted/);
  assert.match(finalization, /inspect-cask-hosted/);
  assert.match(finalization, /retention-days: 30/);
  assert.doesNotMatch(finalization, /^\s+environment:|secrets\.|contents: write|pull-requests: write/m);

  const publicationWorkflow = await readFile(caskPublicationPath, 'utf8');
  const rehearsalStart = publicationWorkflow.indexOf('  protected-cask-rehearsal:');
  const publicationStart = publicationWorkflow.indexOf('  publish-exact-cask-plan:');
  assert(rehearsalStart >= 0 && publicationStart > rehearsalStart);
  const rehearsal = publicationWorkflow.slice(rehearsalStart, publicationStart);
  const publication = publicationWorkflow.slice(publicationStart);
  assert.match(publicationWorkflow, /group: gatereeve-cask-publication-\$\{\{ inputs\.tag \}\}/);
  assert.match(rehearsal, /name: release-publication/);
  assert.doesNotMatch(rehearsal, /deployment:\s*false/);
  assert.match(rehearsal, /permissions:\n\s+actions: read\n\s+contents: read/);
  assert.match(rehearsal, /--dry-run/);
  assert.match(rehearsal, /run\.conclusion !== "success"/);
  assert.doesNotMatch(rehearsal, /secrets\.|contents: write|pull-requests: write|--confirm/);
  assert.match(publication, /name: release-publication/);
  assert.doesNotMatch(publication, /deployment:\s*false/);
  assert.match(publication, /GH_TOKEN: \$\{\{ secrets\.GATEREEVE_PUBLICATION_TOKEN \}\}/);
  assert.match(publication, /--approved-by "\$APPROVED_BY"/);
  assert.match(publication, /--confirm/);
  assert.match(publication, /run\.conclusion !== "success"/);
  assert.doesNotMatch(publication, /GATEREEVE_DEVELOPER_ID|NOTARY|codesign|notarytool|package-macos/);
  assert((publicationWorkflow.match(/homebrew-cask-finalize\\\.yml/g) ?? []).length === 2);
  assert((publicationWorkflow.match(/retention-days: 30/g) ?? []).length === 2);
});
