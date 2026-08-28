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

test('release runbook preserves the guarded RC-to-stable lifecycle', async () => {
  const guide = await document('RELEASING.md');
  const oneLine = normalized(guide);

  for (const heading of [
    'Release Model',
    'Release States and Version Actions',
    '1. Prepare the Release Checkout',
    '2. Inspect Current Release State',
    '3. Dry-run the Intended Version',
    '4. Publish a Release Candidate',
    '5. Run Release-Candidate Acceptance on Ubuntu',
    '6. Commit the Stable Evidence',
    '7. Dry-run Stable Promotion',
    '8. Promote the Exact RC',
    '9. Verify and Announce the Deployment',
    'Failure Diagnosis and Recovery',
    'Low-level Release Mechanics',
    'Release Checklist',
  ]) {
    assert.match(guide, new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }

  for (const command of [
    'npm start --prefix cli -- plugin release list',
    'npm start --prefix cli -- plugin release verify',
    'npm start --prefix cli -- plugin release publish --next-rc --dry-run',
    'npm start --prefix cli -- plugin release publish --next-rc',
    'npm start --prefix cli -- plugin release publish --promote --dry-run',
    'npm start --prefix cli -- plugin release publish --promote',
  ]) {
    assert.ok(oneLine.includes(command), `RELEASING.md must document: ${command}`);
  }

  assert.match(guide, /candidateSourceCommit/);
  assert.match(guide, /exact deployed RC commit/);
  assert.match(guide, /Do not create release tags manually/);
  assert.ok(oneLine.includes('not the routine human release interface'));
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
    'release-publication',
    'GATEREEVE_DEVELOPER_ID_P12_BASE64',
    'GATEREEVE_NOTARY_KEY_P8_BASE64',
    'apple_trust=true',
    'does **not** approve publication',
  ]) {
    assert.ok(guide.includes(phrase), `Apple setup guide must include: ${phrase}`);
  }
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

  assert.ok(blocks.length >= 20, 'expected complete maintainer command examples');
  for (const [index, block] of blocks.entries()) {
    const result = spawnSync('bash', ['-n'], {
      input: block,
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `maintainer bash block ${index + 1} is invalid: ${result.stderr}`
    );
  }
});
