import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

function normalizeWhitespace(value) {
  return value.replace(/\\\s*\n/g, ' ').replace(/\s+/g, ' ').trim();
}

test('documents the verified native plugin lifecycle for both managers', async () => {
  const guide = await readFile(resolve(repositoryRoot, 'INSTALL.md'), 'utf8');
  const contracts = JSON.parse(
    await readFile(
      resolve(repositoryRoot, 'plugin-src/contracts/platform-contracts.json'),
      'utf8'
    )
  );
  const normalizedGuide = normalizeWhitespace(guide);

  const requiredCommands = [
    contracts.codex.commands.marketplaceAdd,
    contracts.codex.commands.marketplaceUpdate,
    contracts.codex.commands.marketplaceRemove,
    contracts.codex.commands.pluginInstallOrRefresh,
    contracts.codex.commands.pluginRemove,
    contracts.claudeCode.commands.marketplaceAdd,
    contracts.claudeCode.commands.marketplaceUpdate,
    contracts.claudeCode.commands.marketplaceRemove,
    contracts.claudeCode.commands.pluginInstall,
    contracts.claudeCode.commands.pluginUpdate,
    contracts.claudeCode.commands.pluginRemove,
  ];

  for (const command of requiredCommands) {
    assert.ok(
      normalizedGuide.includes(command.join(' ')),
      `INSTALL.md must document: ${command.join(' ')}`
    );
  }

  for (const heading of [
    'Pause or resume the workflow at any time',
    'Choose your platform and agent',
    'Easy install from a ZIP',
    'Trust the Codex activation hook',
    'Configure the workflow once',
    'Run doctor in each installed agent',
    'Roll back an upgrade',
    'Uninstall',
  ]) {
    assert.match(guide, new RegExp(`^## .*${heading}`, 'm'));
  }

  assert.doesNotMatch(guide, /legacy\/install\.sh/);
  assert.match(guide, /### macOS/);
  assert.match(guide, /### Ubuntu or Ubuntu on WSL/);
  assert.match(guide, /Codex,\s*Claude Code, or both/);
  assert.match(
    guide,
    /claude plugin disable agentic-development-workflow@quality-code --scope user/
  );
  assert.match(
    guide,
    /claude plugin enable agentic-development-workflow@quality-code --scope user/
  );
  assert.match(guide, /Plugins Directory in the Codex desktop application/);
  assert.match(guide, /### Alternative: private Git-backed marketplace/);
  assert.match(
    guide,
    /does not require access to\s+the plugin source repository/
  );
  assert.match(guide, /Unpacking the ZIP does \*\*not\*\* install the plugin/);
  assert.match(
    guide,
    /do not require this exact\s+`~\/\.local\/share\/quality-code` path/
  );
  assert.match(
    guide,
    /Continue with section 5 to perform the separate marketplace\s+registration and plugin installation steps/
  );
  assert.match(guide, /codex plugin marketplace add "\$MARKETPLACE_ROOT"/);
  assert.match(
    guide,
    /claude plugin marketplace add "\$MARKETPLACE_ROOT" --scope user/
  );
  assert.match(guide, /docs\/PLUGIN-SMOKE-TEST\.md/);
  assert.ok(
    normalizedGuide.includes(
      'Do not manually delete plugin caches, create skill symlinks'
    )
  );
});

test('keeps every documented bash block syntactically valid', async () => {
  const documents = await Promise.all([
    readFile(resolve(repositoryRoot, 'INSTALL.md'), 'utf8'),
    readFile(resolve(repositoryRoot, 'docs/PLUGIN-SMOKE-TEST.md'), 'utf8'),
  ]);
  const blocks = documents.flatMap((document) =>
    [...document.matchAll(/```bash\n([\s\S]*?)```/g)].map(
      (match) => match[1].replace(/<[A-Z_]+>/g, 'documented-placeholder')
    )
  );

  assert.ok(blocks.length >= 10, 'expected the install guide command blocks');
  for (const [index, block] of blocks.entries()) {
    const result = spawnSync('bash', ['-n'], {
      input: block,
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `bash block ${index + 1} is invalid: ${result.stderr}`
    );
  }
});

test('connects installation, operational guidance, and visual orientation', async () => {
  const [readme, installGuide, userGuide] = await Promise.all([
    readFile(resolve(repositoryRoot, 'README.md'), 'utf8'),
    readFile(resolve(repositoryRoot, 'INSTALL.md'), 'utf8'),
    readFile(resolve(repositoryRoot, 'USER-GUIDE.md'), 'utf8'),
  ]);

  assert.match(readme, /\[`USER-GUIDE\.md`\]\(USER-GUIDE\.md\)/);
  assert.match(
    installGuide,
    /\[first-feature walkthrough in `USER-GUIDE\.md`\]\(USER-GUIDE\.md#your-first-feature\)/
  );
  assert.match(userGuide, /^# Using the Agentic Development Workflow$/m);
  assert.match(userGuide, /^## Your first feature$/m);
  assert.match(userGuide, /Optional visual orientation/);
  assert.match(userGuide, /\[`workflow site`\]\(workflow-site\/index\.html\)/);
  assert.match(userGuide, /human on the loop/i);
  assert.match(userGuide, /docs\/issues\/<featureId>\//);
  assert.match(userGuide, /Run the workflow PR boundary/);
});
