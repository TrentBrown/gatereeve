import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stageProtocolResources } from '../src/protocol/stage.js';

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await stageProtocolResources({
  sourceRoot: resolve(cliRoot, '../plugin-src/shared/resources'),
  destinationRoot: resolve(cliRoot, 'resources'),
});
