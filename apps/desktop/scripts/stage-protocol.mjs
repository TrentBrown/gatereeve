import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir } from 'node:fs/promises';

import { stageProtocolResources } from '../../../cli/src/protocol/stage.js';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await stageProtocolResources({
  sourceRoot: resolve(desktopRoot, '../../plugin-src/shared/resources'),
  destinationRoot: resolve(desktopRoot, 'resources'),
  manifestName: 'desktop-projection.json',
  includePaths: [
    'protocol',
    'release',
    'scripts/pr_context.py',
    'scripts/workflow_common.py',
    'scripts/workflow_context.py',
  ],
});

const pluginSourceRoot = resolve(desktopRoot, '../../plugin-src');
const stagedPluginRoot = resolve(desktopRoot, 'resources/plugins');
for (const [pluginId, source] of [
  ['agentic-development-workflow', resolve(pluginSourceRoot, 'shared/resources/agent-workflows')],
  ['whiteboard-test', resolve(pluginSourceRoot, 'plugins/whiteboard-test/shared/resources/whiteboard-test')],
]) {
  const target = resolve(stagedPluginRoot, pluginId, 'resources', pluginId === 'whiteboard-test' ? 'whiteboard-test' : 'agent-workflows');
  await mkdir(resolve(target, '..'), { recursive: true });
  await cp(source, target, { recursive: true, force: false });
}
