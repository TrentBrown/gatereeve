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
    'scripts/lint_spec.py',
    'scripts/lint_issues.py',
    'scripts/lint_tracker.py',
    'scripts/pattern_tool.py',
    'scripts/pattern/__init__.py',
    'scripts/pattern/buckets.py',
    'scripts/pattern/git_context.py',
    'scripts/pattern/harvest.py',
    'scripts/pattern/learning_events.py',
    'scripts/pattern/rules.py',
    'scripts/pattern/simple_yaml.py',
    'scripts/pattern/status.py',
    'scripts/merge_verified.py',
    'scripts/workflow_common.py',
    'scripts/workflow_context.py',
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
