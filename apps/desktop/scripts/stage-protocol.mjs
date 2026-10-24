import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir } from 'node:fs/promises';

import { helperTree } from '../../../plugin-src/shared/resources/protocol/python-guards.js';

import { stageProtocolResources } from '../../../cli/src/protocol/stage.js';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await stageProtocolResources({
  sourceRoot: resolve(desktopRoot, '../../plugin-src/shared/resources'),
  destinationRoot: resolve(desktopRoot, 'resources'),
  manifestName: 'desktop-projection.json',
  includePaths: [
    'protocol',
    'release',
    ...(await helperTree(resolve(desktopRoot, '../../plugin-src/shared/resources/scripts'))).map(([path]) => `scripts/${path}`),
  ],
});

const pluginSourceRoot = resolve(desktopRoot, '../../plugin-src');
const stagedPluginRoot = resolve(desktopRoot, 'resources/plugins');
for (const [pluginId, source] of [
  ['whiteboard-test', resolve(pluginSourceRoot, 'plugins/whiteboard-test/shared/resources/whiteboard-test')],
]) {
  const target = resolve(stagedPluginRoot, pluginId, 'resources', 'whiteboard-test');
  await mkdir(resolve(target, '..'), { recursive: true });
  await cp(source, target, { recursive: true, force: false });
}
