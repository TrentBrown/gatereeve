import assert from 'node:assert/strict';
import test from 'node:test';

import {
  smokeHomebrewCask,
  smokePublicHomebrewCask,
} from '../scripts/smoke-homebrew-cask.mjs';

test('Homebrew smoke rejects a claimed architecture that is not the native process', async () => {
  const wrongArchitecture = process.arch === 'x64' ? 'arm64' : 'x64';
  await assert.rejects(
    smokeHomebrewCask({
      recordPath: '/not/read/because/architecture/is/rejected.json',
      platform: 'darwin',
      architecture: wrongArchitecture,
    }),
    /Expected .* Homebrew host/u,
  );
});

test('public Homebrew smoke rejects a claimed architecture that is not native', async () => {
  const wrongArchitecture = process.arch === 'x64' ? 'arm64' : 'x64';
  await assert.rejects(
    smokePublicHomebrewCask({
      recordPath: '/not/read/because/architecture/is/rejected.json',
      platform: 'darwin',
      architecture: wrongArchitecture,
    }),
    /Expected .* Homebrew host/u,
  );
});
