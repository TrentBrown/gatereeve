import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const workflow = (name) => readFile(resolve(root, '.github/workflows', name), 'utf8');

const phaseFiles = [
  'coordinated-release-prepare.yml',
  'coordinated-release-trust-recover.yml',
  'coordinated-release-finalize.yml',
  'coordinated-release-publish.yml',
  'homebrew-cask-finalize.yml',
  'homebrew-cask-publish.yml',
  'homebrew-cask-smoke.yml',
];

test('release phases are reusable-only production units with no manual dispatch', async () => {
  for (const name of phaseFiles) {
    const source = await workflow(name);
    assert.match(source, /\n  workflow_call:/, name);
    assert.doesNotMatch(source, /\n  workflow_dispatch:/, name);
  }
  assert.match(await workflow('homebrew-cask-smoke.yml'), /\n  pull_request:/);
});

test('protected preparation binds the conductor source and remains publication-free', async () => {
  const source = await workflow('coordinated-release-prepare.yml');
  const conductor = await workflow('release-conductor.yml');
  assert.match(source, /source_commit:[\s\S]*required: true[\s\S]*type: string/);
  for (const secret of [
    'GATEREEVE_DEVELOPER_ID_P12_BASE64',
    'GATEREEVE_DEVELOPER_ID_P12_PASSWORD',
    'GATEREEVE_NOTARY_KEY_P8_BASE64',
  ]) {
    assert.match(source, new RegExp(`${secret}:\\n\\s+required: true`));
  }
  const preparationCall = conductor.slice(
    conductor.indexOf('  prepare-trust:'),
    conductor.indexOf('  recover-trust:'),
  );
  assert.match(preparationCall, /secrets:\n\s+GATEREEVE_DEVELOPER_ID_P12_BASE64: \$\{\{ secrets\.GATEREEVE_DEVELOPER_ID_P12_BASE64 \}\}/);
  assert.match(preparationCall, /GATEREEVE_DEVELOPER_ID_P12_PASSWORD: \$\{\{ secrets\.GATEREEVE_DEVELOPER_ID_P12_PASSWORD \}\}/);
  assert.match(preparationCall, /GATEREEVE_NOTARY_KEY_P8_BASE64: \$\{\{ secrets\.GATEREEVE_NOTARY_KEY_P8_BASE64 \}\}/);
  assert.doesNotMatch(preparationCall, /secrets: inherit/);
  assert.match(source, /ref: \$\{\{ inputs\.source_commit \}\}\n\s+fetch-depth: 0/);
  assert.match(source, /git merge-base --is-ancestor "\$SOURCE_COMMIT" refs\/remotes\/origin\/main/);
  assert.match(source, /environment:\n\s+name: release-trust/);
  assert.match(source, /RUN_ATTEMPT !== '1'/);
  assert.match(source, /name: coordinated-plugin-candidate\n\s+path: \$\{\{ runner\.temp \}\}\/coordinated-plugin-candidate\n\s+include-hidden-files: true/);
  assert.match(source, /GateReeve\.app\.tar/);
  assert.match(source, /runner: macos-15-intel/);
  assert.match(source, /aggregate-native-trust\.js/);
  assert.doesNotMatch(source, /release-publication|contents: write|pull-requests: write/);
});

test('bounded recovery reuses retained trust bytes without signing authority', async () => {
  const source = await workflow('coordinated-release-trust-recover.yml');
  const conductor = await workflow('release-conductor.yml');
  assert.match(source, /GATEREEVE_NOTARY_KEY_P8_BASE64:\n\s+required: true/);
  const recoveryCall = conductor.slice(
    conductor.indexOf('  recover-trust:'),
    conductor.indexOf('  trusted-evidence:'),
  );
  assert.match(recoveryCall, /secrets:\n\s+GATEREEVE_NOTARY_KEY_P8_BASE64: \$\{\{ secrets\.GATEREEVE_NOTARY_KEY_P8_BASE64 \}\}/);
  assert.doesNotMatch(recoveryCall, /DEVELOPER_ID|secrets: inherit/);
  assert.match(source, /release-conductor\\\.yml/);
  assert.match(source, /\["success", "failure"\]\.includes\(run\.conclusion\)/);
  assert.match(source, /notarytool history/);
  assert.match(source, /reconcile-notarization-history\.mjs/);
  assert.match(source, /submitted\/GateReeve-/);
  assert.match(source, /runner: macos-15-intel/);
  assert.doesNotMatch(source, /GATEREEVE_DEVELOPER_ID_P12|security import|package-macos\.mjs/);
  assert.doesNotMatch(source, /release-publication|contents: write|pull-requests: write/);
});

test('finalization and rehearsals are read-only while publication retains its own gate', async () => {
  const conductor = await workflow('release-conductor.yml');
  const finalization = await workflow('coordinated-release-finalize.yml');
  assert.match(finalization, /release-conductor\\\.yml/);
  assert.match(finalization, /finalize-hosted/);
  assert.match(finalization, /include-hidden-files: true/);
  assert.doesNotMatch(finalization, /^\s+environment:|contents: write|pull-requests: write/m);

  const primaryRehearsalCall = conductor.slice(
    conductor.indexOf('  primary-rehearse:'),
    conductor.indexOf('  primary-rehearsed-state:'),
  );
  assert.match(primaryRehearsalCall, /mode: dry-run/);
  assert.match(
    primaryRehearsalCall,
    /permissions:\n\s+actions: read\n\s+contents: write\n\s+pull-requests: write/,
    'the caller must admit the reusable workflow publication job during GitHub graph validation',
  );

  for (const name of ['coordinated-release-publish.yml', 'homebrew-cask-publish.yml']) {
    const source = await workflow(name);
    const rehearsalStart = source.indexOf(name.startsWith('coordinated')
      ? '  protected-nonpublishing-rehearsal:'
      : '  protected-cask-rehearsal:');
    const publicationStart = source.indexOf(name.startsWith('coordinated')
      ? '  publish-exact-plan:'
      : '  publish-exact-cask-plan:');
    assert(rehearsalStart >= 0 && publicationStart > rehearsalStart);
    const rehearsal = source.slice(rehearsalStart, publicationStart);
    const publication = source.slice(publicationStart);
    assert.match(rehearsal, /mode == 'dry-run'/);
    assert.match(rehearsal, /--dry-run/);
    assert.doesNotMatch(rehearsal, /environment:|secrets\.|contents: write|--confirm/);
    assert.match(publication, /mode == 'publish'/);
    assert.match(publication, /environment:\n\s+name: release-publication/);
    assert.match(publication, /--approved-by "\$APPROVED_BY"/);
    assert.match(publication, /--confirm/);
  }
});

test('Cask finalization and smoke bind conductor runs and exact public artifacts', async () => {
  const finalization = await workflow('homebrew-cask-finalize.yml');
  assert.match(finalization, /release-conductor\\\.yml/);
  assert.match(finalization, /direct_install_confirmed_by:/);
  assert.match(finalization, /direct_install_confirmed_at:/);
  assert.match(finalization, /prepare-cask-hosted/);
  assert.doesNotMatch(finalization, /^\s+environment:|contents: write|pull-requests: write/m);

  const smoke = await workflow('homebrew-cask-smoke.yml');
  assert.equal((smoke.match(/linked-homebrew-cask-result/g) ?? []).length, 2);
  assert.equal((smoke.match(/actions\/download-artifact@v8/g) ?? []).length, 2);
  assert.equal((smoke.match(/release-conductor\\\.yml/g) ?? []).length, 2);
  assert.equal((smoke.match(/homebrew-cask-publish\\\.yml/g) ?? []).length, 2);
  assert.equal((smoke.match(/GITHUB_EVENT_NAME === "pull_request"/g) ?? []).length, 2);
  assert.match(smoke, /runner: macos-15\n/);
  assert.match(smoke, /runner: macos-15-intel/);
  assert.match(smoke, /--public-tap/);
});

test('Release Conductor is the sole start/resume entry point and derives every phase identity', async () => {
  const source = await workflow('release-conductor.yml');
  assert.match(source, /^name: Release Conductor\nrun-name: Release Conductor[^\n]+\n\non:\n  workflow_dispatch:/);
  assert.match(source, /options:\n\s+- start\n\s+- resume/);
  assert.match(source, /direct_install_confirmed:/);
  assert.match(source, /git\/ref\/tags\/\$RELEASE_TAG/);
  assert.match(source, /plugin-src\/codex\/\.codex-plugin\/plugin\.json/);
  assert.match(source, /plugin-src\/claude\/\.claude-plugin\/plugin\.json/);
  for (const name of phaseFiles) {
    assert.match(source, new RegExp(name.replace('.', '\\\.')));
  }
  for (const stage of [
    'INITIALIZED', 'TRUST_PENDING', 'TRUSTED', 'PRIMARY_FINALIZED',
    'PRIMARY_REHEARSED', 'PRIMARY_PUBLISHED', 'WAITING_FOR_DIRECT_INSTALL',
    'CASK_FINALIZED', 'CASK_REHEARSED', 'CASK_PUBLISHED', 'SMOKE_VERIFIED', 'COMPLETE',
  ]) {
    assert.match(source, new RegExp(`stage: ${stage}`));
  }
  assert.match(source, /plugin release conductor discover/);
  assert.match(source, /No Release Conductor state exists/);
  assert.match(source, /new Date\(\)\.toISOString\(\)/);
  assert.match(source, /record-failure:/);
  assert.match(source, /use conductor resume/i);
  const resumeDiscovery = source.slice(
    source.indexOf('  discover:'),
    source.indexOf('  trust-pending:'),
  );
  assert.match(resumeDiscovery, /test "\$DISPATCH_REF" = "refs\/heads\/main"/);
  assert.match(
    resumeDiscovery,
    /test "\$\(git rev-parse HEAD\)" = "\$\(git rev-parse refs\/remotes\/origin\/main\)"/,
  );
});

test('state checkpoint action always emits a dashboard and immutable retained artifact', async () => {
  const source = await readFile(
    resolve(root, '.github/actions/release-conductor-record/action.yml'),
    'utf8',
  );
  assert.match(source, /plugin release conductor advance/);
  assert.match(source, /release-summary\.md.*GITHUB_STEP_SUMMARY/s);
  assert.match(source, /actions\/upload-artifact@v7/);
  assert.match(source, /retention-days: 30/);
  assert.match(source, /release-state-chain\.json/);
  assert.match(source, /mktemp -d .*release-conductor-state-\$STAGE-XXXXXX/);
  assert.match(source, /path: \$\{\{ steps\.record\.outputs\.output_directory \}\}/);
});

test('full product CI ignores only the sealed Desktop metadata transport path', async () => {
  const source = await workflow('plugin-ci.yml');
  const ignored = source.match(/pull_request:\n\s+paths-ignore:\n((?:\s+- [^\n]+\n)+)/u)?.[1] ?? '';
  assert.equal(ignored.trim(), '- "workflow-site/releases/desktop.json"');
  assert.doesNotMatch(source, /paths-ignore:[\s\S]*Casks|paths-ignore:[\s\S]*workflow-site\/\*\*/);
});

test('PR automation reduces only chained review-artifact updates and cancels only PR work', async () => {
  const pluginCi = await workflow('plugin-ci.yml');
  const caskSmoke = await workflow('homebrew-cask-smoke.yml');
  const scopeAction = await readFile(
    resolve(root, '.github/actions/pr-ci-scope/action.yml'),
    'utf8',
  );
  for (const source of [pluginCi, caskSmoke]) {
    assert.match(source, /github\.event\.pull_request\.number \|\| github\.run_id/);
    assert.match(source, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
    assert.match(source, /uses: \.\/\.github\/actions\/pr-ci-scope/);
    assert.match(source, /needs: ci-scope/);
    assert.match(source, /needs\.ci-scope\.outputs\.scope == 'full'/);
  }
  assert.match(pluginCi, /Review artifact validation/);
  assert.match(pluginCi, /gate_triage\.py/);
  assert.match(pluginCi, /executePluginRequest/);
  assert.match(pluginCi, /docker\/setup-buildx-action@v4/);
  assert.match(pluginCi, /docker\/build-push-action@v7/);
  assert.match(pluginCi, /cache-to: type=gha,mode=max/);
  assert.match(scopeAction, /EVENT_ACTION.*github\.event\.action/);
  assert.match(scopeAction, /git merge-base --is-ancestor/);
  assert.match(scopeAction, /head_sha=\$BEFORE_SHA&status=success/);
  assert.match(scopeAction, /scope=review-artifacts/);
  assert.doesNotMatch(scopeAction, /pull_request_target/);
});

test('all GitHub workflows use Node-24-compatible official action majors and Node 24 jobs', async () => {
  const names = await readdir(resolve(root, '.github/workflows'));
  for (const name of names.filter((item) => item.endsWith('.yml'))) {
    const source = await workflow(name);
    assert.doesNotMatch(source, /actions\/(?:checkout|setup-node|upload-artifact)@v4/);
    assert.doesNotMatch(source, /actions\/download-artifact@v4/);
    assert.doesNotMatch(source, /node-version: (?:22|23)/);
  }
});
