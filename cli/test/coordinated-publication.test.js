import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  readBoundedText,
  waitForEarlyAccessManifest,
} from '../src/plugin/coordinated-publication.js';

test('waits for the exact production manifest without query or credential leakage', async () => {
  const expected = '{"release":"0.1.0-rc.1"}\n';
  const requests = [];
  let attempt = 0;
  let sleeps = 0;
  const result = await waitForEarlyAccessManifest({
    expected,
    tag: 'v0.1.0-rc.1',
    attempts: 3,
    intervalMilliseconds: 1,
    sleep: async () => {
      sleeps += 1;
    },
    fetchFn: async (url, options) => {
      requests.push({ url, options });
      attempt += 1;
      return new Response(attempt === 1 ? '{}\n' : expected, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(sleeps, 1);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, 'https://gatereeve.pages.dev/releases/desktop.json');
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.referrerPolicy, 'no-referrer');
    assert.equal(new URL(request.url).search, '');
  }
  const digest = createHash('sha256').update(expected).digest('hex');
  assert.equal(
    result.identity,
    `https://gatereeve.pages.dev/releases/desktop.json#${digest} -> https://github.com/TrentBrown/gatereeve/releases/tag/v0.1.0-rc.1`
  );
});

test('bounds streamed website verification responses', async () => {
  await assert.rejects(
    readBoundedText(new Response('x'.repeat(65 * 1024)), 64 * 1024),
    /too large/u
  );
});
