// @ts-check

import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { hashProviderExecutable, hashProviderManifest } from '../main/module-providers.js';

const defaultDesktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROVIDERS = Object.freeze([
  {
    id: 'gatereeve/release-conductor',
    manifest: 'gatereeve-release-conductor.json',
  },
]);

export async function buildInstalledProviders({ desktopRoot = defaultDesktopRoot } = {}) {
  const root = resolve(desktopRoot);
  const allowlistPath = resolve(root, 'main/provider-allowlist.json');
  const allowlist = JSON.parse(await readFile(allowlistPath, 'utf8'));
  for (const descriptor of PROVIDERS) {
    const manifestPath = resolve(root, 'main/providers', descriptor.manifest);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const entrypoint = resolve(dirname(manifestPath), manifest.executable);
    await build({
      absWorkingDir: root,
      bundle: true,
      charset: 'utf8',
      entryPoints: [entrypoint],
      format: 'esm',
      legalComments: 'none',
      logLevel: 'silent',
      outfile: entrypoint,
      platform: 'node',
      sourcemap: false,
      target: ['node22'],
      allowOverwrite: true,
    });
    manifest.executableDigest = hashProviderExecutable(await readFile(entrypoint));
    manifest.digest = hashProviderManifest(manifest);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const selector = allowlist.providers.find((item) => (
      item.id === manifest.id && item.version === manifest.version
    ));
    if (!selector || descriptor.id !== manifest.id) {
      throw new Error(`Provider ${descriptor.id} is missing from the packaged allowlist.`);
    }
    selector.digest = manifest.digest;
  }
  await writeFile(allowlistPath, `${JSON.stringify(allowlist, null, 2)}\n`);
  return Object.freeze({ providerCount: PROVIDERS.length });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await buildInstalledProviders();
  process.stdout.write(`Built ${result.providerCount} installed provider bundle.\n`);
}
