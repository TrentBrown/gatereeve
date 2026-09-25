import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ContractError } from './errors.js';

function safeRelative(path, label) {
  if (
    typeof path !== 'string'
    || path === ''
    || isAbsolute(path)
    || path.includes('\\')
    || path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) throw new ContractError(`${label} is not a safe plugin-relative path`);
  return path;
}

async function contained(root, path) {
  const [canonicalRoot, canonicalPath] = await Promise.all([realpath(root), realpath(path)]);
  if (canonicalPath !== canonicalRoot && !canonicalPath.startsWith(`${canonicalRoot}${sep}`)) {
    throw new ContractError('Agent workflow resource escapes its plugin root');
  }
  return canonicalPath;
}

export function createPluginResourceAccess({ pluginRoots }) {
  const roots = new Map(Object.entries(pluginRoots ?? {}).map(([id, path]) => [id, resolve(path)]));

  async function resourcePath({ pluginId, path }) {
    const root = roots.get(pluginId);
    if (!root) throw new ContractError(`Agent workflow plugin is unavailable: ${pluginId}`);
    safeRelative(path, 'Agent workflow resource path');
    return contained(root, resolve(root, path));
  }

  return Object.freeze({
    async loadResource(reference) {
      return readFile(await resourcePath(reference), 'utf8');
    },
    async loadEvaluator({ pluginId, resource, export: exportName }) {
      const path = await resourcePath({ pluginId, path: resource });
      const loaded = await import(pathToFileURL(path).href);
      const evaluator = loaded[exportName];
      if (typeof evaluator !== 'function') {
        throw new ContractError(`Agent workflow evaluator export is unavailable: ${exportName}`);
      }
      return evaluator;
    },
  });
}
