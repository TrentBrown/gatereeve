import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stageProtocolResources } from '../../../cli/src/protocol/stage.js';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await stageProtocolResources({
  sourceRoot: resolve(desktopRoot, '../../plugin-src/shared/resources'),
  destinationRoot: resolve(desktopRoot, 'resources'),
  manifestName: 'desktop-projection.json',
  includePaths: [
    'protocol',
    'scripts/workflow_common.py',
    'scripts/workflow_context.py',
  ],
});
