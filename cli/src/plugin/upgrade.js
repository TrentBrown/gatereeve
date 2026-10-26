import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir, rename, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { defaultRunner } from './smoke.js';

const assert = (condition, reason) => { if (!condition) throw new Error(reason); };
async function inventory(root) {
  assert((await lstat(root)).isDirectory() && !(await lstat(root)).isSymbolicLink(), 'Package root must be a regular directory');
  const files = [];
  async function visit(directory, prefix = '') {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = prefix + entry.name, full = join(directory, entry.name);
      if (entry.isDirectory()) await visit(full, `${path}/`);
      else {
        assert(entry.isFile(), `Package contains an unsupported link or file: ${path}`);
        files.push([path, createHash('sha256').update(await readFile(full)).digest('hex'), (await lstat(full)).mode & 0o111]);
      }
    }
  }
  await visit(root);
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

// Native managers own installation and enablement. This coordinator observes
// before retrying each idempotent step, and never edits host configuration or
// restarts a session. The receipt is a recovery journal, not activation proof.
export async function upgradePlugin({ platform, pluginId = 'agentic-development-workflow', version,
  expectedPackage, receiptPath, environment = process.env, runner = defaultRunner }) {
  assert(['codex', 'claude'].includes(platform), 'Select a supported plugin host');
  assert(/^[a-z0-9][a-z0-9-]+$/u.test(pluginId) && typeof version === 'string' && version.length, 'Invalid package identity');
  const qualified = `${pluginId}@quality-code`, executable = platform === 'codex' ? 'codex' : 'claude';
  const packageRoot = resolve(expectedPackage), destination = resolve(receiptPath);
  const manifest = JSON.parse(await readFile(join(packageRoot, platform === 'codex' ? '.codex-plugin/plugin.json' : '.claude-plugin/plugin.json'), 'utf8'));
  assert(manifest.version === version && manifest.name === pluginId, 'Expected package manifest differs from the requested identity');
  const expectedDigest = await inventory(packageRoot);
  const identity = { platform, pluginId, version, expectedDigest };
  let previous = null;
  try { previous = JSON.parse(await readFile(destination, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert(!previous || JSON.stringify(previous.identity) === JSON.stringify(identity), 'Upgrade receipt belongs to another package; use a new receipt path');
  const receipt = previous ?? { schemaVersion: 1, identity, history: [], installed: null, enabled: null,
    activation: { status: 'pending', reason: 'A fresh native session has not been observed.' }, activeSessions: 'preserved' };
  const save = async (phase, detail = null) => {
    receipt.phase = phase; receipt.history.push({ phase, detail, at: new Date().toISOString() });
    await mkdir(dirname(destination), { recursive: true });
    const pending = `${destination}.${randomUUID()}.pending`;
    await writeFile(pending, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(pending, destination);
  };
  const run = args => runner(executable, args, { env: environment });
  const observe = async () => {
    const listed = JSON.parse(await run(['plugin', 'list', '--json']));
    const entry = platform === 'codex' ? listed.installed?.find(item => item.pluginId === qualified)
      : listed.find(item => item.id === qualified);
    const path = entry?.source?.path ?? entry?.installPath;
    const present = (platform !== 'codex' || entry?.installed === true) && entry?.version === version && path;
    receipt.installed = present ? { version, path, digest: await inventory(path) } : null;
    receipt.enabled = entry?.enabled === true;
    return Boolean(present && receipt.installed.digest === expectedDigest);
  };
  try {
    await save('observing');
    if (!await observe()) {
      await save('installing', 'Native manager operation; resume observes the package before retrying.');
      if (platform === 'codex') {
        const catalog = JSON.parse(await run(['plugin', 'marketplace', 'list', '--json']));
        const source = catalog.marketplaces?.find(item => item.name === 'quality-code')?.marketplaceSource?.sourceType;
        assert(['local', 'git'].includes(source), 'Configure a supported quality-code marketplace before upgrading');
        if (source === 'git') await run(['plugin', 'marketplace', 'upgrade', 'quality-code', '--json']);
      } else await run(['plugin', 'marketplace', 'update', 'quality-code']);
      if (platform === 'codex') await run(['plugin', 'add', qualified, '--json']);
      else {
        await run(['plugin', 'install', qualified, '--scope', 'user']);
        await run(['plugin', 'update', qualified, '--scope', 'user']);
      }
      assert(await observe(), 'Native installation does not match the expected package; retained receipt supports recovery');
    }
    if (!receipt.enabled) {
      await save('enabling');
      assert(platform !== 'codex', 'This Codex CLI has no plugin-enable operation. Enable the verified plugin in the host UI, then resume this receipt; active sessions remain unchanged.');
      await run(['plugin', 'enable', qualified, ...(platform === 'codex' ? ['--json'] : ['--scope', 'user'])]);
      assert(await observe() && receipt.enabled, 'Native host did not verify exact package enablement');
    }
    await save('installed-activation-pending');
  } catch (error) {
    await save('needs-attention', error.message.slice(0, 4096));
    error.receipt = receipt; throw error;
  }
  return receipt;
}
