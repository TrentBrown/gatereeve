import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function portableRelativePath(path, label) {
  assert(typeof path === 'string' && path.length > 0, `${label} must be non-empty`);
  assert(!isAbsolute(path), `${label} must be relative`);
  assert(!path.includes('\\'), `${label} must use forward slashes`);
  assert(!path.split('/').includes('..'), `${label} must not escape its root`);
}

export function validateMarketplacePluginRegistry(value) {
  assert(value?.schemaVersion === 1, 'Marketplace plugin registry schemaVersion must be 1');
  assert(typeof value.marketplace === 'string' && value.marketplace, 'Marketplace identity is required');
  assert(Array.isArray(value.plugins) && value.plugins.length > 0, 'Marketplace plugin registry is empty');

  const ids = new Set();
  const sourceRoots = new Set();
  for (const plugin of value.plugins) {
    assert(typeof plugin?.id === 'string' && plugin.id, 'Registered plugin ID is required');
    assert(!ids.has(plugin.id), `Duplicate registered plugin ID: ${plugin.id}`);
    portableRelativePath(plugin.sourceRoot, `${plugin.id} sourceRoot`);
    assert(!sourceRoots.has(plugin.sourceRoot), `Duplicate plugin sourceRoot: ${plugin.sourceRoot}`);
    assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(plugin.initialVersion), `${plugin.id} initialVersion is invalid`);
    assert(typeof plugin.requiresSessionStartHook === 'boolean', `${plugin.id} requiresSessionStartHook must be boolean`);
    ids.add(plugin.id);
    sourceRoots.add(plugin.sourceRoot);
  }

  return value;
}

export async function loadMarketplacePluginRegistry(sourceRoot) {
  const root = resolve(sourceRoot);
  const value = JSON.parse(
    await readFile(resolve(root, 'contracts/marketplace-plugins.json'), 'utf8')
  );
  return validateMarketplacePluginRegistry(value);
}
