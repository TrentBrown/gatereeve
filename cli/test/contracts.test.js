import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  loadAndValidateContracts,
  validateContractData,
} from '../src/plugin/contracts.js';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(repositoryRoot, 'plugin-src');

test('validates the repository contract fixtures', async () => {
  const result = await loadAndValidateContracts(sourceRoot);

  assert.equal(result.skillCount, 27);
  assert.equal(result.plannedSkillCount, 0);
  assert.equal(result.marketplace, 'quality-code');
  assert.deepEqual(result.platforms, ['codex', 'claude']);
});

test('rejects duplicate skills and cross-contract identity drift', async () => {
  const contractsRoot = resolve(sourceRoot, 'contracts');
  const inventory = JSON.parse(
    await readFile(resolve(contractsRoot, 'workflow-inventory.json'), 'utf8')
  );
  const platforms = JSON.parse(
    await readFile(resolve(contractsRoot, 'platform-contracts.json'), 'utf8')
  );
  inventory.skills.push({ ...inventory.skills[0] });
  inventory.plugin.expectedSkillCount += 1;
  assert.throws(
    () => validateContractData({ inventory, platforms }),
    /contains duplicates/
  );

  inventory.skills.pop();
  inventory.plugin.expectedSkillCount -= 1;
  platforms.variables.plugin = 'different-plugin';
  assert.throws(
    () => validateContractData({ inventory, platforms }),
    /does not match workflow inventory/
  );
});
