import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  classifySetupCompatibility,
  validateSetupCompatibility,
} from '../main/setup-compatibility.js';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function metadata() {
  return {
    schemaVersion: 1,
    desktop: { version: '2.0.0' },
    plugin: { id: 'agentic-development-workflow@quality-code', displayName: 'GateReeve Plugin' },
    testedPairs: [
      { desktopVersion: '2.0.0', pluginVersion: '2.0.0', state: 'matched', evidence: 'release-2' },
      { desktopVersion: '2.0.0', pluginVersion: '1.9.0', state: 'compatible', evidence: 'matrix-19-20' },
    ],
  };
}

test('compatibility follows exact project-controlled pairs for all three states', () => {
  assert.equal(classifySetupCompatibility(metadata(), '2.0.0').state, 'matched');
  const compatible = classifySetupCompatibility(metadata(), '1.9.0');
  assert.equal(compatible.state, 'compatible');
  assert.equal(compatible.evidence, 'matrix-19-20');
  assert.match(compatible.recommendation, /Update/);
  assert.equal(classifySetupCompatibility(metadata(), '1.9.1').state, 'incompatible');
  assert.equal(classifySetupCompatibility(metadata(), '2.0.1').state, 'incompatible');
});

test('metadata rejects duplicate, inferred, or contradictory compatibility', () => {
  const value = metadata();
  value.testedPairs.push({ ...value.testedPairs[0] });
  assert.throws(() => validateSetupCompatibility(value), /unique/);
  assert.throws(() => validateSetupCompatibility({
    ...metadata(),
    testedPairs: [{
      desktopVersion: '2.0.0', pluginVersion: '1.9.0', state: 'matched', evidence: 'invalid',
    }],
  }), /invalid/);
});

test('shipped compatibility metadata is synchronized with Desktop identity', async () => {
  const [compatibility, packageJson] = await Promise.all([
    readFile(resolve(desktopRoot, 'shared/setup-compatibility.json'), 'utf8').then(JSON.parse),
    readFile(resolve(desktopRoot, 'package.json'), 'utf8').then(JSON.parse),
  ]);
  assert.equal(validateSetupCompatibility(compatibility).desktop.version, packageJson.version);
});
