// @ts-check

import { build } from 'esbuild';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultDesktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build the browser-facing Markdown pipeline without exposing node_modules to
 * the renderer protocol or packaged application.
 *
 * @param {{desktopRoot?: string}} [options]
 */
export async function buildRenderer(options = {}) {
  const desktopRoot = resolve(options.desktopRoot ?? defaultDesktopRoot);
  const outputPath = resolve(
    desktopRoot,
    'renderer',
    'generated',
    'markdown-renderer.js',
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await build({
    absWorkingDir: desktopRoot,
    bundle: true,
    charset: 'utf8',
    entryPoints: ['renderer/markdown-source.js'],
    format: 'esm',
    legalComments: 'none',
    logLevel: 'silent',
    outfile: outputPath,
    // `neutral` keeps the parser's deterministic character-entity table. The
    // package's browser condition initializes a scratch element at module load,
    // which would make the otherwise document-injected bundle untestable in
    // Node before a fixture DOM exists.
    platform: 'neutral',
    sourcemap: false,
    target: ['es2022'],
  });
  return Object.freeze({
    bytes: (await stat(outputPath)).size,
    outputPath,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await buildRenderer();
  process.stdout.write(`Built renderer Markdown bundle (${result.bytes} bytes).\n`);
}
