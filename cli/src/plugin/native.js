import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function valueAtPath(object, path) {
  return path.split('.').reduce((value, segment) => value?.[segment], object);
}

function requirePaths(object, paths, label) {
  for (const path of paths) {
    const value = valueAtPath(object, path);
    assert(value !== undefined && value !== null && value !== '', `${label} missing ${path}`);
  }
}

function oneSessionStartHandler(hooks, platform) {
  const groups = hooks?.hooks?.SessionStart;
  assert(Array.isArray(groups) && groups.length === 1, `${platform} must define one SessionStart group`);
  const handlers = groups[0]?.hooks;
  assert(Array.isArray(handlers) && handlers.length === 1, `${platform} must define one SessionStart handler`);
  assert(handlers[0].type === 'command', `${platform} SessionStart handler must be a command`);
  return handlers[0];
}

function validateCodexManifest(manifest, inventory, contract) {
  requirePaths(manifest, contract.projectManifestBaseline, 'Codex manifest');
  assert(manifest.name === inventory.plugin.id, 'Codex manifest plugin identity mismatch');
  assert(manifest.version === inventory.plugin.initialVersion, 'Codex manifest version mismatch');
  assert(manifest.skills === './skills/', 'Codex manifest must declare ./skills/');
  assert(!Object.hasOwn(manifest, 'hooks'), 'Codex manifest must use default hook discovery');
}

function validateRegisteredManifest(manifest, plugin, contract, platform) {
  requirePaths(manifest, contract.projectManifestBaseline, `${platform} manifest`);
  assert(manifest.name === plugin.id, `${platform} manifest plugin identity mismatch for ${plugin.id}`);
  assert(manifest.version === plugin.initialVersion, `${platform} manifest version mismatch for ${plugin.id}`);
  assert(manifest.skills === './skills/', `${platform} manifest must declare ./skills/ for ${plugin.id}`);
  assert(!Object.hasOwn(manifest, 'hooks'), `${platform} manifest must use default hook discovery`);
}

function validateClaudeManifest(manifest, inventory, contract) {
  requirePaths(manifest, contract.projectManifestBaseline, 'Claude manifest');
  assert(manifest.name === inventory.plugin.id, 'Claude manifest plugin identity mismatch');
  assert(manifest.version === inventory.plugin.initialVersion, 'Claude manifest version mismatch');
  assert(manifest.skills === './skills/', 'Claude manifest must declare ./skills/');
  assert(!Object.hasOwn(manifest, 'hooks'), 'Claude manifest must use default hook discovery');
}

export function validateNativeData({ inventory, platforms, codex, claude, registry = null, pluginSources = {} }) {
  validateCodexManifest(codex.manifest, inventory, platforms.codex);
  validateClaudeManifest(claude.manifest, inventory, platforms.claudeCode);
  assert(codex.manifest.name === claude.manifest.name, 'Native plugin identities differ');
  assert(codex.manifest.version === claude.manifest.version, 'Native plugin versions differ');

  const codexHandler = oneSessionStartHandler(codex.hooks, 'Codex');
  assert(
    codexHandler.command === platforms.codex.hookCommandForm,
    'Codex hook command differs from the platform contract'
  );
  const claudeHandler = oneSessionStartHandler(claude.hooks, 'Claude');
  assert(
    claudeHandler.command === platforms.claudeCode.hookCommandForm.command,
    'Claude hook executable differs from the platform contract'
  );
  assert(
    JSON.stringify(claudeHandler.args) ===
      JSON.stringify(platforms.claudeCode.hookCommandForm.args),
    'Claude hook arguments differ from the platform contract'
  );

  for (const [platform, catalog, contract] of [
    ['Codex', codex.catalog, platforms.codex],
    ['Claude', claude.catalog, platforms.claudeCode],
  ]) {
    requirePaths(catalog, contract.catalogRequiredRootFields, `${platform} marketplace`);
    assert(catalog.name === platforms.variables.marketplace, `${platform} marketplace identity mismatch`);
    assert(Array.isArray(catalog.plugins) && catalog.plugins.length > 0, `${platform} marketplace must contain plugins`);
    const catalogIds = catalog.plugins.map((plugin) => plugin.name);
    if (registry) {
      const expectedIds = registry.plugins.map((plugin) => plugin.id);
      assert(JSON.stringify(catalogIds) === JSON.stringify(expectedIds), `${platform} marketplace plugin identities mismatch`);
    } else {
      assert(catalogIds.includes(inventory.plugin.id), `${platform} marketplace plugin identity mismatch`);
    }
    for (const plugin of catalog.plugins) {
      requirePaths(plugin, contract.catalogRequiredPluginFields, `${platform} marketplace plugin`);
    }
  }
  const codexWorkflow = codex.catalog.plugins.find((plugin) => plugin.name === inventory.plugin.id);
  const claudeWorkflow = claude.catalog.plugins.find((plugin) => plugin.name === inventory.plugin.id);
  assert(
    JSON.stringify(codexWorkflow.source) ===
      JSON.stringify(platforms.codex.catalogPackageSource),
    'Codex marketplace source differs from the release contract'
  );
  assert(
    claudeWorkflow.source === platforms.claudeCode.catalogPackageSource,
    'Claude marketplace source differs from the release contract'
  );

  if (registry) {
    assert(registry.marketplace === platforms.variables.marketplace, 'Plugin registry marketplace identity mismatch');
    for (const plugin of registry.plugins) {
      const codexEntry = codex.catalog.plugins.find((entry) => entry.name === plugin.id);
      const claudeEntry = claude.catalog.plugins.find((entry) => entry.name === plugin.id);
      assert(codexEntry.source?.path === `./plugins/codex/${plugin.id}`, `Codex marketplace source mismatch for ${plugin.id}`);
      assert(claudeEntry.source === `./plugins/claude/${plugin.id}`, `Claude marketplace source mismatch for ${plugin.id}`);
      if (plugin.id !== inventory.plugin.id) {
        const source = pluginSources[plugin.id];
        assert(source, `Native sources missing registered plugin ${plugin.id}`);
        validateRegisteredManifest(source.codexManifest, plugin, platforms.codex, 'Codex');
        validateRegisteredManifest(source.claudeManifest, plugin, platforms.claudeCode, 'Claude');
        assert(
          source.codexManifest.version === source.claudeManifest.version,
          `Native plugin versions differ for ${plugin.id}`
        );
      }
    }
  }

  return {
    schemaVersion: 1,
    plugin: inventory.plugin.id,
    plugins: registry?.plugins.map((plugin) => plugin.id) ?? [inventory.plugin.id],
    version: inventory.plugin.initialVersion,
    marketplace: platforms.variables.marketplace,
    platforms: ['codex', 'claude'],
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function loadAndValidateNativeSources(sourceRoot) {
  const root = resolve(sourceRoot);
  const [inventory, platforms, registry, codexManifest, codexHooks, codexCatalog, claudeManifest, claudeHooks, claudeCatalog] = await Promise.all([
    readJson(resolve(root, 'contracts/workflow-inventory.json')),
    readJson(resolve(root, 'contracts/platform-contracts.json')),
    readJson(resolve(root, 'contracts/marketplace-plugins.json')),
    readJson(resolve(root, 'codex/.codex-plugin/plugin.json')),
    readJson(resolve(root, 'codex/hooks/hooks.json')),
    readJson(resolve(root, 'catalogs/codex/marketplace.json')),
    readJson(resolve(root, 'claude/.claude-plugin/plugin.json')),
    readJson(resolve(root, 'claude/hooks/hooks.json')),
    readJson(resolve(root, 'catalogs/claude/marketplace.json')),
  ]);

  const pluginSources = {};
  for (const plugin of registry.plugins) {
    if (plugin.sourceRoot === '.') continue;
    const pluginRoot = resolve(root, plugin.sourceRoot);
    pluginSources[plugin.id] = {
      codexManifest: await readJson(resolve(pluginRoot, 'codex/.codex-plugin/plugin.json')),
      claudeManifest: await readJson(resolve(pluginRoot, 'claude/.claude-plugin/plugin.json')),
    };
  }

  return validateNativeData({
    inventory,
    platforms,
    registry,
    pluginSources,
    codex: { manifest: codexManifest, hooks: codexHooks, catalog: codexCatalog },
    claude: { manifest: claudeManifest, hooks: claudeHooks, catalog: claudeCatalog },
  });
}
