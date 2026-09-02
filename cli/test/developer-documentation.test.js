import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

function normalized(value) {
  return value.replace(/\\\s*\n/g, ' ').replace(/\s+/g, ' ').trim();
}

async function document(name) {
  return readFile(resolve(repositoryRoot, name), 'utf8');
}

test('routes users, developers, and release maintainers from the root README', async () => {
  const readme = await document('README.md');
  for (const [audience, path] of [
    ['Plugin users', 'INSTALL.md'],
    ['Plugin developers', 'DEVELOPMENT.md'],
    ['Release maintainers', 'RELEASING.md'],
    ['Rollout coordinators', 'docs/PLUGIN-SMOKE-TEST.md'],
    ['Workflow authors', 'plugin-src/shared/resources/policy/WORKFLOW.md'],
  ]) {
    assert.match(readme, new RegExp(`\\*\\*${audience}:\\*\\*[\\s\\S]*${path}`));
  }
});

test('developer guide covers the complete canonical-to-PR lifecycle', async () => {
  const guide = await document('DEVELOPMENT.md');
  for (const heading of [
    'The Development Model',
    'First Safe Change',
    'Repository Reference',
    'Maintainer CLI Reference',
    'Verification Ladder',
    'Developing the Static Site',
    'Troubleshooting',
  ]) {
    assert.match(guide, new RegExp(`^## ${heading}$`, 'm'));
  }
  for (const phrase of [
    'Edit `plugin-src/`',
    'Never edit',
    '`dist/` is ignored',
    '`marketplace` branch is',
    'npm start --prefix cli -- help --recurse',
    'npm start --prefix cli -- plugin validate',
    'npm start --prefix cli -- plugin lint',
    'npm start --prefix cli -- plugin validate-native',
    'npm start --prefix cli -- plugin smoke-install --keep',
    'bash ci/portable-acceptance.sh',
    'workflow-pr-boundary',
  ]) {
    assert.ok(guide.includes(phrase), `DEVELOPMENT.md must include: ${phrase}`);
  }
});

test('release runbook documents only the conductor production interface', async () => {
  const guide = await document('RELEASING.md');
  const oneLine = normalized(guide);
  for (const heading of [
    'Release model',
    '1. Prepare reviewed source',
    '2. Start the release',
    '3. Approve Apple trust',
    '4. Approve primary publication',
    '5. Install and launch the exact public DMG',
    '6. Resume and attest',
    'Status and evidence',
    'Failure and recovery',
    'Post-merge operational acceptance',
    'Release checklist',
  ]) {
    assert.ok(guide.includes(`## ${heading}\n`), `RELEASING.md must include: ${heading}`);
  }
  assert.ok(oneLine.includes('gh workflow run release-conductor.yml'));
  assert.ok(oneLine.includes('-f operation=start'));
  assert.ok(oneLine.includes('-f operation=resume'));
  assert.ok(oneLine.includes('-f direct_install_confirmed=true'));
  assert.match(guide, /only manual production release entry point/);
  assert.match(guide, /Do not dispatch them/);
  assert.match(guide, /release-status\.json/);
  assert.match(guide, /WAITING_FOR_DIRECT_INSTALL/);
  assert.match(guide, /No run\nID, plan digest, confirmer name, or timestamp is copied by hand/);
  assert.doesNotMatch(guide, /gh workflow run (?:coordinated-release|homebrew-cask)/);
  assert.doesNotMatch(guide, /plugin release publish --/);
});

test('Apple release setup is actionable, protected, and team-key only', async () => {
  const guide = await document('APPLE-RELEASE-SETUP.md');
  const releaseGuide = await document('RELEASING.md');
  for (const phrase of [
    'Enroll as an individual',
    'Developer ID Application',
    'fresh CSR for every certificate request',
    'G2 Sub-CA',
    'login → My Certificates',
    'System Defaults',
    'Do not set the Developer ID leaf certificate to **Always Trust**',
    'team API key',
    'individual keys cannot use `notaryTool`',
    'encrypted offline',
    'release-trust',
    'GATEREEVE_DEVELOPER_ID_P12_BASE64',
    'GATEREEVE_NOTARY_KEY_P8_BASE64',
    'bounded trust recovery',
    'does **not** approve publication',
    'GATEREEVE_PUBLICATION_TOKEN',
    'not re-entered for each release',
    'must create a real GitHub environment',
    'An absent pending deployment or deployment record is a blocking custody defect',
  ]) {
    assert.ok(guide.includes(phrase), `Apple setup guide must include: ${phrase}`);
  }
  assert.match(guide, /public\s+state before and after/u);
  assert.match(releaseGuide, /APPLE-RELEASE-SETUP\.md/u);
});

test('keeps developer and release bash examples syntactically valid', async () => {
  const documents = await Promise.all([
    document('DEVELOPMENT.md'),
    document('RELEASING.md'),
    document('APPLE-RELEASE-SETUP.md'),
  ]);
  const blocks = documents.flatMap((contents) =>
    [...contents.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) =>
      match[1].replace(/<[A-Z_]+>/g, 'documented-placeholder')
    )
  );
  assert.ok(blocks.length >= 10, 'expected complete maintainer command examples');
  for (const [index, block] of blocks.entries()) {
    const result = spawnSync('bash', ['-n'], { input: block, encoding: 'utf8' });
    assert.equal(result.status, 0, `maintainer bash block ${index + 1} is invalid: ${result.stderr}`);
  }
});
