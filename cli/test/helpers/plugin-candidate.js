import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { writePluginCandidateIntegrity } from '../../src/plugin/plugin-candidate-integrity.js';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writePluginCandidateFixture({ root, source }) {
  const sharedContent = 'shared fixture\n';
  const sharedInventory = {
    schemaVersion: 1,
    files: [{
      path: 'resources/shared.txt',
      type: 'file',
      size: Buffer.byteLength(sharedContent),
      sha256: sha256(sharedContent),
    }],
  };
  await writeJson(join(root, '.agents/plugins/marketplace.json'), {
    name: 'quality-code',
    plugins: [{
      name: 'agentic-development-workflow',
      source: { source: 'local', path: './plugins/codex/agentic-development-workflow' },
    }],
  });
  await writeJson(join(root, '.claude-plugin/marketplace.json'), {
    name: 'quality-code',
    plugins: [{
      name: 'agentic-development-workflow',
      source: './plugins/claude/agentic-development-workflow',
    }],
  });
  for (const platform of ['codex', 'claude']) {
    const packageRoot = join(root, 'plugins', platform, 'agentic-development-workflow');
    await writeJson(
      join(packageRoot, platform === 'codex' ? '.codex-plugin/plugin.json' : '.claude-plugin/plugin.json'),
      { name: 'agentic-development-workflow', version: source.tag.slice(1), skills: './skills/' },
    );
    await writeJson(join(packageRoot, 'hooks/hooks.json'), {
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node session.js' }] }] },
    });
    await writeJson(join(packageRoot, '.workflow-build/provenance.json'), {
      platform,
      version: source.tag.slice(1),
      sourceTag: source.tag,
      sourceCommit: source.commit,
    });
    await writeJson(join(packageRoot, '.workflow-build/shared-files.json'), sharedInventory);
    await mkdir(join(packageRoot, 'resources'), { recursive: true });
    await writeFile(join(packageRoot, 'resources/shared.txt'), sharedContent);
  }
  await writeJson(join(root, 'RELEASE.json'), {
    schemaVersion: 1,
    plugin: 'agentic-development-workflow',
    marketplace: 'quality-code',
    version: source.tag.slice(1),
    sourceTag: source.tag,
    sourceCommit: source.commit,
    ubuntuRcEvidence: null,
  });
  const integrityPath = join(root, '..', 'plugin-integrity.json');
  await writePluginCandidateIntegrity({
    pluginRoot: root,
    integrityPath,
    sourceTag: source.tag,
    sourceCommit: source.commit,
  });
  return integrityPath;
}
