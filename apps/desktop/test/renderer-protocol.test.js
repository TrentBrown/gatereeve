import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { registerRendererProtocol } from '../main/renderer-protocol.js';

test('renderer protocols confine application files and serve only named trusted HTML artifacts', async () => {
  const rendererRoot = await mkdtemp(join(tmpdir(), 'gatereeve-renderer-'));
  const brandingAsset = join(rendererRoot, 'approved-icon.png');
  await writeFile(join(rendererRoot, 'index.html'), '<h1>GateReeve</h1>');
  await writeFile(brandingAsset, Buffer.from([137, 80, 78, 71]));
  const handlers = new Map();
  registerRendererProtocol({ handle(scheme, handler) { handlers.set(scheme, handler); } }, rendererRoot, {
    brandingAsset,
    async readArtifact(id) {
      if (id !== 'attempt:one:gate:explainDiff') throw new Error('unknown');
      return {
        kind: 'artifact',
        data: {
          artifact: { format: 'html' },
          content: '<html><script>document.body.dataset.live="yes"</script><body>Diff</body></html>',
        },
      };
    },
  });
  assert.deepEqual([...handlers.keys()].sort(), ['gatereeve-app', 'gatereeve-artifact']);

  const appResponse = await handlers.get('gatereeve-app')({
    method: 'GET', url: 'gatereeve-app://desktop/index.html',
  });
  assert.equal(appResponse.status, 200);
  assert.equal(appResponse.headers.get('cache-control'), 'no-store');
  assert.match(appResponse.headers.get('content-security-policy'), /frame-src gatereeve-artifact:/);
  assert.equal(await appResponse.text(), '<h1>GateReeve</h1>');
  const brandingResponse = await handlers.get('gatereeve-app')({
    method: 'GET', url: 'gatereeve-app://desktop/branding/gatereeve-rolling-vale.png',
  });
  assert.equal(brandingResponse.status, 200);
  assert.equal(brandingResponse.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await brandingResponse.arrayBuffer()), Buffer.from([137, 80, 78, 71]));
  assert.equal((await handlers.get('gatereeve-app')({
    method: 'GET', url: 'gatereeve-app://desktop/..%2Foutside.txt',
  })).status, 404);

  const artifactResponse = await handlers.get('gatereeve-artifact')({
    method: 'GET',
    url: 'gatereeve-artifact://desktop/attempt%3Aone%3Agate%3AexplainDiff',
  });
  assert.equal(artifactResponse.status, 200);
  assert.equal(artifactResponse.headers.get('content-security-policy'), null);
  assert.match(await artifactResponse.text(), /document\.body\.dataset\.live/);
  assert.equal((await handlers.get('gatereeve-artifact')({
    method: 'GET', url: 'gatereeve-artifact://desktop/unknown',
  })).status, 404);
});
