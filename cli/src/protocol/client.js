import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ADAPTER_CANDIDATES = [
  new URL('../../resources/protocol/plugin-adapter.js', import.meta.url),
  new URL('../../../plugin-src/shared/resources/protocol/plugin-adapter.js', import.meta.url),
];

let adapterPromise = null;

async function findAdapter() {
  for (const candidate of ADAPTER_CANDIDATES) {
    try {
      await access(fileURLToPath(candidate));
      return candidate;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(
    'GateReeve protocol core is missing. Reinstall the CLI or run it from a GateReeve source checkout.'
  );
}

export async function loadProtocolAdapter() {
  adapterPromise ??= findAdapter().then((url) => import(url.href));
  return adapterPromise;
}

export async function executeProtocolRequest(request) {
  const { executePluginRequest } = await loadProtocolAdapter();
  return executePluginRequest(request);
}

export async function readJsonFile(path, label = 'JSON file') {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON (${path}): ${error.message}`);
  }
}
