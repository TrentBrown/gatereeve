import { readFile } from 'node:fs/promises';
import { resolveModuleGraph } from '../../../plugin-src/shared/resources/protocol/modules.js';

// Freeze existing boundary/recovery fixtures at the pre-advisory contract.
// New model entry, adoption and formal passage are exercised by advisory.test.js.
export async function loadHistoricalModel(policy = null) {
  const model = JSON.parse(
    await readFile(
      new URL('../fixtures/workflow-model-1.6.json', import.meta.url),
      'utf8'
    )
  );
  if (policy) {
    const graph = resolveModuleGraph({
      definitions: model.moduleGraph.modules,
      policy,
    });
    model.moduleGraph = {
      schemaVersion: graph.schemaVersion,
      policyDigest: graph.policyDigest,
      modules: graph.modules,
      enabledModuleIds: graph.enabledModuleIds,
    };
  }
  return model;
}
